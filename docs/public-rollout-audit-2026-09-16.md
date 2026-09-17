# PSX Tracker — public rollout audit

**Date:** 16 September 2026  
**Source reviewed:** `D:\PSX45`, commit `d5d87769`  
**Decision: NO-GO for unrestricted public rollout.**

**17 September follow-up:** local fixes and requested public/account pages are implemented. See the [implementation report and remaining release checks](public-rollout-fixes-2026-09-17.md). Findings below preserve the original audit evidence.

The app builds, its current unit suite passes, and the public landing page works. However, four high-priority issues affect approval security, mutual-fund rendering, transaction deletion, and cloud data integrity. Fix these before inviting more users. Then complete the production checks below and run a small closed beta before a public launch.

This was an audit, not a release: application code, production accounts, database records, and deployment settings were not changed. Production configuration was not inspected through an administrator account. Local findings are not proof that the deployed version has the same code or that a conditional vulnerability is currently exploitable there.

## Evidence collected

| Check | Result | What it establishes |
|---|---|---|
| Current unit suite | **197 passed, 34 files** | Existing covered calculations and service behavior pass. |
| Production build | **Passed** | Assets and PWA worker can be generated. The build does not check TypeScript. |
| TypeScript check | **Failed: 67 diagnostics** | Includes genuine missing runtime symbols, alongside type/configuration problems. |
| Isolated PostgreSQL migration test | **Passed** | Alert ownership, legacy quarantine, cross-device quotas, claim/removal races, and RPC permissions work in the local test database. |
| Additional isolated audit probes | **8 defects/unsafe behaviors reproduced** | Database, email, and Google calls were mocked; two frontend callbacks were extracted directly from current source. Passing probes confirm the reported problems, not correctness. |
| Production dependency advisory scan | **0 known production npm vulnerabilities reported** | Point-in-time registry result; excludes development dependencies, Python dependencies, configuration, and application logic. |
| Public HTTP checks | **200** from the Vercel URL and `www.psx-tracker.com` | Both homepages respond and include CSP and HSTS headers. |
| Browser landing-page checks | **Passed at 390px and 320px widths** | Header CTA remains visible; Get Started reaches login; signup layout fits without horizontal page overflow. No captured warning/error logs on the initial landing view. |

Browser testing used the public [Vercel deployment](https://psx-45-naeh.vercel.app/). Viewport checks are not real iOS Safari or installed-PWA testing. No production approval links, alert runner calls, account creation, emails, or notifications were triggered.

## Fix before public rollout

### R01 — P1: Approval can fail open; approval links carry a reusable secret

**Source:** [approve-user.js:16](D:/PSX45/api/approve-user.js:16), [admin-users.js:25](D:/PSX45/api/admin-users.js:25).

When `APPROVE_SECRET` is absent and the query has no `secret`, both values are `undefined`. The equality check accepts the request. With working Supabase service credentials, an unauthenticated request can approve an arbitrary email. The isolated probe reached a service-role upsert and returned 200.

Even with configuration present, a GET request performs the approval, and the same token works for another email. The emailed URL is therefore a reusable credential rather than an expiring approval for one person. If a separate `ADMIN_SECRET` is not set, the admin endpoint accepts this same approval secret.

**Required change:** reject missing/blank configuration, separate admin authentication from approval links, and use expiring, single-use tokens bound to one account. Make GET display confirmation and perform the mutation through an authenticated/validated POST. Avoid exposing reusable credentials in query strings.

**Acceptance:** missing/empty secrets, wrong tokens, changed email, expired tokens, token replay, and GET requests cannot approve accounts. A valid confirmation approves only its intended account. These tests must use isolated fixtures, not live approval URLs.

### R02 — P1: An imported/uncatalogued mutual fund can crash the app

**Source:** [App.tsx:2065](D:/PSX45/src/components/App.tsx:2065), with further calls at lines 950, 951, 1767 and 2091; implementation exists in [fundDisplay.ts:16](D:/PSX45/src/utils/fundDisplay.ts:16).

`formatTransactionLabel` is called but never imported into App. When a portfolio contains an `MF:` transaction absent from the loaded catalog, the render-time `fundDisplayNames` calculation throws `ReferenceError`. The probe reproduced this using the actual callback and a synthetic imported fund. There is no application error boundary found in source to provide a recovery screen.

**Required change:** import the formatter, cover missing/stale catalog entries and fund conversion/profile fallbacks, and add a recovery boundary that preserves user data.

**Acceptance:** reload with a valid fund, a legacy/imported unknown fund, and an unavailable catalog; the dashboard and fund profile must remain usable.

### R03 — P1: Deleting the last transaction without Drive does not persist

**Source:** [App.tsx:1701](D:/PSX45/src/components/App.tsx:1701); device-only operation is explicitly supported by the UI at [App.tsx:2370](D:/PSX45/src/components/App.tsx:2370).

Local storage is updated only when there is a Drive user or at least one transaction. For an email/password user without Drive, deleting the final transaction skips persistence. The previous transaction remains in `psx_transactions` and returns on reload. Empty portfolios' other settings can also be skipped by this guard. The probe executed the current persistence callback and confirmed the old transaction remained stored.

**Required change:** persist empty state after authenticated initialization, while retaining explicit protections around sign-out and account changes.

**Acceptance:** create one trade, delete it, reload, and confirm it stays deleted without Drive. Also verify an empty portfolio's settings and account-switch isolation.

### R04 — P1: A stale tab/device can silently overwrite newer cloud trades

**Source:** [driveStorage.ts:253](D:/PSX45/src/services/driveStorage.ts:253), [driveStorage.ts:307](D:/PSX45/src/services/driveStorage.ts:307).

Drive saves replace the complete JSON snapshot. The queue serializes one app instance, but saves do not compare a remote revision or reconcile another device's edits. Recovery also chooses a pending local snapshot before reading remote data. A mocked remote containing device A's new trade was replaced by device B's stale snapshot; `saveToDrive` reported success and A's trade disappeared.

This limitation was already acknowledged in the A01–A10 implementation notes. It remains a launch issue because the product advertises cross-device portfolio sync.

**Required change:** add revision-aware conflict detection with a safe reconciliation/recovery path, or enforce a single active writer. Preserve both versions when a conflict cannot be merged safely. A warning alone does not prevent data loss.

**Acceptance:** two tabs/devices add, edit, and delete trades from the same starting version, including an offline retry. No change disappears silently; conflicts are resolved or clearly blocked with recoverable copies.

## Additional findings

| ID / priority | Finding and evidence | Improvement / acceptance |
|---|---|---|
| **R05 / P2** | **Horizontal chart drawings break selection.** [chartDrawings.ts:157](D:/PSX45/src/utils/chartDrawings.ts:157) references `plotTop` and `plotBottom` without taking them from `c`. The real exported hit-test function throws `plotTop is not defined` when it encounters a horizontal line. [StockChart.tsx:1816](D:/PSX45/src/components/StockChart.tsx:1816) calls this during drawing selection. | Use the coordinate bounds from `c`; test selecting/editing/deleting horizontal lines and mixed drawing types with mouse and touch. |
| **R06 / P2** | **Anonymous access lookup reveals membership details and creates unverified records.** [check-access.js:34](D:/PSX45/api/check-access.js:34) permits absent/invalid authentication. Probes confirmed an anonymous caller can retrieve another email's access status/expiry and create a pending row with `notify:false`. The limiter in [rateLimit.js](D:/PSX45/lib/rateLimit.js) is per-process memory. | Authenticate both supported login providers before returning account details or creating a request. Separate status reads from signup writes; reject invalid presented credentials. Add shared abuse limits. This finding does not establish access to another person's portfolio. |
| **R07 / P2** | **Email login has no password-recovery journey.** [LoginPage.tsx:38](D:/PSX45/src/components/LoginPage.tsx:38) exposes login/signup only; no reset-password request or recovery handler was found. The public form confirms the missing control. | Add a complete recovery flow with allowed redirect URLs and neutral responses, then test expired/used links and returning to login. Add persistent field labels and autocomplete hints while updating the form. |
| **R08 / P2** | **Deployment can ship known runtime errors.** [package.json](D:/PSX45/package.json) builds without type checking. The only checked-in workflows run market jobs, not release validation. The 67 diagnostics include R02 and R05; many others are React/icon typings or missing Vite environment types. | Fix the type-check baseline and require type checking, unit tests, and build in CI. Add targeted regressions for these reproduced bugs. Do not suppress missing-symbol errors to obtain a green build. |
| **R09 / P2** | **Public market-data work has no code-level request budget.** [pypsx.py:67](D:/PSX45/api/pypsx.py:67) dispatches unauthenticated requests; [pypsx_lib.py:510](D:/PSX45/api/pypsx_lib.py:510) accepts an uncapped symbol list and fetches sequentially. The function can run for 90 seconds. Edge protection may exist, but was not verified. | Bound batch size, symbol syntax, periods and execution time; add shared rate limits, upstream concurrency limits and cached responses. Test rejection with mocks, followed by a bounded staging load test. |
| **R10 / P2** | **Connection/server errors are presented as pending approval.** [auth.ts:70](D:/PSX45/src/services/auth.ts:70) does not check `res.ok` and converts fetch failure to inactive/pending. An approved user can be redirected to the approval gate during an outage. This also conflicts with advertised offline viewing at startup. | Represent unavailable/offline separately from pending. Provide retry and define a deliberate cached read-only mode without weakening server authorization. Test offline, timeout, 429 and 503 behavior. Offline behavior was assessed from source, not a full installed-PWA test. |
| **R11 / P2** | **Mobile startup performance remains a risk.** Fresh build: main JS **1,844.84 kB / 482.29 kB gzip**; vendor **822.29 kB / 228.86 kB gzip**; PWA precache **3,273.25 KiB**. [App.tsx](D:/PSX45/src/components/App.tsx) eagerly imports many authenticated tools. | Separate the landing/login bundle from the application and load major tools on demand. Measure cold-start performance on a representative low-end phone and slow connection. File sizes alone do not establish actual user timings. |
| **R12 / P3** | **Trial duration is inconsistent.** [index.html:15](D:/PSX45/index.html:15) and social metadata advertise 15 days; landing copy and [access.js:11](D:/PSX45/lib/access.js:11) default to 7 days. | Use one product configuration for trial messaging and behavior; verify search/social previews after deployment. |

## Production evidence still required

These are unverified release gates, not claims that configuration is broken.

| Gate | Evidence required before launch |
|---|---|
| **Google public OAuth access** | Confirm the production client, allowed origins/redirects, audience, publishing status and scope verification. Current sign-in requests `gmail.readonly` together with Drive/Sheets at [driveStorage.ts:17](D:/PSX45/src/services/driveStorage.ts:17). Google classifies this Gmail scope as restricted and requires the applicable verification process. Request Gmail access only when needed for import, or disable that feature until ready. See [Google's scope documentation](https://developers.google.com/workspace/gmail/api/auth/scopes). Testing-mode projects are limited to listed test users and, with these scopes, authorizations expire after seven days; the actual project's status was not inspected. See [Google's audience documentation](https://support.google.com/cloud/answer/15549945?hl=en). |
| **Production alert migration and access rules** | Verify [20260914_alert_safety.sql](D:/PSX45/migrations/20260914_alert_safety.sql) is applied to the same database used by production. Verify anonymous/authenticated clients cannot read or modify other users' allowlist/alert records. Local migration tests do not prove deployed RLS or schema. |
| **Secrets, scheduler and delivery** | Verify nonempty, separate admin/approval credentials, the matching cron secret, VAPID keys, approved email sender and actual successful scheduled runs. Use two controlled accounts to prove ownership and account-wide quotas. Send a controlled test notification only to an authorized tester; record expected and actual delivery. |
| **Real signed-in device acceptance** | Test iPhone Safari, installed iPhone PWA, Android Chrome and desktop. Cover stock-profile tables, chart page scrolling/drawing, keyboard-open forms, safe-area header behavior, light/dark branding, favicon/home-screen icons, import/export, reload, token expiry, sign-out/account switching and offline/reconnect. Desktop viewport emulation cannot certify iOS safe areas or push behavior. |
| **Recovery and operations** | Demonstrate restoring a known portfolio export/backup, monitoring failed sync/API jobs and client crashes, and reverting a deployment without breaking the alert schema. Confirm who handles manual approvals, payment activation, support and data-removal requests. Review privacy disclosures against actual Google/Gmail/AI/OCR data flows. |

No full penetration test, external financial-calculation certification, Python/development dependency audit, production load test, live Google write, email delivery test, or signed-in end-to-end journey was completed. Existing unit coverage is useful evidence, but does not replace these checks.

## Suggested release sequence

1. **Correct the unsafe paths:** R01–R06, especially data persistence and the two runtime failures; add regressions and a clean type-check/build gate.
2. **Complete onboarding and reliability:** password recovery, clear network/offline states, API limits, accurate trial copy and mobile startup improvements.
3. **Verify production configuration:** complete every gate above against the intended release. Record the deployed commit, migration version and test results.
4. **Run a small closed beta:** exercise actual imports, exports, multi-device conflicts, mobile charts and one market-session alert cycle with volunteer testers. Use synthetic portfolios until data recovery is proven.
5. **Open public access only after:** no unresolved P1, core advertised journeys pass, OAuth permits the intended audience, and backup/monitoring/rollback procedures have been demonstrated.

## Reproduction and local evidence

Standard checks:

```powershell
npm test
npx tsc -p src/tsconfig.json --noEmit --pretty false
npm run build
npm audit --omit=dev --json
node scripts/test-alert-db.mjs
```

The database test requires the existing isolated PGlite tooling described in [the A01–A10 implementation notes](D:/PSX45/docs/audit-a01-a10-implementation.md). Do not point audit probes at a production database.

This audit's additional probes and logs are local, ignored artifacts under `D:\PSX45\.audit-tools`:

- `rollout-audit.test.ts` and `rollout-audit.config.ts` — eight isolated reproduction probes; run with `npx vitest run --config .audit-tools/rollout-audit.config.ts`.
- `rollout-probes.txt`, `rollout-typecheck.txt`, `rollout-build.txt`, `rollout-npm-audit.json` — captured outputs.

The build's generated-file changes were restored after inspection. The report is the only intended source-controlled change from this audit; pre-existing dependency-directory changes were left untouched.
