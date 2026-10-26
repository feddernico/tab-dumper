import { webUrl, WEEK, categories, PURPOSES, parseBackup } from "./archive.js";
import { saveEntries, getEntry, getByUrl, listEntries, editEntry, deleteEntry } from "./db.js";
import { capturePage } from "./capture.js";

const PAGE = chrome.runtime.getURL("archive.html");
const ALARM = "weekly-review";
let queue = Promise.resolve();
let initialized;

async function initialize() {
  if (!initialized) initialized = (async () => {
    const stored = await chrome.storage.local.get(["sessions", "settings"]);
    await migrateLegacy(stored.sessions);
    if (!stored.settings) await chrome.storage.local.set({ settings: { weekly: true, nextReviewAt: Date.now() + WEEK } });
    if (!await chrome.alarms.get(ALARM)) await chrome.alarms.create(ALARM, { periodInMinutes: 60 });
    await updateBadge();
  })().catch(error => { initialized = null; throw error; });
  return initialized;
}

export async function migrateLegacy(sessions) {
  const legacySessions = Array.isArray(sessions) ? sessions : [];
  const legacy = legacySessions.flatMap(session => (Array.isArray(session?.tabs) ? session.tabs : [])
    .filter(tab => webUrl(tab?.url)).map(tab => ({ ...tab, savedAt: session.savedAt })));
  await saveEntries(legacy, true);
  // Only prune supported legacy copies after the migration transaction commits.
  // This also removes old copies of entries users deleted after migrating.
  if (Array.isArray(sessions)) {
    const remaining = sessions.map(session => Array.isArray(session?.tabs)
      ? { ...session, tabs: session.tabs.filter(tab => !webUrl(tab?.url)) } : session)
      .filter(session => !Array.isArray(session?.tabs) || session.tabs.length);
    if (remaining.length) await chrome.storage.local.set({ sessions: remaining });
    else await chrome.storage.local.remove("sessions");
  }
}

async function updateBadge() {
  const { settings } = await chrome.storage.local.get("settings");
  const due = settings?.weekly && Date.now() >= settings.nextReviewAt;
  await chrome.action.setBadgeText({ text: due ? "•" : "" });
  await chrome.action.setBadgeBackgroundColor({ color: "#2780e3" });
  await chrome.action.setTitle({ title: due ? "Time for your weekly tab review" : "Open your tab archive" });
}

async function openArchive() {
  const tabs = await chrome.tabs.query({});
  const existing = tabs.find(tab => tab.url === PAGE);
  if (existing) {
    await chrome.tabs.update(existing.id, { active: true });
    await chrome.windows.update(existing.windowId, { focused: true });
  } else await chrome.tabs.create({ url: PAGE });
}

export async function inspectTab(id, expectedUrl) {
  const tab = await chrome.tabs.get(id);
  if (tab.incognito) throw new Error("Private-window tabs are not supported.");
  if (!webUrl(tab.url) || tab.url !== expectedUrl || tab.pendingUrl) throw new Error("This tab changed or is navigating. Refresh and try again.");
  let capture = { url: tab.url, title: tab.title, capture: "Link only — sleeping or inaccessible page", text: "" };
  if (!tab.discarded && tab.status !== "loading") {
    let timer;
    try {
      const results = await Promise.race([
        chrome.scripting.executeScript({ target: { tabId: id }, func: capturePage }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Capture timed out")), 8000); })
      ]);
      const data = results?.[0]?.result;
      if (data?.url === expectedUrl) capture = data;
    } catch { /* The link is still useful when a page blocks capture. */ }
    finally { clearTimeout(timer); }
  }
  const fresh = await chrome.tabs.get(id);
  if (fresh.url !== expectedUrl || fresh.pendingUrl) throw new Error("The tab navigated while saving. Refresh and try again.");
  return { tab: fresh, capture };
}

export async function archiveTab(message) {
  const { tab, capture } = await inspectTab(message.tabId, message.url);
  await saveEntries([{ ...capture, categories: categories(message.categories), purpose: message.purpose }]);
  const entry = await getByUrl(webUrl(tab.url));
  let warning = "";
  let closed = false;
  if (message.close) {
    try {
      const fresh = await chrome.tabs.get(tab.id);
      if (fresh.url !== tab.url || fresh.pendingUrl) warning = "Saved the original link. The tab changed and was left open.";
      else if (fresh.pinned || fresh.audible || capture.dirtyForm) warning = "Saved. Left open because the tab is pinned, playing audio, or has a possible unsaved edit.";
      else {
        await chrome.tabs.remove(tab.id);
        closed = true;
      }
    } catch { warning = "Saved, but the tab could not be closed (it may already be gone)."; }
  }
  return { entry, closed, warning, linkOnly: !entry.text };
}

async function handle(message) {
  await initialize();
  switch (message.type) {
    case "list": return listEntries(message.filters);
    case "get": return getEntry(message.id);
    case "export": return listEntries({}, true);
    case "tabs": return (await chrome.tabs.query({})).filter(tab => webUrl(tab.url) && !tab.incognito).map(tab => ({
      id: tab.id, windowId: tab.windowId, url: tab.url, title: tab.title || tab.url,
      pinned: tab.pinned, audible: tab.audible, discarded: tab.discarded, lastAccessed: tab.lastAccessed || 0
    }));
    case "preview": return (await inspectTab(message.tabId, message.url)).capture;
    case "archive": return archiveTab(message);
    case "unload": {
      const tab = await chrome.tabs.get(message.tabId);
      if (tab.url !== message.url || tab.pendingUrl || tab.active || tab.pinned || tab.audible) throw new Error("Leave active, pinned, playing or navigating tabs open. Refresh to see their current state.");
      const { capture } = await inspectTab(tab.id, tab.url);
      if (capture.dirtyForm) throw new Error("This page may have unsaved edits. It was left loaded.");
      const fresh = await chrome.tabs.get(tab.id);
      if (fresh.url !== tab.url || fresh.pendingUrl || fresh.active || fresh.pinned || fresh.audible) throw new Error("The tab changed. It was left loaded.");
      await chrome.tabs.discard(tab.id);
      return true;
    }
    case "edit": {
      if (!Object.hasOwn(PURPOSES, message.purpose)) throw new Error("Choose a valid purpose.");
      return editEntry(message.id, { title: String(message.title || "Untitled"), description: String(message.description || ""), categories: categories(message.categories), purpose: message.purpose });
    }
    case "reviewed": return editEntry(message.id, { reviewedAt: new Date().toISOString() });
    case "delete": await deleteEntry(message.id); return true;
    case "restore": {
      const entry = await getEntry(message.id);
      if (!entry || !webUrl(entry.url)) throw new Error("This archived link is unavailable.");
      const open = (await chrome.tabs.query({})).find(tab => tab.url === entry.url && !tab.incognito);
      if (open) {
        await chrome.tabs.update(open.id, { active: true });
        await chrome.windows.update(open.windowId, { focused: true });
      } else await chrome.tabs.create({ url: entry.url });
      return true;
    }
    case "import": return { added: await saveEntries(parseBackup(message.backup)) };
    case "settings": return (await chrome.storage.local.get("settings")).settings;
    case "weekly": {
      const { settings } = await chrome.storage.local.get("settings");
      await chrome.storage.local.set({ settings: { ...settings, weekly: Boolean(message.enabled) } });
      await updateBadge();
      return true;
    }
    case "finish-review": {
      const { settings } = await chrome.storage.local.get("settings");
      await chrome.storage.local.set({ settings: { ...settings, nextReviewAt: Date.now() + WEEK, lastReviewAt: Date.now() } });
      await updateBadge();
      return true;
    }
    default: throw new Error("Unknown archive action.");
  }
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  // Only our own dashboard can operate the archive, never injected page scripts.
  if (sender.id !== chrome.runtime.id || sender.url !== PAGE) return false;
  const task = queue.then(() => handle(message));
  queue = task.catch(() => {});
  task.then(data => reply({ ok: true, data }), error => reply({ ok: false, error: error.message }));
  return true;
});
chrome.action.onClicked.addListener(() => openArchive().catch(console.error));
chrome.runtime.onInstalled.addListener(() => initialize().catch(console.error));
chrome.runtime.onStartup.addListener(() => initialize().then(updateBadge).catch(console.error));
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === ALARM) initialize().then(updateBadge).catch(console.error);
});
initialize().catch(console.error);
