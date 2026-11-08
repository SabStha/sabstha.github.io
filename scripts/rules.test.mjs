import { test } from "node:test";
import assert from "node:assert/strict";
import { privacyProblems, scanText, validatePublished } from "./rules.mjs";

const item = (over = {}) => ({
  kind: "project",
  slug: "vpc-lab",
  title: { en: "VPC lab", ja: "VPCラボ" },
  summary: { en: "Two-tier VPC.", ja: "2層VPC。" },
  links: ["https://github.com/SabStha/example"],
  status: "in-progress",
  awsServices: ["VPC"],
  startedAt: "2026-11-01",
  completedAt: null,
  approvedAt: "2026-11-07T00:00:00.000Z",
  hash: "abc123",
  ...over,
});
const file = (items) => ({ format: "cloud-career-hq-portfolio", version: 1, exportedAt: "2026-11-07T00:00:00.000Z", items });

test("a valid export passes", () => assert.deepEqual(validatePublished(file([item()])), []));
test("rejects wrong format", () => assert.equal(validatePublished({ format: "x", version: 1, items: [] }).length, 1));
test("rejects fields outside the whitelist (e.g. private notes)", () =>
  assert.match(validatePublished(file([item({ notes: "private" })])).join(), /"notes" is not allowed/));
test("requires both languages", () => assert.match(validatePublished(file([item({ title: { en: "x", ja: "" } })])).join(), /title needs en and ja/));
test("requires approval metadata", () => assert.match(validatePublished(file([item({ hash: undefined })])).join(), /missing approval/));
test("rejects non-https links", () => assert.match(validatePublished(file([item({ links: ["http://x.com"] })])).join(), /https/));
test("rejects duplicate slugs", () => assert.match(validatePublished(file([item(), item()])).join(), /duplicate slug/));
test("planned projects are not publishable", () => assert.match(validatePublished(file([item({ status: "planned" })])).join(), /status/));
test("certifications must be verified with a URL", () => {
  const cert = { kind: "certification", slug: "ccp", title: { en: "CCP", ja: "CCP" }, summary: { en: "x", ja: "x" }, links: [], approvedAt: "t", hash: "h", issuer: "AWS", date: "2026-01-01", expiresAt: null, verification: "self-reported", verificationUrl: null };
  assert.match(validatePublished(file([cert])).join(), /verified/);
  assert.deepEqual(validatePublished(file([{ ...cert, verification: "verified", verificationUrl: "https://www.credly.com/badges/x" }])), []);
});
test("privacy scan catches private data", () => {
  for (const s of ["me@example.com", "10.0.0.12", "AKIAABCDEFGHIJKLMNOP", "123456789012", "password: hunter2", "http://localhost:3000", "-----BEGIN RSA PRIVATE KEY-----", "090-1234-5678"])
    assert.ok(privacyProblems(s).length, s);
  assert.deepEqual(privacyProblems("Cognito with MFA, 60-minute tokens, ≈ ¥485 per month"), []);
});
test("unresolved CONFIRM markers block publishing", () => assert.match(scanText("x", "[[CONFIRM: name]]").join(), /CONFIRM/));
