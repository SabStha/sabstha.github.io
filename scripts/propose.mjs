// Propose a content update from the private app's export.
//   npm run propose -- path/to/portfolio-content-YYYY-MM-DD.json
// Validates the export, writes content/published.json on a new branch, commits,
// and prints the pull-request URL. Nothing deploys until that PR passes CI and
// you merge it (the merge is the approval of the change).
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { validatePublished, scanText } from "./rules.mjs";

const src = process.argv[2];
if (!src) {
  console.error("Usage: npm run propose -- <export.json>");
  process.exit(2);
}
const raw = readFileSync(src, "utf8");
const file = JSON.parse(raw);
const errs = [...validatePublished(file), ...scanText(src, raw)];
if (errs.length) {
  console.error(`✗ export rejected (${errs.length}):\n` + errs.map((e) => "  - " + e).join("\n"));
  process.exit(1);
}

const git = (...a) => execFileSync("git", a, { encoding: "utf8" }).trim();
if (git("status", "--porcelain")) {
  console.error("✗ working tree is not clean — commit or discard local changes first");
  process.exit(1);
}
const prev = JSON.parse(readFileSync("content/published.json", "utf8"));
const before = new Map(prev.items.map((i) => [i.slug, i.hash]));
const after = new Map(file.items.map((i) => [i.slug, i.hash]));
const added = [...after.keys()].filter((s) => !before.has(s));
const removed = [...before.keys()].filter((s) => !after.has(s));
const changed = [...after.keys()].filter((s) => before.has(s) && before.get(s) !== after.get(s));
if (!added.length && !removed.length && !changed.length) {
  console.log("Nothing to publish: the export matches content/published.json.");
  process.exit(0);
}

const branch = `content/${file.exportedAt.slice(0, 10)}-${Date.now().toString(36)}`;
git("switch", "-c", branch, "main");
writeFileSync("content/published.json", JSON.stringify(file, null, 2) + "\n");
const summary = [added.length && `add ${added.join(", ")}`, changed.length && `update ${changed.join(", ")}`, removed.length && `remove ${removed.join(", ")}`].filter(Boolean).join("; ");
git("add", "content/published.json");
git("commit", "-m", `content: ${summary}`);
console.log(`✓ committed on ${branch}: ${summary}`);
console.log(`Next: git push -u origin ${branch}`);
console.log(`Then open: https://github.com/SabStha/sabstha.github.io/compare/main...${encodeURIComponent(branch)}?expand=1`);
console.log("CI validates and builds the PR; merging it deploys the site.");
