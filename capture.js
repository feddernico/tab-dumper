// Runs only in the selected tab, on an explicit save/preview action.
export function capturePage() {
  const description = document.querySelector('meta[name="description"], meta[property="og:description"]')?.content || "";
  const article = document.querySelector("article, [role=main], main");
  const root = article || document.body;
  const blocks = [];
  let length = 0;
  let truncated = false;
  if (root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || parent.closest('script, style, noscript, nav, header, footer, aside, form, input, textarea, select, [contenteditable], [hidden], [aria-hidden="true"]')) return NodeFilter.FILTER_REJECT;
        if (!node.textContent.trim() || !parent.getClientRects().length) return NodeFilter.FILTER_REJECT;
        const style = getComputedStyle(parent);
        return style.visibility === "hidden" || style.display === "none" ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      }
    });
    let node;
    while ((node = walker.nextNode())) {
      const value = node.textContent.replace(/\s+/g, " ").trim();
      const remaining = 200000 - length - (blocks.length ? 2 : 0);
      if (remaining <= 0) { truncated = true; break; }
      blocks.push(value.slice(0, remaining));
      length += Math.min(value.length, remaining) + (blocks.length > 1 ? 2 : 0);
      if (value.length > remaining) { truncated = true; break; }
    }
  }
  const text = blocks.join("\n\n");
  const dirtyForm = [...document.querySelectorAll("input, textarea, select")].some(field => {
    if (["hidden", "submit", "button"].includes(field.type)) return false;
    if (["checkbox", "radio"].includes(field.type)) return field.checked !== field.defaultChecked;
    if (field.tagName === "SELECT") return [...field.options].some(option => option.selected !== option.defaultSelected);
    return field.value !== field.defaultValue;
  }) || [...document.querySelectorAll('[contenteditable="true"]')].some(node => node.textContent.trim());
  return {
    url: location.href, title: document.title, description: description.slice(0, 2000) || text.slice(0, 280),
    excerpt: text.slice(0, 700), text, dirtyForm,
    capture: text ? `${article ? "Article/main text" : "Page text"}${truncated ? " (truncated at 200,000 characters)" : ""}` : "Link only — no readable text found"
  };
}
