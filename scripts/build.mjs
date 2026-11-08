// Static site build: content/ → dist/. Japanese at /, English at /en/. No dependencies.
// Sources:
//   content/profile.json              hand-edited facts (only confirmed projects render)
//   content/case-studies/<slug>.<lang>.md
//   content/articles/<slug>.<lang>.md  optional Markdown articles (first line "# Title",
//                                      a "<!-- date: YYYY-MM-DD -->" line, a "**lead**" line)
//   content/published.json             approved items exported from Cloud Career HQ
// The built output is scanned again for private data before the build is accepted.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { privacyProblems } from "./rules.mjs";
import { DIAGRAMS } from "./diagrams.mjs";

const OUT = "dist";
const profile = JSON.parse(readFileSync("content/profile.json", "utf8"));
const published = JSON.parse(readFileSync("content/published.json", "utf8"));
const BASE = profile.site.baseUrl.replace(/\/$/, "");
const LANGS = ["ja", "en"];

export const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const draftMark = (html) => html.replace(/\[\[CONFIRM:?([^\]]*)\]\]/g, (_m, t) => `<mark class="confirm" title="Needs confirmation">⚠ CONFIRM${esc(t)}</mark>`);
const plain = (x) => String(x ?? "").replace(/\[\[CONFIRM:?[^\]]*\]\]\s*/g, "");
/** A value that is either a string or {en, ja}. */
const L = (v, lang) => (v && typeof v === "object" ? v[lang] : v);
const isDraft = (v) => /\[\[CONFIRM/.test(String(v ?? ""));

// ── Minimal Markdown: headings, paragraphs, lists, tables, fenced code, bold, code, links ──
function inline(s) {
  let h = esc(s);
  h = h.replace(/`([^`]+)`/g, "<code>$1</code>");
  h = h.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  h = h.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  h = h.replace(/\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g, (_m, t, u) => `<a href="${u}" rel="noopener">${t}</a>`);
  return h;
}
export function markdown(md, { diagram } = {}) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim() || /^<!--.*-->$/.test(l.trim())) {
      i++;
      continue;
    }
    if (l.startsWith("```")) {
      const lang = l.slice(3).trim();
      const code = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) code.push(lines[i++]);
      i++;
      out.push(`<pre class="code"${lang ? ` data-lang="${esc(lang)}"` : ""}><code>${esc(code.join("\n"))}</code></pre>`);
      continue;
    }
    const h = l.match(/^(#{1,3}) (.*)$/);
    if (h) {
      const lvl = h[1].length;
      const id = h[2].toLowerCase().replace(/[^a-z0-9぀-ヿ一-龯]+/g, "-").replace(/^-|-$/g, "");
      out.push(`<h${lvl} id="${id}">${inline(h[2])}</h${lvl}>`);
      // The architecture diagram goes right under the architecture heading.
      if (diagram && lvl === 2 && /architecture|アーキテクチャ/i.test(h[2])) out.push(diagram);
      i++;
      continue;
    }
    if (l.startsWith("|")) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith("|")) rows.push(lines[i++]);
      const cells = (r) => r.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const [head, , ...body] = rows;
      out.push(
        `<div class="table-wrap" tabindex="0"><table><thead><tr>${cells(head).map((c) => `<th scope="col">${inline(c)}</th>`).join("")}</tr></thead><tbody>` +
          body.map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("") +
          `</tbody></table></div>`,
      );
      continue;
    }
    if (/^- /.test(l)) {
      const items = [];
      while (i < lines.length && /^- /.test(lines[i])) items.push(lines[i++].slice(2));
      out.push(`<ul>${items.map((x) => `<li>${inline(x)}</li>`).join("")}</ul>`);
      continue;
    }
    if (/^\d+\. /.test(l)) {
      const items = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) items.push(lines[i++].replace(/^\d+\. /, ""));
      out.push(`<ol>${items.map((x) => `<li>${inline(x)}</li>`).join("")}</ol>`);
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3} |\||- |\d+\. |```)/.test(lines[i])) para.push(lines[i++]);
    out.push(`<p>${inline(para.join(" "))}</p>`);
  }
  return out.join("\n");
}

// ── Copy ─────────────────────────────────────────────────────────────────────
const T = {
  en: {
    nav: { about: "About", projects: "Projects", skills: "Skills", certs: "Certifications", writing: "Writing", contact: "Contact" },
    other: "日本語", otherLabel: "日本語で表示", skip: "Skip to content", theme: "Toggle dark mode",
    caseStudy: "Read the case study", back: "All projects", languages: "Languages",
    passed: "Passed", studying: "Studying — not certified yet", verify: "Verify", expires: "Expires",
    noVerify: "No public verification link", timeline: "Milestones", inProgress: "In progress", completed: "Completed",
    updated: "Last updated", now: "Now", contactLead: "I read every message. LinkedIn is the most reliable way to reach me.",
    writingEmpty: "Articles appear here once I approve them for publication.",
    legend: "How to read this list", read: "Read", min: "min read", onLinkedIn: "LinkedIn post",
    footer: "Only work I can demonstrate is listed. Implementation is AI-assisted; each project states my role.",
    projectsLead: "Each project lists my role, what was tested, and what is not finished.",
    skillsLead: "Grouped by how I have used each skill. No percentages: the projects are the evidence.",
    certsLead: "Certifications link to public verification where one exists.",
    writingLead: "Notes on AWS architecture, cloud security and troubleshooting.",
    result: { pass: "Pass", fail: "Fail", fix: "Fix" },
  },
  ja: {
    nav: { about: "プロフィール", projects: "プロジェクト", skills: "スキル", certs: "資格", writing: "記事", contact: "連絡先" },
    other: "English", otherLabel: "View in English", skip: "本文へ移動", theme: "ダークモード切り替え",
    caseStudy: "ケーススタディを読む", back: "プロジェクト一覧", languages: "言語",
    passed: "取得済み", studying: "学習中（未取得）", verify: "認定を確認", expires: "有効期限",
    noVerify: "公開の認定確認リンクなし", timeline: "これまでの歩み", inProgress: "進行中", completed: "完了",
    updated: "最終更新", now: "現在", contactLead: "メッセージはすべて確認しています。LinkedInからのご連絡が確実です。",
    writingEmpty: "公開を承認した記事がここに表示されます。",
    legend: "表の見方", read: "読む", min: "分で読めます", onLinkedIn: "LinkedIn投稿",
    footer: "掲載しているのは実際に示せる成果のみです。実装にはAI支援を活用しており、各プロジェクトに自分の役割を記載しています。",
    projectsLead: "各プロジェクトに、自分の役割、検証した内容、未完了の部分を記載しています。",
    skillsLead: "使用した場面ごとに分類しています。習熟度の数値は使わず、根拠はプロジェクトで示します。",
    certsLead: "公開の認定確認ページがある資格はリンクしています。",
    writingLead: "AWSアーキテクチャ、クラウドセキュリティ、トラブルシューティングについての記録です。",
    result: { pass: "成功", fail: "失敗", fix: "修正" },
  },
};
const pathFor = (lang, p = "") => (lang === "ja" ? `/${p}` : `/en/${p}`);
const fmtDate = (d, lang) => {
  if (!/^\d{4}-\d{2}-\d{2}/.test(d ?? "")) return esc(d ?? "");
  const [y, m, day] = d.slice(0, 10).split("-").map(Number);
  return lang === "ja" ? `${y}年${m}月${day}日` : new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
};

// ── Layout ───────────────────────────────────────────────────────────────────
const CSP = "default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; img-src 'self' data:; connect-src 'none'; base-uri 'none'; form-action 'none'";

function page({ lang, title, description, body, path, type = "website" }) {
  title = plain(title);
  description = plain(description);
  const t = T[lang];
  const other = lang === "ja" ? "en" : "ja";
  const home = pathFor(lang);
  const nav = Object.entries(t.nav)
    .map(([k, v]) => `<a href="${home}#${k}">${v}</a>`)
    .join("");
  return `<!doctype html>
<html lang="${lang}" data-theme="auto">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<meta name="referrer" content="strict-origin-when-cross-origin">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${BASE}${pathFor(lang, path)}">
<link rel="alternate" hreflang="ja" href="${BASE}${pathFor("ja", path)}">
<link rel="alternate" hreflang="en" href="${BASE}${pathFor("en", path)}">
<link rel="alternate" hreflang="x-default" href="${BASE}${pathFor("ja", path)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="${type}">
<meta property="og:url" content="${BASE}${pathFor(lang, path)}">
<meta property="og:image" content="${BASE}/og.png">
<meta property="og:locale" content="${lang === "ja" ? "ja_JP" : "en_US"}">
<meta name="twitter:card" content="summary_large_image">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#0e1a2b" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#08101c" media="(prefers-color-scheme: dark)">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=JetBrains+Mono:wght@400;500&family=Noto+Sans+JP:wght@400;500;700&display=swap">
<link rel="stylesheet" href="/styles.css">
<script src="/site.js" defer></script>
</head>
<body>
<a class="skip" href="#main">${t.skip}</a>
<header class="top"><div class="wrap top-in">
  <a class="brand" href="${home}"><span class="brand-mark" aria-hidden="true"></span><span>${esc(plain(L(profile.name, lang)))}</span></a>
  <nav class="nav" aria-label="${lang === "ja" ? "メイン" : "Main"}">${nav}</nav>
  <div class="tools">
    <a class="lang" href="${pathFor(other, path)}" hreflang="${other}" lang="${other}" aria-label="${t.otherLabel}">${t.other}</a>
    <button class="theme" type="button" aria-label="${t.theme}" aria-pressed="false"><span aria-hidden="true"></span></button>
  </div>
</div></header>
<main id="main">
${body}
</main>
<footer class="foot"><div class="wrap foot-in">
  <p>${esc(t.footer)}</p>
  <p class="mono">${t.updated} ${esc(profile.site.updated)} · <a href="${pathFor(other, path)}" hreflang="${other}" lang="${other}">${t.other}</a></p>
</div></footer>
</body>
</html>
`;
}

const section = (id, n, title, lead, inner, cls = "") =>
  `<section id="${id}" class="sec ${cls}" aria-labelledby="${id}-h"><div class="wrap">
  <header class="sec-head"><h2 id="${id}-h">${title}</h2>${lead ? `<p class="lead">${lead}</p>` : ""}</header>
  ${inner}
</div></section>`;

const linkList = (links, lang) =>
  (links ?? []).map((l) => `<a class="ext" href="${esc(l.url ?? l)}" rel="noopener">${esc(l.label ? L(l.label, lang) : new URL(l).hostname)}<span aria-hidden="true">↗</span></a>`).join("");

// ── Home ─────────────────────────────────────────────────────────────────────
function home(lang) {
  const t = T[lang];
  const items = published.items ?? [];
  const projects = profile.projects.filter((p) => p.confirmed === true);
  const exportedProjects = items.filter((i) => i.kind === "project");
  const exportedCerts = items.filter((i) => i.kind === "certification" || i.kind === "evidence");
  const articles = [...items.filter((i) => i.kind === "article").map((a) => ({ ...a, external: true })), ...localArticles(lang)].sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)));

  const d = profile.drill;
  const drill = d
    ? `<figure class="drill" aria-labelledby="drill-t">
    <figcaption class="drill-head"><span class="drill-k mono">${esc(L(d.kicker, lang))}</span><span id="drill-t" class="drill-t">${esc(L(d.title, lang))}</span></figcaption>
    <ol class="drill-steps">${d.steps
      .map(
        (s, i) => `<li class="st st-${s.result}"><span class="st-r mono">${esc(T[lang].result[s.result])}</span><span class="st-n">${esc(L(s.name, lang))}</span>${s.detail ? `<code class="st-d">${esc(L(s.detail, lang))}</code>` : ""}</li>`,
      )
      .join("")}</ol>
    <p class="drill-foot">${esc(L(d.lesson, lang))} <a href="${pathFor(lang, `case-studies/${d.project}/`)}">${T[lang].caseStudy}<span aria-hidden="true"> →</span></a></p>
  </figure>`
    : "";
  const hero = `<section class="hero"><div class="wrap hero-in">
  <div class="hero-text">
    <p class="eyebrow mono">${esc(L(profile.role, lang))}</p>
    <h1>${esc(L(profile.name, lang))}</h1>
    <p class="headline">${esc(L(profile.headline, lang))}</p>
    <p class="intro">${esc(L(profile.intro, lang))}</p>
    <p class="cta"><a class="btn primary" href="#projects">${t.nav.projects}</a><a class="btn ghost" href="#contact">${t.nav.contact}</a></p>
    <dl class="facts">${profile.facts.map((f) => `<div><dt class="mono">${esc(L(f.label, lang))}</dt><dd>${esc(L(f.value, lang))}</dd></div>`).join("")}</dl>
  </div>
  ${drill}
</div></section>`;

  const about = section("about", 1, t.nav.about, "", `<div class="prose about">${L(profile.about, lang).map((p) => `<p>${esc(p)}</p>`).join("")}</div>`);

  const featured = (p) => `<article class="project featured">
  <div class="project-main">
    <p class="kicker mono">${esc(L(p.kicker, lang))}</p>
    <h3><a href="${pathFor(lang, `case-studies/${p.slug}/`)}">${esc(L(p.title, lang))}</a></h3>
    <p>${esc(L(p.summary, lang))}</p>
    ${p.metrics ? `<dl class="metrics">${p.metrics.map((m) => `<div><dt>${esc(L(m.label, lang))}</dt><dd>${esc(m.value)}</dd></div>`).join("")}</dl>` : ""}
    <ul class="tags">${p.tags.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
    <p class="actions"><a class="btn primary" href="${pathFor(lang, `case-studies/${p.slug}/`)}">${t.caseStudy}<span aria-hidden="true"> →</span></a>${linkList(p.links, lang)}</p>
  </div>
</article>`;
  const card = (p) => `<article class="project">
  ${p.status ? `<p class="kicker mono">${esc(L(p.status, lang))}</p>` : ""}
  <h3>${p.caseStudy ? `<a href="${pathFor(lang, `case-studies/${p.slug}/`)}">${esc(L(p.title, lang))}</a>` : esc(L(p.title, lang))}</h3>
  <p>${esc(L(p.summary, lang))}</p>
  ${p.tags?.length ? `<ul class="tags">${p.tags.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
  <p class="actions">${p.caseStudy ? `<a class="btn" href="${pathFor(lang, `case-studies/${p.slug}/`)}">${t.caseStudy}</a>` : ""}${linkList(p.links, lang)}</p>
</article>`;
  const exportedCard = (i) => `<article class="project">
  <p class="kicker mono">${i.status === "completed" ? t.completed : t.inProgress}${i.completedAt ? ` · ${fmtDate(i.completedAt, lang)}` : i.startedAt ? ` · ${fmtDate(i.startedAt, lang)}` : ""}</p>
  <h3>${esc(i.title[lang])}</h3>
  <p>${esc(i.summary[lang])}</p>
  ${i.awsServices?.length ? `<ul class="tags">${i.awsServices.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
  <p class="actions">${linkList(i.links, lang)}</p>
</article>`;
  const projectsHtml = section(
    "projects",
    2,
    t.nav.projects,
    t.projectsLead,
    `${projects.filter((p) => p.featured).map(featured).join("")}
  <div class="grid">${projects.filter((p) => !p.featured).map(card).join("")}${exportedProjects.map(exportedCard).join("")}</div>`,
  );

  const levels = Object.keys(profile.levels);
  const skills = section(
    "skills",
    3,
    t.nav.skills,
    t.skillsLead,
    `<ul class="legend" aria-label="${t.legend}">${levels.map((k) => `<li><span class="chip lv-${k}">${esc(L(profile.levels[k], lang))}</span></li>`).join("")}</ul>
  <div class="skills">${profile.skills
    .map(
      (g) => `<div class="skill-group"><h3>${esc(L(g.area, lang))}</h3><ul class="chips">${levels
        .flatMap((k) => g.items.filter((s) => s.level === k))
        .map((s) => `<li class="chip lv-${s.level}">${esc(L(s.name, lang))}<span class="sr"> (${esc(L(profile.levels[s.level], lang))})</span></li>`)
        .join("")}</ul></div>`,
    )
    .join("")}</div>
  <h3 class="sub">${t.languages}</h3><ul class="plain-list">${profile.languages.map((l) => `<li>${esc(l[lang])}</li>`).join("")}</ul>`,
  );

  const certRow = (c) => {
    const passed = c.status === "passed";
    const url = c.verificationUrl && !isDraft(c.verificationUrl) ? c.verificationUrl : null;
    return `<li class="cert ${passed ? "ok" : "todo"}">
  <span class="cert-badge mono">${passed ? t.passed : t.studying}</span>
  <div><p class="cert-t">${esc(L(c.title, lang))}</p><p class="cert-m">${esc(L(c.issuer, lang))}${c.date ? ` · ${isDraft(c.date) ? esc(c.date) : fmtDate(c.date, lang)}` : ""}${c.expires ? ` · ${t.expires} ${isDraft(c.expires) ? esc(c.expires) : fmtDate(c.expires, lang)}` : ""}</p></div>
  ${url ? `<a class="ext" href="${esc(url)}" rel="noopener">${t.verify}<span aria-hidden="true">↗</span></a>` : isDraft(c.verificationUrl) ? `<span>${esc(c.verificationUrl)}</span>` : ""}
</li>`;
  };
  const exportedCert = (c) => `<li class="cert ok">
  <span class="cert-badge mono">${c.verification === "verified" ? t.passed : esc(c.verification)}</span>
  <div><p class="cert-t">${esc(c.title[lang])}</p><p class="cert-m">${esc(c.issuer ?? "")}${c.date ? ` · ${fmtDate(c.date, lang)}` : ""}${c.expiresAt ? ` · ${t.expires} ${fmtDate(c.expiresAt, lang)}` : ""}</p></div>
  ${c.verificationUrl ? `<a class="ext" href="${esc(c.verificationUrl)}" rel="noopener">${t.verify}<span aria-hidden="true">↗</span></a>` : ""}
</li>`;
  const timeline = [...profile.timeline, ...exportedProjects.filter((p) => p.completedAt).map((p) => ({ date: p.completedAt, title: p.title, detail: p.summary }))].sort((a, b) => b.date.localeCompare(a.date));
  const certs = section(
    "certs",
    4,
    t.nav.certs,
    t.certsLead,
    `<div class="two">
  <ul class="certs">${profile.certifications.map(certRow).join("")}${exportedCerts.map(exportedCert).join("")}</ul>
  <div><h3 class="sub">${t.timeline}</h3><ol class="timeline">${timeline.map((m) => `<li><time class="mono" datetime="${esc(m.date)}">${fmtDate(m.date, lang)}</time><p class="tl-t">${esc(L(m.title, lang))}</p>${m.detail ? `<p class="tl-d">${esc(L(m.detail, lang))}</p>` : ""}</li>`).join("")}</ol></div>
</div>`,
  );

  const writing = section(
    "writing",
    5,
    t.nav.writing,
    t.writingLead,
    articles.length
      ? `<ul class="articles">${articles
          .map(
            (a) => `<li><a href="${a.external ? esc(a.links[0]) : pathFor(lang, `writing/${a.slug}/`)}"${a.external ? ' rel="noopener"' : ""}>
  <span class="a-meta mono">${a.publishedAt ? fmtDate(a.publishedAt, lang) : ""}${a.external ? ` · ${new URL(a.links[0]).hostname.includes("linkedin") ? t.onLinkedIn : esc(new URL(a.links[0]).hostname)} ↗` : a.minutes ? ` · ${a.minutes} ${t.min}` : ""}</span>
  <span class="a-t">${esc(L(a.title, lang))}</span>
  <span class="a-d">${esc(L(a.summary, lang))}</span></a></li>`,
          )
          .join("")}</ul>`
      : `<p class="empty">${t.writingEmpty}</p>`,
  );

  const contact = section(
    "contact",
    6,
    t.nav.contact,
    t.contactLead,
    `<ul class="contact">${profile.links.map((l) => `<li><a href="${esc(l.url)}" rel="me noopener"><span class="c-l">${esc(l.label)}</span><span class="c-n">${esc(L(l.note, lang))}</span><span aria-hidden="true" class="c-a">↗</span></a></li>`).join("")}</ul>`,
  );

  return page({ lang, title: `${L(profile.name, lang)} — ${L(profile.headline, lang)}`, description: L(profile.intro, lang).slice(0, 160), body: hero + about + projectsHtml + skills + certs + writing + contact, path: "" });
}

// ── Case studies & articles ──────────────────────────────────────────────────
function caseStudy(lang, p) {
  const md = readFileSync(`content/case-studies/${p.slug}.${lang}.md`, "utf8");
  const title = md.match(/^# (.*)$/m)?.[1] ?? p.slug;
  const lead = md.match(/^\*\*(.*)\*\*$/m)?.[1] ?? "";
  const diagram = p.diagram ? DIAGRAMS[p.diagram]?.(lang) : "";
  const meta = `<ul class="tags">${(p.tags ?? []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
  const body = `<div class="wrap narrow doc">
<p class="crumb"><a href="${pathFor(lang)}#projects"><span aria-hidden="true">← </span>${T[lang].back}</a></p>
<article class="prose">${markdown(md, { diagram })}</article>
${meta}
<p class="actions">${linkList(p.links, lang)}</p>
</div>`;
  return page({ lang, title: `${title} — ${plain(L(profile.name, lang))}`, description: lead, body, path: `case-studies/${p.slug}/`, type: "article" });
}

function localArticles(lang) {
  const dir = "content/articles";
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(`.${lang}.md`))
    .map((f) => {
      const md = readFileSync(join(dir, f), "utf8");
      const words = md.replace(/```[\s\S]*?```/g, "").split(/\s+/).length;
      return {
        slug: f.replace(`.${lang}.md`, ""),
        md,
        title: md.match(/^# (.*)$/m)?.[1] ?? f,
        summary: md.match(/^\*\*(.*)\*\*$/m)?.[1] ?? "",
        publishedAt: md.match(/<!-- date: (\d{4}-\d{2}-\d{2}) -->/)?.[1] ?? "",
        minutes: Math.max(1, Math.round((lang === "ja" ? md.length / 500 : words / 220))),
      };
    });
}
function article(lang, a) {
  const body = `<div class="wrap narrow doc">
<p class="crumb"><a href="${pathFor(lang)}#writing"><span aria-hidden="true">← </span>${T[lang].nav.writing}</a></p>
<p class="a-meta mono">${fmtDate(a.publishedAt, lang)} · ${a.minutes} ${T[lang].min}</p>
<article class="prose">${markdown(a.md)}</article>
</div>`;
  return page({ lang, title: `${a.title} — ${plain(L(profile.name, lang))}`, description: a.summary, body, path: `writing/${a.slug}/`, type: "article" });
}

// ── Write ────────────────────────────────────────────────────────────────────
// Empty dist/ rather than deleting it (a preview server may hold the folder open on Windows).
mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(OUT)) rmSync(join(OUT, f), { recursive: true, force: true });
const write = (p, html) => {
  const f = join(OUT, p);
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, draftMark(html));
};
const urls = [];
for (const lang of LANGS) {
  const pre = lang === "ja" ? "" : "en/";
  write(`${pre}index.html`, home(lang));
  urls.push(pre);
  for (const p of profile.projects.filter((x) => x.confirmed && x.caseStudy)) {
    write(`${pre}case-studies/${p.slug}/index.html`, caseStudy(lang, p));
    urls.push(`${pre}case-studies/${p.slug}/`);
  }
  for (const a of localArticles(lang)) {
    write(`${pre}writing/${a.slug}/index.html`, article(lang, a));
    urls.push(`${pre}writing/${a.slug}/`);
  }
}
for (const f of readdirSync("site")) cpSync(join("site", f), join(OUT, f), { recursive: true });
write(
  "404.html",
  page({
    lang: "ja",
    title: "404",
    description: "Not found",
    path: "",
    body: `<section class="hero"><div class="wrap"><p class="eyebrow mono">404</p><h1>ページが見つかりません</h1><p class="intro">Page not found.</p><p class="cta"><a class="btn primary" href="/">ホーム</a><a class="btn" href="/en/">Home (English)</a></p></div></section>`,
  }),
);
writeFileSync(join(OUT, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${BASE}/${u}</loc><lastmod>${profile.site.updated}</lastmod></url>`).join("\n")}\n</urlset>\n`);
writeFileSync(join(OUT, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${BASE}/sitemap.xml\n`);
writeFileSync(join(OUT, ".nojekyll"), "");

// Final privacy scan of everything that would be served (text files only).
const files = [];
const walk = (d) => readdirSync(d).forEach((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : files.push(join(d, f))));
walk(OUT);
const text = files.filter((f) => /\.(html|css|js|xml|txt|svg|json)$/.test(f));
const leaks = text.flatMap((f) => privacyProblems(readFileSync(f, "utf8").replace(/<[^>]+>/g, " ")).map((n) => `${f}: ${n}`));
if (leaks.length) {
  console.error("✗ BUILD BLOCKED — private data in output:\n  " + leaks.join("\n  "));
  process.exit(1);
}
const drafts = text.filter((f) => /class="confirm"/.test(readFileSync(f, "utf8")));
console.log(`✓ built ${files.length} files into ${OUT}/ · privacy scan clean${drafts.length ? ` · DRAFT: ${drafts.length} page(s) contain unconfirmed text (validation blocks deployment)` : ""}`);
