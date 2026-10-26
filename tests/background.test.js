import test from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { getByUrl, listEntries } from "../db.js";

const noop = { addListener() {} };
const stored = {};
let tab, capture, removed, failWrite, changedAfterSave;
globalThis.chrome = {
  runtime: { id: "test", getURL: path => `chrome-extension://test/${path}`, onMessage: noop, onInstalled: noop, onStartup: noop },
  storage: { local: { async get() { return stored; }, async set(data) { Object.assign(stored, data); }, async remove(key) { delete stored[key]; } } },
  alarms: { async get() { return {}; }, onAlarm: noop },
  action: { onClicked: noop, async setBadgeText() {}, async setBadgeBackgroundColor() {}, async setTitle() {} },
  tabs: {
    async get() {
      if (changedAfterSave && await getByUrl(tab.url)) return { ...tab, url: "https://navigated.test" };
      return { ...tab };
    },
    async remove() { assert.ok(await getByUrl(tab.url), "must persist before closing"); removed = true; }
  },
  scripting: { async executeScript() { if (failWrite) throw new Error("Cannot capture"); return [{ result: { ...capture } }]; } }
};
const { archiveTab, migrateLegacy } = await import("../background.js");
function setup(name, extra = {}) {
  tab = { id: 1, url: `https://${name}.test/`, title: name, status: "complete", ...extra };
  capture = { url: tab.url, title: name, text: "Saved text" }; removed = false; failWrite = false; changedAfterSave = false;
  return { tabId: 1, url: tab.url, close: true };
}
test("archive closes only after the committed save", async () => {
  const result = await archiveTab(setup("normal")); assert.equal(result.closed, true); assert.equal(removed, true);
});
test("pinned, audible and dirty-form tabs are saved and kept open", async () => {
  for (const flag of ["pinned", "audible", "dirtyForm"]) {
    const message = setup(flag.toLowerCase(), flag === "dirtyForm" ? {} : { [flag]: true });
    if (flag === "dirtyForm") capture.dirtyForm = true;
    const result = await archiveTab(message); assert.equal(result.closed, false); assert.equal(removed, false); assert.ok(result.warning);
  }
});
test("sleeping tabs are not activated or injected into", async () => {
  const result = await archiveTab(setup("sleeping", { discarded: true })); assert.equal(result.linkOnly, true); assert.equal(result.closed, true);
});
test("private-window tabs cannot be inspected or archived", async () => {
  await assert.rejects(archiveTab(setup("private", { incognito: true })), /Private-window/);
  assert.equal(removed, false);
  assert.equal(await getByUrl(tab.url), undefined);
});
test("legacy cleanup removes supported duplicate copies but retains unsupported records", async () => {
  stored.sessions = [{ savedAt: "2025-01-01", tabs: [{ url: "https://legacy-cleanup.test" }, { url: "opera://settings" }] }];
  await migrateLegacy(stored.sessions);
  assert.deepEqual(stored.sessions[0].tabs, [{ url: "opera://settings" }]);
  stored.sessions = [{ tabs: [{ url: "https://old-deleted.test" }] }];
  await migrateLegacy(stored.sessions);
  assert.equal(stored.sessions, undefined);
});
test("a tab navigating after save is never closed", async () => {
  const message = setup("navigation"); changedAfterSave = true;
  const result = await archiveTab(message); assert.equal(result.closed, false); assert.equal(removed, false);
});
test("a write failure never closes the original tab", async () => {
  const message = setup("storagefailure");
  // An uncloneable capture makes IndexedDB reject the write before closing.
  capture.title = "Bad";
  const original = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function () { throw new Error("Disk full"); };
  try { await assert.rejects(archiveTab(message), /Disk full/); assert.equal(removed, false); }
  finally { IDBObjectStore.prototype.put = original; }
  assert.equal((await listEntries({ query: "storagefailure" })).length, 0);
});
