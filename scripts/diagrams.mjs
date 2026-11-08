// Architecture diagrams as real HTML (readable text, screen-reader friendly, reflows on
// phones) instead of images. Each lane is one flow through the system, left to right.
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** lanes: [{ name, steps: [{ svc, note, kind }] }] — kind: client | edge | compute | data | ops | ext */
function lanes(title, caption, list) {
  return `<figure class="arch" aria-label="${esc(title)}">
<div class="arch-lanes">${list
    .map(
      (l) => `<div class="lane"><p class="lane-n mono">${esc(l.name)}</p><ol class="lane-s">${l.steps
        .map((s) => `<li class="node k-${s.kind}"><span class="svc">${esc(s.svc)}</span>${s.note ? `<span class="note">${esc(s.note)}</span>` : ""}</li>`)
        .join("")}</ol></div>`,
    )
    .join("")}</div>
<figcaption>${esc(caption)}</figcaption>
</figure>`;
}

export const DIAGRAMS = {
  "cloud-career-hq": (lang) => {
    const ja = lang === "ja";
    return lanes(
      ja ? "Cloud Career HQ のアーキテクチャ" : "Cloud Career HQ architecture",
      ja
        ? "AWS 東京リージョン。すべてAmplify Gen 2（CDK）のコードで定義し、デプロイ前に24項目のインフラ検証を実行します。"
        : "AWS Tokyo region. Everything is defined as code with Amplify Gen 2 (CDK); 24 infrastructure assertions run before every deploy.",
      [
        {
          name: ja ? "リクエスト" : "Request path",
          steps: [
            { svc: ja ? "ブラウザ" : "Browser", note: "React SPA", kind: "client" },
            { svc: "Amplify Hosting", note: "CSP · HSTS", kind: "edge" },
            { svc: "Cognito", note: ja ? "MFA必須・管理者のみ作成" : "MFA · admin-created users", kind: "edge" },
            { svc: "AppSync", note: ja ? "所有者限定リゾルバー" : "owner-only resolvers", kind: "compute" },
            { svc: "DynamoDB", note: ja ? "9テーブル · PITR · 削除保護" : "9 tables · PITR · deletion protection", kind: "data" },
          ],
        },
        {
          name: ja ? "日次バックアップ" : "Daily backup",
          steps: [
            { svc: "EventBridge Scheduler", note: ja ? "毎日" : "daily", kind: "ops" },
            { svc: "Lambda", note: ja ? "読み取り＋1プレフィックス書き込みのみ" : "read tables, write one prefix", kind: "compute" },
            { svc: "S3", note: ja ? "非公開 · バージョニング · TLS必須" : "private · versioned · TLS-only", kind: "data" },
          ],
        },
        {
          name: ja ? "求人検索" : "Job search",
          steps: [
            { svc: "EventBridge Scheduler", note: "07:00 JST", kind: "ops" },
            { svc: "Lambda", note: ja ? "鍵はSSM SecureString" : "key in SSM SecureString", kind: "compute" },
            { svc: "OpenAI API", note: ja ? "月額上限 US$5" : "hard cap US$5 / month", kind: "ext" },
          ],
        },
        {
          name: ja ? "費用管理" : "Cost control",
          steps: [
            { svc: "AWS Budgets", note: ja ? "予算の200%で発動" : "fires at 200% of budget", kind: "ops" },
            { svc: "SNS", kind: "ops" },
            { svc: ja ? "費用ガード Lambda" : "Spend-guard Lambda", note: ja ? "サインイン停止・サイトをロック（削除なし）" : "disable sign-in, lock site — deletes nothing", kind: "compute" },
          ],
        },
        {
          name: ja ? "日次レポート・監視" : "Report & alarms",
          steps: [
            { svc: "Cost Explorer", note: ja ? "クレジット・カード請求" : "credits · card charges", kind: "ops" },
            { svc: "Lambda", note: "08:00 JST", kind: "compute" },
            { svc: "SES / SNS", note: ja ? "日次メール＋5つのアラーム" : "daily email + 5 alarms", kind: "ops" },
          ],
        },
      ],
    );
  },
};
