import { existsSync } from "node:fs";

const candidates = process.platform === "darwin"
  ? ["/Applications/Opera.app/Contents/MacOS/Opera"]
  : process.platform === "win32"
    ? [`${process.env.LOCALAPPDATA}/Programs/Opera/opera.exe`, `${process.env.PROGRAMFILES}/Opera/opera.exe`]
    : ["/usr/bin/opera", "/usr/bin/opera-stable"];
process.env.TEST_BROWSER_PATH ||= candidates.find(existsSync) || "";
if (!process.env.TEST_BROWSER_PATH) throw new Error("Opera was not found. Set TEST_BROWSER_PATH to its executable.");
process.env.TEST_BROWSER_NAME = "opera";
await import("../tests/browser.mjs");
