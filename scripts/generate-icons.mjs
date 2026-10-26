import { chromium } from "playwright";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const svg = await readFile(path.join(root, "assets/icons/icon.svg"), "utf8");
await mkdir(path.join(root, "assets/icons"), { recursive: true });
const browser = await chromium.launch({ channel: "chromium" });
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const size of [16, 32, 48, 64, 128, 256]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:100vw;height:100vh}</style>${svg}`);
    await page.screenshot({ path: path.join(root, `assets/icons/icon-${size}.png`), omitBackground: true });
  }
  console.log("Generated six transparent PNG icons from the shared SVG source.");
} finally { await browser.close(); }
