# Cloud Career HQ

**A private, cost-guarded AWS application for running my own job search.**

Status: **deployed to AWS (Tokyo) on 7 November 2026** after an approval step. The real app is private and sign-in only, so the link below is a [public demo with fictional data](https://sabstha.github.io/cloud-career-hq-demo/).

## The problem

Moving into cloud infrastructure from a support role means tracking many things at once:
- job postings and their real requirements
- which skills I can actually prove
- certifications, lab projects and study notes
- what to learn next

Spreadsheets hid the most important question: *for the jobs I want, which requirements can I back with evidence today?*

## What it does

- **Job radar.** Saves postings with requirement lists, warns about duplicates, and never guesses missing facts (salary or remote policy stay "not stated").
- **Rule-based readiness.** A requirement counts as *met* only with verified, unexpired evidence or a completed project with a repository or documentation link. Self-reported items count as *partial*. No AI scores and no invented probabilities.
- **Evidence, projects, learning log, skills and LinkedIn drafts,** all linked to each other.
- **JSON export/import** with structural validation. A bad file can never silently overwrite data.
- **Publishing.** Records are private by default. I approve individual items; only whitelisted fields are exported to this portfolio. Any later change requires re-approval.

## Architecture (AWS, Tokyo region)

| Layer | Service | Key settings |
|---|---|---|
| Sign-in | Amazon Cognito (Lite tier) | Admin-created users only, TOTP MFA required, 12+ character passwords, 60-minute tokens, guest identities off |
| API | AWS AppSync (GraphQL) | Cognito user pools only, no API key; every model is owner-only, and the owner field cannot be reassigned |
| Data | Amazon DynamoDB, on-demand, 9 tables | Point-in-time recovery; production tables have deletion protection, are retained, and destructive schema updates are disabled |
| Backup | EventBridge Scheduler → Lambda → S3 | Daily export in the app's own import format; private, versioned, TLS-only bucket |
| Monitoring | CloudWatch → SNS → email | 5 alarms (API errors, rejected-request spike, backup / job search / cost report failed) plus a daily cost email (SES) that also checks whether the scheduled jobs ran |
| Job search | EventBridge Scheduler → Lambda → OpenAI | Daily web search for postings, verification and analysis; manual refresh limited to 2 a day; hard monthly cap of US$5 |
| Cost | AWS Budgets → SNS → Lambda | Spend guard (see below) |
| Hosting | Amplify Hosting | Tests and infrastructure assertions run before every deploy; security headers (CSP, HSTS) |

Everything is defined as code with Amplify Gen 2 (AWS CDK).

## Security decisions

- **Authorization is enforced by the backend, not the UI.** I checked the generated resolver code to confirm two things: every query and mutation compares the record owner with the caller's Cognito identity, and callers can't set the owner field.
- **No public sign-up and MFA for everyone.** It is a single-user private app, so self-registration only adds attack surface.
- **Data survives mistakes.** There is point-in-time recovery for 35 days, a daily off-database export, and Retain plus deletion protection on production data.
- **Least privilege.** The backup function can read the tables and write one S3 prefix, nothing else. The spend guard can change one Amplify branch and one user pool.
- **No secrets in the frontend or the repository.** The publishing pipeline also scans every public item for emails, phone numbers, IP addresses, keys and tokens before export, and again in CI.

## Testing: offline first, then on real AWS

Before spending anything on AWS, I wanted evidence the design is right:

- **24 infrastructure assertions** run against the *real* CloudFormation the deploy uses, synthesized locally with no AWS account. They check MFA, no API key, owner-only resolvers, PITR, bucket policies, alarms, budget settings and the exact permissions of each function.
- **142 unit and UI tests.** They include cross-user isolation (another user can't read, change, delete or claim a record), backup → restore round trips, retry and resume of unsynced changes, and the publishing rules.
- **15 real-browser end-to-end checks** run against the live demo: create, edit, search and delete in every module, export/import, recovery from corrupted saved data, two-tab sync, and the 390 px mobile layout.

All of these run again before every production deploy. Then, on a temporary copy of the stack on real AWS:

- **Cross-user test: 9/9 passed** against the deployed API.
- **Restore drill: 7/7 passed** (create data → back up → wipe → restore → compare). Its first run **found a real bug the offline tests had missed**: every save was rejected with `Unauthorized on [id]`, because a field-level rule on `owner` makes AppSync check every input field and the implicit `id` was not on its list. The fix was one explicit field, plus a new assertion so it can't come back.
- **Alarm drill and spend-guard drill passed.** The guard disabled a test user and re-enabled it; nothing was deleted.

Lesson from the first day live: "job didn't run" alarms that treat missing data as a failure fired falsely before the first scheduled run. I replaced them with a check inside the daily email.

## Cost, and why a budget is not a limit

Estimated cost is **≈ US$3.2 / month (≈ ¥485)** at list price with no credits. About 63% of that is build minutes. A daily email reports remaining credits, anything charged to the card, and the days left before the credits expire, and reminds me to remove the app 30 days before that date.

AWS Budgets does not stop spending. Billing data arrives 8–24 hours late, so I designed a **spend guard** with stated limits:

- **What it does:** at 200% of the monthly budget (≈ ¥2,000), a Lambda function puts the site behind a lock, stops automatic builds, and disables and signs out every user. It deletes nothing.
- **What it can't do:** undo spend that has already happened, or cut off access tokens that were already issued (they last up to 60 minutes). Storage, backups and alarms keep billing a few cents a month.

Writing these limits down was part of the design. A guard that only appears safe is worse than no guard.

## What is not done

- Gmail job-alert ingestion is built but not connected yet; jobs come from web search only.
- Backups are versioned but live in the same AWS account as production, with no Object Lock. Isolating them is my next lab.
- The source repository is private while it contains my personal data model and deployment details.

## My role and how it was built

I defined the requirements and constraints: privacy, a cost ceiling, honesty rules for readiness, and no deployment without approval. I reviewed and approved the architecture, and checked the results against the tests and the generated infrastructure. The implementation, tests, documentation and the AWS drills were produced and run with an AI coding assistant (Claude Code) under my direction, with each deployment step approved by me.

## Links

- [Live demo (fictional data, stored only in your browser)](https://sabstha.github.io/cloud-career-hq-demo/)
