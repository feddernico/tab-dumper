import { chromium, expect } from "playwright/test";
import { createServer } from "node:http";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const extension = process.env.TEST_EXTENSION_PATH || root;
const output = path.join(root, "test-results", process.env.TEST_BROWSER_NAME || "chromium");
const profile = await mkdtemp(path.join(tmpdir(), "tab-tinder-test-"));
const server = createServer((request, response) => {
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  response.end(`<!doctype html><title>A useful article</title><meta name="description" content="A practical guide to a calmer browser."><nav>Navigation clutter</nav><article><h1>Making room for ideas</h1><p>A searchable quokka lives in this article body.</p><p>Keep the knowledge and close the tab.</p></article><form><input value=""><textarea></textarea></form>`);
});
await new Promise((resolve, reject) => { server.on("error", reject); server.listen(0, "127.0.0.1", resolve); });
const origin = `http://127.0.0.1:${server.address().port}`;
let context;
try {
  context = await chromium.launchPersistentContext(profile, {
    channel: "chromium", executablePath: process.env.TEST_BROWSER_PATH || undefined, headless: true, viewport: { width: 1440, height: 1000 },
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
  });
  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent("serviceworker");
  const id = new URL(worker.url()).host;
  await mkdir(output, { recursive: true });
  const errors = [];
  const article = await context.newPage(); await article.goto(`${origin}/article`);
  const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
  await page.goto(`chrome-extension://${id}/archive.html`);
  const ready = () => expect(page.locator("body")).not.toHaveClass(/busy/);
  await expect(page.locator(".tab-card")).toHaveCount(1); await ready();
  await page.evaluate(() => document.fonts.ready);
  console.log("Font status:", await page.evaluate(() => [...document.fonts].map(font => `${font.family} ${font.weight}: ${font.status}`).join(", ")));
  await page.screenshot({ path: path.join(output, "open-tabs-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(output, "open-tabs-mobile.png"), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator("#batch-categories").fill("Research, personal");
  await page.locator("#batch-purpose").selectOption("read");
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.locator("#detail-text")).toContainText("quokka");
  await expect(page.locator("#detail-text")).not.toContainText("Navigation clutter");
  await page.getByRole("button", { name: "Close preview" }).click(); await ready();
  await page.getByRole("button", { name: "Save & close", exact: true }).click();
  await expect.poll(() => article.isClosed()).toBe(true); await ready();
  await page.locator('[data-view="archive"]').click(); await ready();
  await expect(page.locator(".tab-card")).toHaveCount(1);
  await page.locator("#search").fill("quokka research");
  await expect(page.locator(".tab-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Preview & edit" }).click(); await ready();
  await page.locator("#edit-title").fill("My useful article");
  await page.locator("#edit-description").fill("Useful for my personal knowledge archive.");
  await page.locator("#save-details").click(); await ready();
  await expect(page.locator("#detail-title")).toHaveText("My useful article");
  await expect(page.locator("#message")).toBeHidden({ timeout: 12000 });
  await page.screenshot({ path: path.join(output, "preview-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(output, "preview-mobile.png") });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const singleDownload = page.waitForEvent("download"); await page.locator("#export-one").click();
  const markdownFile = await singleDownload;
  const markdownText = await readFile(await markdownFile.path(), "utf8");
  if (!markdownText.includes("quokka") || !markdownText.includes("research")) throw new Error("Markdown lost content");
  await page.locator("#close-detail").click(); await ready();
  const backupDownload = page.waitForEvent("download"); await page.locator("#backup").click();
  const backupFile = await backupDownload; const savedBackup = await readFile(await backupFile.path(), "utf8");
  if (JSON.parse(savedBackup).entries.length !== 1) throw new Error("Backup missing saved entry"); await ready();
  // Importing the same backup must merge, not duplicate.
  await page.locator("#import-file").setInputFiles({ name: "backup.json", mimeType: "application/json", buffer: Buffer.from(savedBackup) });
  await expect(page.locator("#message")).toContainText("0 new links imported"); await ready();
  // Reopen, refresh and save the same URL again; the custom title must survive.
  const reopenedEvent = context.waitForEvent("page"); await page.getByRole("button", { name: "Reopen ↗", exact: true }).click();
  const reopened = await reopenedEvent; await reopened.waitForLoadState(); await page.bringToFront(); await ready();
  await page.locator('[data-view="open"]').click(); await ready();
  await page.getByRole("button", { name: "Save & close", exact: true }).click(); await ready();
  await page.locator('[data-view="archive"]').click(); await ready();
  await expect(page.locator(".tab-card")).toHaveCount(1); await expect(page.locator(".card-title")).toHaveText("My useful article");
  await page.reload(); await ready(); await page.locator('[data-view="archive"]').click(); await ready();
  await expect(page.locator(".tab-card")).toHaveCount(1);
  // Imported titles/content must be inert and review should stop after ten decisions.
  const entries = Array.from({ length: 12 }, (_, i) => ({ url: `https://review.example/${i}`, title: `Research note ${i + 1}`, description: "An idea to come back to.", categories: ["research"], savedAt: `2025-01-${String(i + 1).padStart(2, "0")}T00:00:00Z` }));
  entries[0].title = '<img src=x onerror="alert(1)">';
  await page.locator("#import-file").setInputFiles({ name: "more.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ format: "tab-tinder", version: 2, entries })) });
  await expect(page.locator("#message")).toContainText("12 new links imported"); await ready();
  await expect(page.locator(".card-title img")).toHaveCount(0);
  await page.locator('[data-view="review"]').click(); await ready(); await expect(page.locator(".tab-card")).toHaveCount(10);
  for (let i = 0; i < 10; i++) { await page.getByRole("button", { name: "Keep", exact: true }).first().click(); await ready(); }
  await expect(page.locator(".tab-card")).toHaveCount(0);
  await page.locator("#finish-review").click(); await ready();
  // A dirty form is saved but not closed in a real browser.
  const dirty = await context.newPage(); await dirty.goto(`${origin}/draft`); await dirty.locator("textarea").fill("An unfinished thought");
  await page.bringToFront(); await page.locator('[data-view="open"]').click(); await ready();
  await page.getByRole("button", { name: "Save & close", exact: true }).click(); await ready();
  await expect(page.locator("#message")).toContainText("possible unsaved edit");
  if (dirty.isClosed()) throw new Error("Closed a dirty form");
  await page.locator('[data-view="archive"]').click(); await ready();
  await expect(page.locator("#message")).toBeHidden({ timeout: 12000 });
  await page.mouse.move(1, 1);
  await page.screenshot({ path: path.join(output, "archive-preview.png") });
  await page.screenshot({ path: path.join(output, "archive-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  if (overflow) throw new Error("Mobile layout overflows horizontally");
  await page.screenshot({ path: path.join(output, "archive-mobile.png"), fullPage: true });
  if (errors.length) throw new Error(errors.join("\n"));
  console.log("Browser checks passed: extension load, preview, capture, save-before-close, content search, edits, Markdown/JSON exports, merge import, restore, persistence, safe rendering, ten-item review, dirty-form protection and responsive layout.");
} finally {
  await context?.close(); server.close(); await rm(profile, { recursive: true, force: true });
}
