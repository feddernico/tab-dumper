import { chromium, expect } from "playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const output = path.resolve(import.meta.dirname, "../submission/screenshots");
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
try {
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  const tallyRequests = [];
  page.on("pageerror", error => errors.push(error.message));
  // Exercise the click-to-load boundary without sending a support submission.
  await context.route("https://tally.so/**", route => {
    tallyRequests.push(route.request().url());
    return route.fulfill({ contentType: "text/html", body: "<!doctype html><p>Support form test response</p>" });
  });
  await page.goto("http://127.0.0.1:8766/tab-dumper.html");
  await page.getByRole("button", { name: "Reject optional", exact: true }).click();
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator(".td-hero h1")).toContainText("Close tabs.");
  await expect(page.locator("#title-block-header")).toBeHidden();
  if (tallyRequests.length) throw new Error("Tally loaded before user action");
  for (const image of await page.locator(".td-shell img").all()) {
    if (!await image.evaluate(img => img.complete && img.naturalWidth > 0)) throw new Error("Missing product image");
  }
  const download = await context.request.get("http://127.0.0.1:8766/downloads/tab-dumper-2.0.1-opera.zip");
  if (!download.ok() || (await download.body()).subarray(0, 2).toString() !== "PK") throw new Error("Download is not a ZIP");
  const chromeDownload = await context.request.get("http://127.0.0.1:8766/downloads/tab-dumper-2.0.1-chrome.zip");
  if (!chromeDownload.ok() || (await chromeDownload.body()).subarray(0, 2).toString() !== "PK") throw new Error("Chrome download is not a ZIP");
  await page.screenshot({ path: path.join(output, "website-desktop.png") });
  await page.screenshot({ path: path.join(output, "website-full.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error("Horizontal overflow on mobile");
  await page.screenshot({ path: path.join(output, "website-mobile.png"), fullPage: true });
  await page.getByRole("button", { name: "Load assistance form" }).click();
  await expect(page.locator("#td-form-container")).toBeVisible();
  await expect(page.locator("#td-support-form")).toHaveAttribute("src", /tally.so\/embed\/e55RWl/);
  await expect.poll(() => tallyRequests.length).toBe(1);
  await expect(page.getByRole("button", { name: "Load assistance form" })).toBeHidden();
  await page.goto("http://127.0.0.1:8766/tab-dumper/#privacy");
  await expect(page).toHaveURL(/tab-dumper.html#privacy/);
  if (errors.length) throw new Error(errors.join("\n"));
  await writeFile(path.join(output, "website-check.json"), JSON.stringify({ checkedAt: new Date().toISOString(), checks: ["Quarto render with existing site theme", "product images", "ZIP download", "desktop and mobile layout", "no Tally request before consent", "click-to-load iframe", "support URL alias preserves privacy anchor"], passed: true }, null, 2));
  console.log("Website checks passed: theme, images, ZIP download, responsive layout, click-to-load Tally form and privacy alias.");
} finally { await browser.close(); }
