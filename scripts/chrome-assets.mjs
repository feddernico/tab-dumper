import { chromium } from "playwright";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, "submission/chrome");
await mkdir(output, { recursive: true });
const font = (await readFile(path.join(root, "assets/fonts/source-sans-pro-semibold.woff"))).toString("base64");
const icon = (await readFile(path.join(root, "assets/icons/icon.svg"), "utf8")).replace(/<svg[^>]*>|<\/svg>/g, "");
const browser = await chromium.launch({ channel: "chromium" });
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const render = async (svg, width, height, destination, transparent = false) => {
    await page.setViewportSize({ width, height });
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block}</style>${svg}`);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: destination, omitBackground: transparent });
  };
  // The source artwork occupies x/y=5..123; fit it into exactly 96px with 16px padding.
  const padded = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><g transform="translate(16 16) scale(${96 / 118}) translate(-5 -5)" fill="none">${icon}</g></svg>`;
  await render(padded, 128, 128, path.join(root, "assets/icons/chrome-icon-128.png"), true);
  await render(padded, 128, 128, path.join(output, "store-icon-128.png"), true);
  const tile = `<svg xmlns="http://www.w3.org/2000/svg" width="440" height="280" viewBox="0 0 440 280">
  <defs><style>@font-face{font-family:SourceSans;src:url(data:font/woff;base64,${font}) format('woff');font-weight:600}text{font-family:SourceSans,sans-serif;font-weight:600}</style><linearGradient id="blue" x2="1" y2="1"><stop stop-color="#2780e3"/><stop offset="1" stop-color="#2761e3"/></linearGradient></defs>
  <rect width="440" height="280" fill="url(#blue)"/>
  <g transform="translate(30 30) scale(.48)" fill="none">${icon}</g>
  <text x="106" y="75" font-size="35" fill="white">Tab Dumper</text>
  <path d="M36 121h54" stroke="white" stroke-opacity=".55" stroke-width="3" stroke-linecap="round"/>
  <text x="35" y="175" font-size="40" fill="white">Close tabs.</text>
  <text x="35" y="222" font-size="35" fill="white">Keep the useful stuff.</text></svg>`;
  await writeFile(path.join(output, "promo-440x280.svg"), tile);
  await render(tile, 440, 280, path.join(output, "promo-440x280.png"));
  console.log("Created Chrome 128px padded icon and 440×280 promotional tile.");
} finally { await browser.close(); }
