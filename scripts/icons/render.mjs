// Renders the app icons (public/icons) from the brand: the logo's sky blue with "TLY" in its
// hand-lettered font. Usage: node scripts/icons/render.mjs (needs Playwright's Chromium).
import { readFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const root = path.resolve(import.meta.dirname, "../..");
const font = readFileSync(path.join(root, "node_modules/@fontsource/gochi-hand/files/gochi-hand-latin-400-normal.woff2")).toString("base64");

/** `safe`: the share of the square the lettering may use (maskable icons are cropped to a circle). */
const icons = [
  { file: "icon-192.png", size: 192, safe: 0.86 },
  { file: "icon-512.png", size: 512, safe: 0.86 },
  { file: "maskable-512.png", size: 512, safe: 0.62 },
  { file: "apple-touch-icon.png", size: 180, safe: 0.8 },
  { file: "favicon-48.png", size: 48, safe: 0.95 },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const { file, size, safe } of icons) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<!doctype html><html><head><style>
    @font-face { font-family: Gochi; src: url(data:font/woff2;base64,${font}) format("woff2"); }
    html, body { margin: 0; width: ${size}px; height: ${size}px; }
    body { background: #9fd8fd; display: grid; place-items: center; }
    span { font-family: Gochi; color: #13212b; font-size: ${Math.round(size * safe * 0.5)}px; line-height: 1; letter-spacing: 0.06em; transform: translate(0.03em, -2%); }
  </style></head><body><span>TLY</span></body></html>`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(root, "public/icons", file) });
}
await browser.close();
console.log(`rendered ${icons.length} icons`);
