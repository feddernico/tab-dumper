export const PURPOSES = { inbox: "Inbox", read: "Read later", task: "To do", reference: "Reference", done: "Done" };
export const WEEK = 7 * 24 * 60 * 60 * 1000;

export function webUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

export function categories(value) {
  const values = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(values.map(item => String(item).trim().toLowerCase()).filter(Boolean))].slice(0, 30);
}

function date(value, fallback) {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : fallback;
}

export function normalize(input, now = new Date().toISOString()) {
  if (!input || typeof input !== "object" || !webUrl(input.url)) throw new Error("An archive entry has an invalid web address.");
  const text = key => typeof input[key] === "string" ? input[key] : "";
  return {
    id: crypto.randomUUID(), url: webUrl(input.url), title: text("title") || input.url,
    description: text("description"), text: text("text"), excerpt: text("excerpt"),
    categories: categories(input.categories), purpose: Object.hasOwn(PURPOSES, input.purpose) ? input.purpose : "inbox",
    savedAt: date(input.savedAt, now), updatedAt: date(input.updatedAt, now),
    reviewedAt: date(input.reviewedAt, null), capture: text("capture") || "Link only",
    screenshot: /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(input.screenshot || "") ? input.screenshot : null
  };
}

// Re-saving a URL must not overwrite the user's organisation or a richer capture.
export function mergeEntry(existing, incoming) {
  if (!existing) return incoming;
  return {
    ...existing,
    title: existing.title || incoming.title,
    description: existing.description || incoming.description,
    text: incoming.text.length > existing.text.length ? incoming.text : existing.text,
    excerpt: existing.excerpt || incoming.excerpt,
    capture: incoming.text.length > existing.text.length ? incoming.capture : existing.capture,
    screenshot: existing.screenshot || incoming.screenshot,
    categories: categories([...existing.categories, ...incoming.categories]),
    updatedAt: new Date().toISOString()
  };
}

export function matches(entry, query = "", category = "", purpose = "") {
  if (category && !entry.categories.includes(category)) return false;
  if (purpose && entry.purpose !== purpose) return false;
  const haystack = [entry.title, entry.url, entry.description, entry.text, entry.excerpt, ...entry.categories].join(" ").toLowerCase();
  return query.toLowerCase().trim().split(/\s+/).every(word => haystack.includes(word));
}

export function reviewQueue(entries, now = Date.now()) {
  return entries.filter(entry => entry.purpose !== "done" && (!entry.reviewedAt || now - Date.parse(entry.reviewedAt) >= WEEK))
    .sort((a, b) => (Date.parse(a.reviewedAt || a.savedAt) - Date.parse(b.reviewedAt || b.savedAt)) || a.id.localeCompare(b.id)).slice(0, 10);
}

export function parseBackup(data) {
  if (data?.format !== "tab-tinder" || data.version !== 2 || !Array.isArray(data.entries)) {
    throw new Error("Choose a Tab Dumper JSON backup (version 2, including older Tab Tinder backups). Nothing was imported.");
  }
  return data.entries.map(entry => normalize(entry));
}

export function backup(entries) {
  return JSON.stringify({ format: "tab-tinder", version: 2, exportedAt: new Date().toISOString(), entries }, null, 2);
}

export function markdown(entries) {
  // Captured page text is quoted so web content cannot become active Markdown/HTML.
  const escape = value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replace(/([\\`*_{}\[\]#!|])/g, "\\$1");
  return "# Tab archive\n\n" + entries.map(entry => {
    const source = entry.url.replace(/[<>\s]/g, char => encodeURIComponent(char));
    const content = entry.text ? `\n### Saved page text\n\n${escape(entry.text).split("\n").map(line => `> ${line}`).join("\n")}\n` : "";
    return `## ${escape(entry.title.replace(/[\r\n]+/g, " "))}\n\nSource: <${source}>\n\nSaved: ${entry.savedAt}\n\nPurpose: ${PURPOSES[entry.purpose]}\n\nCategories: ${entry.categories.map(escape).join(", ") || "Uncategorised"}\n\n${escape(entry.description)}\n\nCapture: ${escape(entry.capture)}\n${content}`;
  }).join("\n---\n\n");
}
