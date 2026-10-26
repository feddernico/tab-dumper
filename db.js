import { normalize, mergeEntry, matches } from "./archive.js";

let connection;
function database() {
  if (!connection) connection = new Promise((resolve, reject) => {
    const request = indexedDB.open("tab-tinder-archive", 1);
    request.onupgradeneeded = () => {
      const entries = request.result.createObjectStore("entries", { keyPath: "id" });
      entries.createIndex("url", "url", { unique: true });
      request.result.createObjectStore("meta");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { connection = null; reject(request.error); };
  });
  return connection;
}

function result(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transaction(stores, mode, action) {
  const db = await database();
  const tx = db.transaction(stores, mode);
  const completed = new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onabort = () => reject(tx.error || new Error("Archive write was cancelled."));
    tx.onerror = () => {}; // onabort handles the transaction failure.
  });
  try {
    const value = await action(tx);
    await completed;
    return value;
  } catch (error) {
    try { tx.abort(); } catch { /* Already aborted or completed. */ }
    await completed.catch(() => {});
    throw error;
  }
}

export async function saveEntries(entries, migration = false) {
  const normalized = entries.map(entry => normalize(entry));
  return transaction(["entries", "meta"], "readwrite", async tx => {
    if (migration && await result(tx.objectStore("meta").get("legacyMigrated"))) return 0;
    const store = tx.objectStore("entries");
    let added = 0;
    for (const incoming of normalized) {
      const existing = await result(store.index("url").get(incoming.url));
      await result(store.put(mergeEntry(existing, incoming)));
      if (!existing) added++;
    }
    if (migration) await result(tx.objectStore("meta").put(true, "legacyMigrated"));
    return added;
  });
}

export async function getEntry(id) {
  return transaction(["entries"], "readonly", tx => result(tx.objectStore("entries").get(id)));
}

export async function getByUrl(url) {
  return transaction(["entries"], "readonly", tx => result(tx.objectStore("entries").index("url").get(url)));
}

export async function listEntries(filters = {}, full = false) {
  return transaction(["entries"], "readonly", tx => new Promise((resolve, reject) => {
    const entries = [];
    const request = tx.objectStore("entries").openCursor();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return resolve(entries.sort((a, b) => b.savedAt.localeCompare(a.savedAt)));
      const entry = cursor.value;
      if (matches(entry, filters.query, filters.category, filters.purpose)) {
        if (full) entries.push(entry);
        else {
          const { text, screenshot, ...metadata } = entry;
          entries.push({ ...metadata, hasText: Boolean(text), hasScreenshot: Boolean(screenshot) });
        }
      }
      cursor.continue();
    };
  }));
}

export async function editEntry(id, changes) {
  return transaction(["entries"], "readwrite", async tx => {
    const store = tx.objectStore("entries");
    const existing = await result(store.get(id));
    if (!existing) throw new Error("This entry was removed. Refresh the archive.");
    const updated = normalize({ ...existing, ...changes, updatedAt: new Date().toISOString() });
    updated.id = existing.id;
    await result(store.put(updated));
    return updated;
  });
}

export async function deleteEntry(id) {
  return transaction(["entries"], "readwrite", tx => result(tx.objectStore("entries").delete(id)));
}
