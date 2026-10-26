import { PURPOSES, reviewQueue, markdown, backup, parseBackup } from "./archive.js";
import { listEntries, saveEntries } from "./db.js";

const $ = selector => document.querySelector(selector);
const state = { view: "open", tabs: [], entries: [], filtered: [], selected: new Set(), limit: 40, busy: false, settings: {}, detail: null, request: 0, reviewIds: null };
let searchTimer;
async function api(type, data = {}) {
  const response = await chrome.runtime.sendMessage({ type, ...data });
  if (!response?.ok) throw new Error(response?.error || "The extension restarted. Reload this page and try again.");
  return response.data;
}
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function notice(text, error = false) {
  const node = $("#message");
  node.textContent = text; node.classList.toggle("error", error); node.hidden = false;
  clearTimeout(notice.timer);
  notice.timer = setTimeout(() => { node.hidden = true; }, error ? 18000 : 10000);
}
async function run(action) {
  if (state.busy) return;
  state.busy = true; document.body.classList.add("busy");
  try { await action(); } catch (error) { notice(error.message, true); }
  finally { state.busy = false; document.body.classList.remove("busy"); }
}
function purposeOptions(select, all = false) {
  if (!all) select.replaceChildren();
  for (const [value, label] of Object.entries(PURPOSES)) select.add(new Option(label, value));
}
function button(text, className, action) {
  const node = element("button", className, text);
  node.addEventListener("click", () => run(action));
  return node;
}
function domain(url) { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } }
function shortDate(value) { return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }

async function refresh() {
  [state.tabs, state.entries, state.settings] = await Promise.all([api("tabs"), api("list"), api("settings")]);
  const openIds = new Set(state.tabs.map(tab => tab.id));
  state.selected = new Set([...state.selected].filter(id => openIds.has(id)));
  $("#open-count").textContent = state.tabs.length; $("#archive-count").textContent = state.entries.length;
  const current = $("#category-filter").value;
  $("#category-filter").replaceChildren(new Option("All categories", ""));
  [...new Set(state.entries.flatMap(entry => entry.categories))].sort().forEach(category => $("#category-filter").add(new Option(category, category)));
  if ([...$("#category-filter").options].some(option => option.value === current)) $("#category-filter").value = current;
  $("#weekly").checked = state.settings.weekly;
  const due = state.settings.weekly && Date.now() >= state.settings.nextReviewAt;
  $("#review-dot").hidden = !due; $("#review-banner").hidden = !due || state.view === "review";
  await render();
}
async function switchView(view) {
  state.view = view; state.limit = 40; state.selected.clear();
  state.reviewIds = null;
  $("#search").value = ""; $("#category-filter").value = ""; $("#purpose-filter").value = "";
  document.querySelectorAll("[data-view]").forEach(node => {
    node.classList.toggle("active", node.dataset.view === view);
    if (node.dataset.view === view) node.setAttribute("aria-current", "page"); else node.removeAttribute("aria-current");
  });
  await refresh();
}
function selectionState() {
  const eligible = state.filtered.slice(0, state.limit).filter(tab => !tab.pinned && !tab.audible);
  const count = state.selected.size;
  $("#archive-selected").disabled = !count;
  $("#archive-selected").textContent = count ? `Save & close ${count} selected` : "Save & close selected";
  $("#select-all").checked = eligible.length > 0 && eligible.every(tab => state.selected.has(tab.id));
  $("#select-all").indeterminate = eligible.some(tab => state.selected.has(tab.id)) && !$("#select-all").checked;
}
async function render() {
  const request = ++state.request, open = state.view === "open", review = state.view === "review";
  $("#heading").textContent = open ? "Make room for what’s next." : review ? "Keep what still matters." : "Good things, safely set aside.";
  $("#subtitle").textContent = open ? "Save the useful things. Let the tabs go." : review ? "A small weekly habit for a lighter browser and a useful archive." : "A place for your reading, research and unfinished ideas.";
  $("#open-tools").hidden = !open; $("#archive-tools").hidden = open || review; $("#review-tools").hidden = !review;
  $("#category-filter").hidden = open || review; $("#purpose-filter").hidden = open || review; $("#search").disabled = review;
  $("#search").placeholder = open ? "Search open tab titles or links…" : "Search titles, links, saved content or categories…";
  $("#capture-note").hidden = !open; $("#list").setAttribute("aria-busy", "true");
  const query = $("#search").value;
  let items;
  if (open) items = state.tabs.filter(tab => query.toLowerCase().trim().split(/\s+/).every(word => `${tab.title} ${tab.url}`.toLowerCase().includes(word)));
  else if (review) {
    if (!state.reviewIds) state.reviewIds = reviewQueue(state.entries).map(entry => entry.id);
    const dueIds = new Set(reviewQueue(state.entries.filter(entry => state.reviewIds.includes(entry.id))).map(entry => entry.id));
    items = state.reviewIds.map(id => state.entries.find(entry => entry.id === id)).filter(entry => entry && dueIds.has(entry.id));
  }
  else items = await api("list", { filters: { query, category: $("#category-filter").value, purpose: $("#purpose-filter").value } });
  if (request !== state.request) return;
  state.filtered = items;
  $("#result-count").textContent = `${items.length} saved link${items.length === 1 ? "" : "s"}`;
  $("#list-label").textContent = open ? "YOUR OPEN TABS" : review ? "THIS WEEK’S REVIEW" : "YOUR SAVED LINKS";
  $("#list-note").textContent = open ? "All regular windows · pinned & playing tabs protected" : review ? `${items.length} to revisit` : "Newest first · no expiry";
  const list = $("#list"); list.replaceChildren();
  if (!items.length) {
    const empty = element("div", "empty-state");
    empty.append(element("span", "empty-icon", "▤"), element("h2", "", open ? "A little breathing room." : review ? "This review is clear." : state.entries.length ? "No matching links." : "Your next good find belongs here."), element("p", "", open ? "No matching web tabs. Open a page, then refresh." : review ? "Your other saved links remain in the archive. Finish for this week, or return later for another batch." : state.entries.length ? "Try a shorter search or a different category." : "Save a few open tabs to start your collection. You can always reopen them."));
    list.append(empty);
  }
  for (const item of items.slice(0, state.limit)) list.append(open ? openCard(item) : archiveCard(item, review));
  $("#show-more").hidden = items.length <= state.limit; list.setAttribute("aria-busy", "false");
  if (open) selectionState();
}
function cardBase(item, kind) {
  const card = element("article", "tab-card"), icon = element("div", "site-icon", domain(item.url).slice(0, 1).toUpperCase());
  icon.setAttribute("aria-hidden", "true");
  const body = element("div", "card-body"), title = element("h2", "card-title"), link = element("a", "", item.title);
  link.href = item.url; link.target = "_blank"; link.rel = "noopener noreferrer"; title.append(link);
  body.append(element("div", "card-meta", `${domain(item.url)}${kind ? ` · ${kind}` : ""}`), title);
  card.append(icon, body); return { card, body };
}
function openCard(tab) {
  const labels = [tab.discarded ? "Sleeping" : "Open", tab.pinned ? "Pinned" : "", tab.audible ? "Playing audio" : ""].filter(Boolean);
  const { card, body } = cardBase(tab, labels.join(" · "));
  const check = element("input", "tab-select"); check.type = "checkbox"; check.checked = state.selected.has(tab.id); check.disabled = Boolean(tab.pinned || tab.audible);
  check.setAttribute("aria-label", `Select ${tab.title}`);
  check.addEventListener("change", () => { if (check.checked) state.selected.add(tab.id); else state.selected.delete(tab.id); selectionState(); });
  card.prepend(check);
  const saved = state.entries.find(entry => entry.url === tab.url);
  body.append(element("p", "card-description", saved ? `Already in your archive · ${PURPOSES[saved.purpose]}` : tab.url));
  const actions = element("div", "card-actions");
  actions.append(button("Preview", "text-button", () => showOpen(tab)));
  if (!tab.discarded && !tab.pinned && !tab.audible) actions.append(button("Unload", "text-button", async () => {
    await api("unload", { tabId: tab.id, url: tab.url }); notice("Tab unloaded. It stays in your tab bar and reloads when you visit it."); await refresh();
  }));
  actions.append(button(tab.pinned || tab.audible ? "Save link" : "Save & close", "save-button", async () => {
    const result = await api("archive", { tabId: tab.id, url: tab.url, close: !tab.pinned && !tab.audible, categories: $("#batch-categories").value, purpose: $("#batch-purpose").value });
    notice(result.warning || `${result.closed ? "Saved and closed." : "Saved."}${result.linkOnly ? " Link only; page text was unavailable." : " Page text is included."}`); await refresh();
  }));
  card.append(actions); return card;
}
function archiveCard(entry, review) {
  const { card, body } = cardBase(entry, shortDate(entry.savedAt));
  body.append(element("p", "card-description", entry.description || entry.excerpt || "A saved link, ready when you need it."));
  const tags = element("div", "tags"); tags.append(element("span", `tag purpose purpose-${entry.purpose}`, PURPOSES[entry.purpose]));
  for (const category of entry.categories) tags.append(element("span", "tag", category));
  if (entry.hasText) tags.append(element("span", "text-saved", "Text saved")); body.append(tags);
  const actions = element("div", "card-actions"); actions.append(button("Preview & edit", "text-button", () => showSaved(entry.id)));
  if (review) actions.append(button("Keep", "save-button", async () => { await api("reviewed", { id: entry.id }); await refresh(); }));
  else actions.append(button("Reopen ↗", "secondary", () => api("restore", { id: entry.id })));
  actions.append(button("Delete", "text-button danger", async () => {
    if (!window.confirm(`Permanently delete “${entry.title}” from your archive? Export a backup first if you want a copy.`)) return;
    await api("delete", { id: entry.id }); notice("Deleted from your archive."); await refresh();
  }));
  card.append(actions); return card;
}
function showDetail(entry, saved) {
  state.detail = saved ? entry : null;
  $("#detail-title").textContent = entry.title; $("#detail-url").textContent = entry.url; $("#detail-url").href = entry.url;
  $("#detail-type").textContent = saved ? "SAVED LINK" : "OPEN TAB PREVIEW";
  $("#saved-fields").hidden = !saved; $("#saved-actions").hidden = !saved;
  $("#capture-status").textContent = entry.capture;
  $("#detail-text").textContent = entry.text || entry.description || "No text preview is available. You can still save this link and add your own description.";
  $("#saved-screenshot").hidden = !entry.screenshot;
  if (entry.screenshot) $("#saved-screenshot").src = entry.screenshot; else $("#saved-screenshot").removeAttribute("src");
  if (saved) {
    $("#edit-title").value = entry.title; $("#edit-description").value = entry.description;
    $("#edit-categories").value = entry.categories.join(", "); $("#edit-purpose").value = entry.purpose;
  }
  if (!$("#detail").open) $("#detail").showModal();
}
async function showSaved(id) {
  const entry = await api("get", { id }); if (!entry) throw new Error("This entry was deleted. Refresh the archive."); showDetail(entry, true);
}
async function showOpen(tab) { showDetail(await api("preview", { tabId: tab.id, url: tab.url }), false); }
function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type })), link = element("a");
  link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
document.querySelectorAll("[data-view]").forEach(node => node.addEventListener("click", () => run(() => switchView(node.dataset.view))));
$("#refresh").addEventListener("click", () => run(refresh));
$("#start-review").addEventListener("click", () => run(() => switchView("review")));
$("#search").addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { state.limit = 40; render().catch(error => notice(error.message, true)); }, 180); });
for (const selector of ["#category-filter", "#purpose-filter"]) $(selector).addEventListener("change", () => run(async () => { state.limit = 40; await render(); }));
$("#show-more").addEventListener("click", () => run(async () => { state.limit += 40; await render(); }));
$("#select-all").addEventListener("change", () => {
  for (const tab of state.filtered.slice(0, state.limit).filter(tab => !tab.pinned && !tab.audible)) {
    if ($("#select-all").checked) state.selected.add(tab.id); else state.selected.delete(tab.id);
  }
  render().catch(error => notice(error.message, true));
});
$("#archive-selected").addEventListener("click", () => run(async () => {
  const selected = state.tabs.filter(tab => state.selected.has(tab.id)); if (!selected.length) return;
  if (!window.confirm(`Save and close ${selected.length} selected tabs? Links are saved first. Page text is captured where available; form state and browsing history are not saved.`)) return;
  const batchCategories = $("#batch-categories").value, batchPurpose = $("#batch-purpose").value;
  let saved = 0, closed = 0, linkOnly = 0, failed = 0; const errors = [];
  for (const tab of selected) {
    notice(`Saving ${saved + failed + 1} of ${selected.length}…`);
    try {
      const result = await api("archive", { tabId: tab.id, url: tab.url, close: true, categories: batchCategories, purpose: batchPurpose });
      saved++; closed += Number(result.closed); linkOnly += Number(result.linkOnly); state.selected.delete(tab.id);
      if (result.warning) errors.push(result.warning);
    } catch (error) { failed++; errors.push(error.message); }
  }
  await refresh(); notice(`${saved} saved, ${closed} closed, ${linkOnly} link-only${failed ? `, ${failed} failed` : ""}.${errors.length ? ` ${errors[0]}` : ""}`, failed > 0);
}));
$("#close-detail").addEventListener("click", () => $("#detail").close());
$("#save-details").addEventListener("click", () => run(async () => {
  state.detail = await api("edit", { id: state.detail.id, title: $("#edit-title").value, description: $("#edit-description").value, categories: $("#edit-categories").value, purpose: $("#edit-purpose").value });
  showDetail(state.detail, true); await refresh(); notice("Changes saved.");
}));
$("#restore-one").addEventListener("click", () => run(() => api("restore", { id: state.detail.id })));
$("#export-one").addEventListener("click", () => run(async () => download(`${state.detail.title.replace(/[^\p{L}\p{N} -]/gu, "").slice(0, 70) || "Saved link"}.md`, markdown([state.detail]), "text/markdown")));
// Read/write large backups directly in the dashboard to avoid runtime message size limits.
// IndexedDB transactions still serialize and atomically commit imports with background saves.
$("#backup").addEventListener("click", () => run(async () => { download(`tab-archive-${new Date().toISOString().slice(0, 10)}.json`, backup(await listEntries({}, true)), "application/json"); notice("Backup download started. Keep the JSON file to restore your archive."); }));
$("#markdown").addEventListener("click", () => run(async () => { download("Tab archive.md", markdown(await listEntries({}, true)), "text/markdown"); notice("Markdown download started. Move it to Obsidian or import it into Notion."); }));
$("#import").addEventListener("click", () => $("#import-file").click());
$("#import-file").addEventListener("change", () => run(async () => {
  const file = $("#import-file").files[0]; $("#import-file").value = ""; if (!file) return;
  if (file.size > 200 * 1024 * 1024) throw new Error("This backup exceeds the 200 MB import limit.");
  const added = await saveEntries(parseBackup(JSON.parse(await file.text())));
  await refresh(); notice(`${added} new links imported. Existing URLs were merged; your categories and descriptions were kept.`);
}));
$("#weekly").addEventListener("change", () => run(async () => { await api("weekly", { enabled: $("#weekly").checked }); await refresh(); }));
$("#finish-review").addEventListener("click", () => run(async () => { await api("finish-review"); await refresh(); notice("Review finished. Your next reminder is in one week."); }));
purposeOptions($("#purpose-filter"), true); purposeOptions($("#batch-purpose")); purposeOptions($("#edit-purpose"));
run(refresh);
