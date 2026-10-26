import test from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { normalize, mergeEntry, matches, reviewQueue, parseBackup, backup, markdown, webUrl, WEEK } from "../archive.js";
import { saveEntries, listEntries, getByUrl, getEntry, editEntry, deleteEntry } from "../db.js";

test("normalizes categories, rejects executable URLs and preserves meaningful fragments", () => {
  const entry = normalize({ url: "https://example.com/#chapter-2", categories: " Work,work, Research ", purpose: "__proto__" });
  assert.deepEqual(entry.categories, ["work", "research"]);
  assert.equal(entry.purpose, "inbox");
  assert.equal(entry.url, "https://example.com/#chapter-2");
  assert.equal(webUrl("javascript:alert(1)"), null);
  assert.throws(() => normalize({ url: "file:///secret" }));
});
test("search spans titles, body, descriptions and categories with combined filters", () => {
  const entry = normalize({ url: "https://example.com", title: "A research paper", text: "Hidden keyword: mitochondria", categories: ["biology"], purpose: "read" });
  assert.equal(matches(entry, "MITOCHONDRIA biology", "biology", "read"), true);
  assert.equal(matches(entry, "mitochondria", "work"), false);
});
test("a recapture keeps custom organisation and the richest saved text", () => {
  const old = normalize({ url: "https://example.com", title: "My custom title", text: "Complete article text", description: "My reason", categories: ["work"], purpose: "reference" });
  const newer = normalize({ url: old.url, title: "Site title", categories: ["ideas"] });
  const merged = mergeEntry(old, newer);
  assert.equal(merged.id, old.id); assert.equal(merged.title, "My custom title"); assert.equal(merged.text, old.text);
  assert.equal(merged.description, "My reason"); assert.equal(merged.purpose, "reference"); assert.deepEqual(merged.categories, ["work", "ideas"]);
});
test("weekly review is capped, oldest first, excluding recent and done entries", () => {
  const now = Date.parse("2026-10-26T12:00:00Z");
  const entries = Array.from({ length: 20 }, (_, index) => normalize({ url: `https://example.com/${index}`, savedAt: new Date(now - (30 - index) * WEEK).toISOString() }));
  entries[0].purpose = "done"; entries[1].reviewedAt = new Date(now).toISOString();
  const queue = reviewQueue(entries, now); assert.equal(queue.length, 10); assert.equal(queue[0].id, entries[2].id);
});
test("backups round-trip text and reject invalid entries before import", () => {
  const entries = [normalize({ url: "https://backup.example", text: "Saved article\nsecond paragraph", categories: ["notes"] })];
  const restored = parseBackup(JSON.parse(backup(entries)));
  assert.equal(restored[0].text, entries[0].text); assert.deepEqual(restored[0].categories, entries[0].categories);
  assert.throws(() => parseBackup({ format: "tab-tinder", version: 99, entries }));
  assert.throws(() => parseBackup({ format: "tab-tinder", version: 2, entries: [...entries, { url: "javascript:bad()" }] }));
  const output = markdown([normalize({ url: "https://example.com", title: "<script>alert(1)</script>", text: "![tracking](https://evil.test/pixel)\n<script>bad</script>" })]);
  assert.ok(output.includes("Source: <https://example.com/>")); assert.ok(!output.includes("<script>")); assert.ok(!output.includes("![tracking]"));
});
test("database retains more than 200 entries, merges concurrent duplicates and projects text only on demand", async () => {
  await saveEntries(Array.from({ length: 205 }, (_, i) => ({ url: `https://retention.test/${i}`, text: `Body ${i}` })));
  await Promise.all([saveEntries([{ url: "https://same.test", categories: ["first"] }]), saveEntries([{ url: "https://same.test", categories: ["second"] }])]);
  assert.equal((await listEntries()).length, 206);
  const record = await getByUrl("https://same.test/"); assert.deepEqual(record.categories, ["first", "second"]);
  const match = await listEntries({ query: "Body 204" }); assert.equal(match.length, 1); assert.equal(match[0].hasText, true); assert.equal("text" in match[0], false);
});
test("legacy migration is idempotent and deletion does not resurrect entries", async () => {
  await saveEntries([{ url: "https://legacy.test", savedAt: "2025-01-01T00:00:00Z" }], true);
  const entry = await getByUrl("https://legacy.test/"); await deleteEntry(entry.id);
  await saveEntries([{ url: "https://legacy.test" }], true);
  assert.equal(await getByUrl("https://legacy.test/"), undefined);
});
test("invalid import leaves all existing records intact; edits preserve body and identity", async () => {
  const before = (await listEntries()).length;
  await assert.rejects(saveEntries([{ url: "https://partial.test" }, { url: "broken" }]));
  assert.equal((await listEntries()).length, before); assert.equal(await getByUrl("https://partial.test/"), undefined);
  const entry = await getByUrl("https://retention.test/0");
  await editEntry(entry.id, { categories: ["edited"], description: "Useful" });
  const edited = await getEntry(entry.id); assert.equal(edited.text, "Body 0"); assert.deepEqual(edited.categories, ["edited"]);
});
