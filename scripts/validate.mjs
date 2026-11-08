// Validates all publishable content. Runs locally and in CI on every pull request.
// Exit code 1 blocks the merge check and the deployment.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { scanText, validatePublished } from "./rules.mjs";

export function validateAll(root = ".") {
  const errs = [];
  const read = (p) => readFileSync(join(root, p), "utf8");

  const profile = JSON.parse(read("content/profile.json"));
  // Only confirmed projects are rendered; unconfirmed drafts are not scanned for markers.
  const rendered = { ...profile, projects: (profile.projects ?? []).filter((p) => p.confirmed === true), pending: undefined };
  errs.push(...scanText("content/profile.json", JSON.stringify(rendered)));
  for (const p of profile.projects ?? []) {
    if (typeof p.confirmed !== "boolean") errs.push(`content/profile.json: project "${p.slug}" needs confirmed: true|false`);
    if (p.confirmed && (!p.title?.en || !p.title?.ja || !p.summary?.en || !p.summary?.ja)) errs.push(`content/profile.json: project "${p.slug}" needs en+ja title and summary`);
    for (const l of p.links ?? []) if (!/^https:\/\//.test(l.url)) errs.push(`content/profile.json: project "${p.slug}" link must be https`);
  }

  errs.push(...validatePublished(JSON.parse(read("content/published.json"))));
  errs.push(...scanText("content/published.json", read("content/published.json")));

  const dir = join(root, "content/case-studies");
  const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
  const bases = new Set(files.map((f) => f.replace(/\.(en|ja)\.md$/, "")));
  for (const b of bases) {
    for (const lang of ["en", "ja"]) if (!files.includes(`${b}.${lang}.md`)) errs.push(`case study "${b}" is missing its ${lang} version`);
  }
  for (const f of files) errs.push(...scanText(`content/case-studies/${f}`, read(`content/case-studies/${f}`)));

  // Optional Markdown articles: both languages, a date line, privacy scan.
  const adir = join(root, "content/articles");
  if (existsSync(adir)) {
    const af = readdirSync(adir).filter((f) => f.endsWith(".md"));
    for (const b of new Set(af.map((f) => f.replace(/.(en|ja).md$/, ""))))
      for (const lang of ["en", "ja"]) if (!af.includes(`${b}.${lang}.md`)) errs.push(`article "${b}" is missing its ${lang} version`);
    for (const f of af) {
      const t = read(`content/articles/${f}`);
      if (!/<!-- date: d{4}-d{2}-d{2} -->/.test(t)) errs.push(`content/articles/${f}: needs a "<!-- date: YYYY-MM-DD -->" line`);
      errs.push(...scanText(`content/articles/${f}`, t));
    }
  }
  return errs;
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/").replace(/^\//, "")}` || process.argv[1].endsWith("validate.mjs")) {
  const errs = validateAll();
  if (errs.length) {
    console.error(`✗ ${errs.length} problem(s):\n` + errs.map((e) => "  - " + e).join("\n"));
    process.exit(1);
  }
  console.log("✓ content valid: privacy scan clean, approvals present, JA/EN complete");
}
