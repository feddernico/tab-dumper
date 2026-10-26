import { chromium, expect } from "playwright/test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, "submission", "screenshots");
await mkdir(output, { recursive: true });
const profile = await mkdtemp(path.join(tmpdir(), "tab-dumper-assets-"));
const context = await chromium.launchPersistentContext(profile, {
  executablePath: process.env.TEST_BROWSER_PATH || "/Applications/Opera.app/Contents/MacOS/Opera",
  headless: true, viewport: { width: 1280, height: 900 },
  args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`]
});
try {
  const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
  const page = await context.newPage();
  await page.goto(`chrome-extension://${new URL(worker.url()).host}/archive.html`);
  await expect(page.locator("body")).not.toHaveClass(/busy/);
  const entries = [
    { title: "A calmer browser, one small habit at a time", description: "Ideas for a weekly reset: keep the useful links and close the rest.", categories: ["reading", "personal"], purpose: "read", slug: "calmer-browser" },
    { title: "Notes for my next side project", description: "A few interface patterns to try in the next prototype.", categories: ["design", "projects"], purpose: "task", slug: "project-notes" },
    { title: "Building a useful personal knowledge archive", description: "Connect reading notes to the projects where they will be useful.", categories: ["research", "writing"], purpose: "reference", slug: "knowledge-archive" },
    { title: "A weekend away from the screen", description: "A walking route to come back to when planning the next trip.", categories: ["personal", "travel"], purpose: "read", slug: "weekend-walk" }
  ].map((item, index) => ({ ...item, url: `https://example.com/${item.slug}`, savedAt: `2026-10-${20 + index}T10:00:00Z`, capture: "Page text", text: "Example saved text. Keep a short note about why a page matters, then return to it when the right project comes along. A useful archive helps you close a tab without losing the idea that made you open it." }));
  await page.locator("#import-file").setInputFiles({ name: "demo.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ format: "tab-tinder", version: 2, entries })) });
  await expect(page.locator("#message")).toContainText("4 new links imported");
  await page.locator('[data-view="archive"]').click();
  await expect(page.locator(".tab-card")).toHaveCount(4);
  await expect(page.locator("#message")).toBeHidden({ timeout: 12000 });
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.move(0, 0);
  await page.screenshot({ path: path.join(output, "website-archive.png") });
  // Capture the desktop layout at 800 × 600 device pixels for the listing.
  await page.setViewportSize({ width: 1280, height: 960 });
  const display = await context.newCDPSession(page);
  const capture = async name => {
    const { data } = await display.send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: 1280, height: 960, scale: 0.625 }, captureBeyondViewport: false });
    await writeFile(path.join(output, name), Buffer.from(data, "base64"));
  };
  await capture("01-archive.png");
  await page.getByRole("button", { name: "Preview & edit" }).first().click();
  await expect(page.locator("#detail-title")).toBeVisible();
  await capture("02-preview.png");
  await page.getByRole("button", { name: "Close preview" }).click();
  await page.locator('[data-view="review"]').click();
  await expect(page.locator(".tab-card")).toHaveCount(4);
  await capture("03-review.png");
  console.log(`Saved demonstration screenshots to ${output}`);
} finally {
  await context.close();
  await rm(profile, { recursive: true, force: true });
}
