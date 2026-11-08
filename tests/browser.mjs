// Real-browser checks against a built site (local server or the live URL).
//   node tests/browser.mjs [baseUrl] [--shots dir]
// Uses playwright-core with an installed Chromium. Checks every page in both languages:
// HTTP 200, no console errors, no horizontal scroll at 390 px, language switch target
// exists, every internal link resolves, images have alt, buttons/links have names,
// basic heading order, and the theme toggle.
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

const require = createRequire(import.meta.url);
let chromium;
for (const p of [process.env.PLAYWRIGHT_CORE, "playwright-core", "C:/Users/user/cloud-career-hq/node_modules/playwright-core"].filter(Boolean)) {
  try {
    ({ chromium } = require(p));
    break;
  } catch {}
}
if (!chromium) throw new Error("playwright-core not found (set PLAYWRIGHT_CORE)");

const base = (process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "http://127.0.0.1:5201").replace(/\/$/, "");
const shotsAt = process.argv.indexOf("--shots");
const shots = shotsAt > 0 ? process.argv[shotsAt + 1] : null;
if (shots) mkdirSync(shots, { recursive: true });

function findChromium() {
  const root = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "ms-playwright") : join(process.env.HOME ?? "", ".cache/ms-playwright");
  if (!existsSync(root)) return undefined;
  const dirs = readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse();
  for (const d of dirs) for (const exe of ["chrome-win64/chrome.exe", "chrome-win/chrome.exe", "chrome-linux/chrome"]) if (existsSync(join(root, d, exe))) return join(root, d, exe);
}

const browser = await chromium.launch({ executablePath: findChromium() });
const failures = [];
const fail = (where, msg) => failures.push(`${where}: ${msg}`);
let checks = 0;

const seen = new Set();
const queue = ["/", "/en/"];
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
while (queue.length) {
  const path = queue.shift();
  if (seen.has(path)) continue;
  seen.add(path);
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  const res = await page.goto(base + path, { waitUntil: "networkidle" });
  checks++;
  if (res?.status() !== 200) fail(path, `HTTP ${res?.status()}`);
  const r = await page.evaluate(() => {
    const doc = document.documentElement;
    const links = [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href"));
    const unnamed = [...document.querySelectorAll("a, button")].filter((e) => !(e.getAttribute("aria-label") || e.textContent.trim())).length;
    const imgsNoAlt = [...document.querySelectorAll("img")].filter((i) => !i.hasAttribute("alt")).length;
    const hs = [...document.querySelectorAll("h1,h2,h3,h4")].map((h) => Number(h.tagName[1]));
    let skip = false;
    for (let i = 1; i < hs.length; i++) if (hs[i] > hs[i - 1] + 1) skip = true;
    return {
      lang: doc.lang,
      overflow: doc.scrollWidth - doc.clientWidth,
      links,
      unnamed,
      imgsNoAlt,
      h1: hs.filter((h) => h === 1).length,
      headingSkip: skip,
      title: document.title,
      desc: document.querySelector('meta[name="description"]')?.content ?? "",
      alt: document.querySelector("a.lang")?.getAttribute("href"),
      drafts: document.querySelectorAll("mark.confirm").length,
    };
  });
  checks += 7;
  if (r.overflow > 1) fail(path, `horizontal scroll at 390px (${r.overflow}px)`);
  if (r.unnamed) fail(path, `${r.unnamed} link(s)/button(s) without an accessible name`);
  if (r.imgsNoAlt) fail(path, `${r.imgsNoAlt} image(s) without alt`);
  if (r.h1 !== 1) fail(path, `expected one h1, found ${r.h1}`);
  if (r.headingSkip) fail(path, "heading level skipped");
  if (!r.title || !r.desc) fail(path, "missing title or meta description");
  if (errors.length) fail(path, `console errors: ${errors.join(" | ").slice(0, 300)}`);
  if (r.drafts) console.log(`  note ${path}: ${r.drafts} unconfirmed marker(s) (expected until you confirm the facts)`);
  for (const href of r.links) {
    if (!href || href.startsWith("#") || /^(mailto|tel):/.test(href)) continue;
    const u = new URL(href, base + path);
    if (u.origin === new URL(base).origin) {
      const p = u.pathname;
      if (!seen.has(p) && !queue.includes(p)) queue.push(p);
    }
  }
  if (shots) {
    const name = (path.replace(/\//g, "_").replace(/^_|_$/g, "") || "home") + "-390.png";
    await page.screenshot({ path: join(shots, name), fullPage: true });
  }
  await page.close();
}

// Theme toggle flips data-theme and persists; desktop layout has no overflow either.
const desk = await browser.newContext({ viewport: { width: 1366, height: 900 }, colorScheme: "light" });
const p = await desk.newPage();
await p.goto(base + "/en/", { waitUntil: "networkidle" });
await p.click(".theme");
const theme = await p.evaluate(() => document.documentElement.dataset.theme);
checks++;
if (theme !== "dark") fail("/en/", `theme toggle gave "${theme}"`);
await p.reload({ waitUntil: "networkidle" });
checks++;
if ((await p.evaluate(() => document.documentElement.dataset.theme)) !== "dark") fail("/en/", "theme choice not remembered");
const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
checks++;
if (over > 1) fail("/en/ desktop", `horizontal scroll (${over}px)`);
if (shots) {
  await p.screenshot({ path: join(shots, "en-desktop-dark.png"), fullPage: true });
  await p.evaluate(() => localStorage.removeItem("theme"));
  for (const path of ["/", "/en/case-studies/cloud-career-hq/"]) {
    await p.goto(base + path, { waitUntil: "networkidle" });
    await p.screenshot({ path: join(shots, (path.replace(/\//g, "_").replace(/^_|_$/g, "") || "home") + "-desktop.png"), fullPage: true });
  }
}
// Keyboard: first Tab lands on the skip link.
await p.goto(base + "/", { waitUntil: "networkidle" });
await p.keyboard.press("Tab");
checks++;
if ((await p.evaluate(() => document.activeElement?.className)) !== "skip") fail("/", "first Tab does not reach the skip link");

await browser.close();
console.log(`${failures.length ? "✗" : "✓"} ${checks} checks on ${seen.size} pages at ${base}`);
for (const f of failures) console.log("  - " + f);
process.exit(failures.length ? 1 : 0);
