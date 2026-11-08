// Publication rules. Mirrors cloud-career-hq/src/domain/publish.ts so that
// content is checked twice: once when approved in the private app, and again
// here in CI before anything is deployed.

export const PRIVACY_PATTERNS = [
  { name: "email address", re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/ },
  { name: "phone number", re: /(?:\+\d{1,3}[\s-]?\d{1,4}[\s-]?\d{2,4}[\s-]?\d{3,4}\b|\b0\d{1,4}-\d{1,4}-\d{4}\b|\b0\d{9,10}\b)/ },
  { name: "IP address", re: /\b(?:\d{1,3}\.){3}\d{1,3}\b/ },
  { name: "AWS access key", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { name: "AWS account id", re: /\b\d{12}\b/ },
  { name: "GitHub token", re: /\b(?:ghp_|github_pat_|gho_)[A-Za-z0-9_]{16,}/ },
  { name: "API key", re: /\b(?:sk-[A-Za-z0-9_-]{16,}|AIza[0-9A-Za-z_-]{30,}|xox[abp]-[A-Za-z0-9-]{10,}|ntn_[A-Za-z0-9]{20,}|secret_[A-Za-z0-9]{20,}|re_[A-Za-z0-9]{20,})/ },
  { name: "private key", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: "password assignment", re: /\b(?:password|passwd|pwd|secret|token)\s*[:=]\s*\S+/i },
  { name: "localhost / private URL", re: /\b(?:localhost|127\.0\.0\.1|\.local\b|\.internal\b)/i },
];

/** Unresolved draft markers block validation (and therefore deployment). */
export const CONFIRM_MARKER = /\[\[CONFIRM/;

export function privacyProblems(text) {
  return PRIVACY_PATTERNS.filter((p) => p.re.test(text)).map((p) => p.name);
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const isHttps = (u) => {
  try {
    return new URL(u).protocol === "https:";
  } catch {
    return false;
  }
};
const bi = (v) => v && typeof v === "object" && typeof v.en === "string" && typeof v.ja === "string" && v.en.trim() && v.ja.trim();

/** Exact keys allowed per item kind in content/published.json (export from the private app). */
const COMMON = ["kind", "slug", "title", "summary", "links", "approvedAt", "hash"];
export const ALLOWED_KEYS = {
  project: [...COMMON, "status", "awsServices", "startedAt", "completedAt"],
  certification: [...COMMON, "issuer", "date", "expiresAt", "verification", "verificationUrl"],
  evidence: [...COMMON, "issuer", "date", "expiresAt", "verification", "verificationUrl"],
  article: [...COMMON, "publishedAt"],
};

export function validatePublished(file) {
  const errs = [];
  if (!file || file.format !== "cloud-career-hq-portfolio" || file.version !== 1) return ["published.json: not a cloud-career-hq-portfolio v1 export"];
  if (!Array.isArray(file.items)) return ["published.json: items must be a list"];
  const slugs = new Set();
  file.items.forEach((it, i) => {
    const at = `published.json item ${i + 1} (${it?.slug ?? "?"})`;
    const allowed = ALLOWED_KEYS[it?.kind];
    if (!allowed) return errs.push(`${at}: unknown kind "${it?.kind}"`);
    for (const k of Object.keys(it)) if (!allowed.includes(k)) errs.push(`${at}: field "${k}" is not allowed for ${it.kind}`);
    if (!SLUG.test(it.slug ?? "")) errs.push(`${at}: invalid slug`);
    if (slugs.has(it.slug)) errs.push(`${at}: duplicate slug`);
    slugs.add(it.slug);
    if (!bi(it.title)) errs.push(`${at}: title needs en and ja`);
    if (!bi(it.summary)) errs.push(`${at}: summary needs en and ja`);
    if (!Array.isArray(it.links) || it.links.some((l) => !isHttps(l))) errs.push(`${at}: links must be https URLs`);
    if (typeof it.approvedAt !== "string" || typeof it.hash !== "string") errs.push(`${at}: missing approval (approvedAt/hash)`);
    if (it.kind === "certification" && (it.verification !== "verified" || !isHttps(it.verificationUrl ?? "")))
      errs.push(`${at}: certifications must be verified with an https verificationUrl`);
    if (it.kind === "project" && !["in-progress", "completed"].includes(it.status)) errs.push(`${at}: project status must be in-progress or completed`);
    if (it.kind === "article" && !it.links?.length) errs.push(`${at}: article needs its public URL in links`);
  });
  return errs;
}

/** Scan any text (content files or built HTML) for private data and draft markers. */
export function scanText(where, text) {
  const errs = privacyProblems(text).map((n) => `${where}: contains a ${n}`);
  if (CONFIRM_MARKER.test(text)) errs.push(`${where}: unresolved [[CONFIRM …]] marker — confirm or remove before publishing`);
  return errs;
}
