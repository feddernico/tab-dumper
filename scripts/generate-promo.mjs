import { chromium } from "playwright";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, "submission", "promotional");
await mkdir(output, { recursive: true });
const font = await readFile(path.join(root, "assets/fonts/source-sans-pro-semibold.woff"));
const icon = await readFile(path.join(root, "assets/icons/icon.svg"), "utf8");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="188" viewBox="0 0 300 188">
  <title>Tab Dumper — Close tabs. Keep the useful stuff.</title>
  <defs>
    <style>@font-face{font-family:SourceSans;src:url(data:font/woff;base64,${font.toString("base64")}) format('woff');font-weight:600}text{font-family:SourceSans,sans-serif;font-weight:600}</style>
    <linearGradient id="blue" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#2780e3"/><stop offset="1" stop-color="#2761e3"/></linearGradient>
  </defs>
  <rect width="300" height="188" fill="url(#blue)"/>
  <g transform="translate(20 21) scale(.32)" fill="none">${icon.replace(/<svg[^>]*>|<\/svg>/g, "")}</g>
  <text x="71" y="50" font-size="24" fill="white">Tab Dumper</text>
  <path d="M25 81h36" stroke="white" stroke-opacity=".55" stroke-width="2" stroke-linecap="round"/>
  <text x="24" y="117" font-size="27" fill="white">Close tabs.</text>
  <text x="24" y="149" font-size="24" fill="white">Keep the useful stuff.</text>
</svg>`;
await writeFile(path.join(output, "tab-dumper-promo.svg"), svg);
const browser = await chromium.launch({ channel: "chromium" });
try {
  const page = await browser.newPage({ viewport: { width: 300, height: 188 }, deviceScaleFactor: 1 });
  await page.setContent(`<style>html,body{margin:0}svg{display:block}</style>${svg}`);
  await page.evaluate(() => document.fonts.ready);
  if (!await page.evaluate(() => document.fonts.check('600 24px SourceSans'))) throw new Error("Brand font failed to load");
  await page.screenshot({ path: path.join(output, "tab-dumper-promo-300x188.png") });
  console.log(`Created 300 × 188 promotional PNG and editable SVG in ${output}`);
} finally { await browser.close(); }
