# PSX Tracker — rollout fixes and release checklist

**Updated:** 17 September 2026. **Status:** earlier rollout fixes activated; the subsequent password-to-Drive integration is tested locally and its new server-only table is applied, but server secrets, deployment and live acceptance remain pending. See [remembered-drive activation](remembered-drive-activation-2026-09-17.md). The earlier database migrations, deployment and one authorized recovery email test were verified. No real portfolio/Drive write, WhatsApp message or new test account was created during these checks.

This follows the [16 September audit](public-rollout-audit-2026-09-16.md). That report records the original findings; it is not the current implementation status.

**Activation follow-up:** authentication URLs, verification/password policy, custom SMTP and the Production admin secret are configured. The owner approved the small sync-metadata records; database functions and permissions were verified after migration. Public routes, the deployed Python quote worker and anonymous API rejection passed live checks. Database size remained 11 MB. A subsequent phone-to-web conflict exposed confusing Retry behavior; the follow-up provides Load latest and preserves both pending and current local data. See [activation status](release-activation-status-2026-09-17.md) for deployment evidence and outstanding real-device acceptance.

## Audit fixes

| Finding | Implemented change | Verification |
|---|---|---|
| R01 — approval security | Approval links use random, email-bound tokens stored as hashes with a 24-hour expiry. GET displays confirmation; POST atomically consumes the token once. Admin access requires its separate header-only `ADMIN_SECRET`. Missing configuration fails closed. | Route tests cover legacy credentials, no mutation on GET, wrong origin, expiration and email binding. PostgreSQL tests cover single use and replay. |
| R02 — unknown mutual funds | Imported the missing formatter. Added an error boundary with reload and read-only cached-record recovery. | Type check, formatter regression, full suite and build. A live imported-fund journey still belongs in device acceptance. |
| R03 — empty local portfolio | Authenticated persistence saves empty transactions. Account-owned local caches archive before an account switch; a full storage device stops the switch before removing records. | Empty-state guard and account isolation tests. A legacy untagged cache is attributed to the first account that opens it after this update. |
| R04 — cloud conflicts | Immutable Drive snapshots plus a database compare-and-swap revision prevent a stale client from replacing the current backup. Pending data is retained, including after failed/ambiguous saves. Restore reads the remote backup first and archives local pending data before reload. | Drive tests cover stale preflight, concurrent commit, offline/error recovery, serialized saves, ambiguous responses, account switching during a request, download and Restore. PostgreSQL tests cover competing writers, idempotency, isolation and retention. |
| R05 — chart drawings | Horizontal-line hit testing uses the supplied chart plot bounds. | Bounds regression and type check. Real touch drawing remains a device check. |
| R06 — account lookup | Verified Google or verified-email Supabase identity is required. Lookup is read-only; access requests are separate authenticated writes. Shared database limits replace process-only protection on these routes. | Anonymous/mismatched requests are rejected; lookup cannot insert. Unverified Supabase emails are rejected. |
| R07 — password recovery | Forgot password, email-link password setup, new-password confirmation, expired-link recovery and signed-in password changes. Persistent labels and 16px mobile inputs. | Password service tests, browser form checks and one owner-confirmed live recovery email. Complete setup/reset/login acceptance remains open. |
| R08 — release validation | Fixed the TypeScript baseline; production build now runs type checking. Added CI for TypeScript, unit tests, production build, Python tests and both SQL suites. | All local checks pass. Configure the CI job as a required branch/deployment check. |
| R09 — request budgets | Public market endpoints validate symbols, batches (20), periods and intervals; apply shared limits and timeouts. Python work runs in a subprocess with a 35-second deadline, four per-process slots and a bounded response cache. Redirects stay within the allowed upstream hosts, including Sheets export redirects. | Mocked parameter/deadline tests. No production load test performed. Per-process concurrency is not a global cap across all serverless instances. |
| R10 — outages | Access checks distinguish unavailable/429/503/offline from genuine pending approval. Retry and deliberate read-only cached viewing are available. | Auth outage tests and invalid password-link browser check. Installed-PWA offline startup still needs a device test. |
| R11 — startup | Landing/login load separately from the portfolio app; major tools load on demand. PWA precaches the small shell and public pages; visited tool scripts are cached on demand. | Production build metrics below and browser cold navigation. |
| R12 — trial copy | `config/product.js` supplies the seven-day trial to access rules, landing copy and built metadata. | SEO tests pass; both old trial-copy failures are resolved. |

## Completed sync-footer integration

The other task’s compact footer, pending age/ID, short error, Retry, Restore and Keep pending controls have been retained and tested against the versioned `/api/cloud-sync` flow.

- Fixed an additional visual bug: the collapsed Details popover was clipped by the sidebar. It now renders outside that clipping area, stays within the viewport, closes with Escape and manages focus.
- Keep pending downloads the local snapshot without deleting it.
- Restore asks for confirmation. A missing/unreadable remote backup leaves pending data intact. A successful restore archives the pending snapshot before reloading.
- Sign-out preserves account-specific pending/recovery copies while clearing the active local portfolio. Shared-device users should remove these copies through browser storage controls after exporting anything they need.
- Up to 20 committed Drive snapshots are retained. Older app-marked snapshots are moved to trash on a best-effort basis. A failed/conflicted upload can leave an extra recovery file.
- The Google Sheet is a derived export. It is not the authoritative transaction store and simultaneous exports can require another refresh. Restore and conflict decisions use the immutable Drive backup and server revision.
- After the reported phone-to-web conflict, the conflict action was changed from Retry to **Load latest**, with explicit recovery guidance. **Download local copy** replaces the ambiguous Keep pending label. Recovery also archives current web edits, pauses new writes, waits for existing saves and rejects incomplete cloud backups before clearing pending data. The owner confirmed actual phone-to-web recovery works after the fix.

## New public and account pages

| URL / location | Behavior |
|---|---|
| `/` | Crawlable fallback content, accessible public links, FAQ, corrected privacy summary and consistent trial messaging. |
| `/login` | Dedicated mobile login/signup screen, Google login, Forgot password, terms and privacy links. Excluded from indexing. |
| `/about` | What the app does, sign-in choices, independence and research limitations. |
| `/privacy` | Actual account, browser, Drive/Sheets, optional Gmail, AI/OCR, alert and support data flows, recovery retention and deletion requests. |
| `/terms` | Account responsibilities, research limitations, trial/plans, manual payments, backups, availability and support. |
| `/contact` | Email and WhatsApp links plus guidance for account, sync, privacy and product questions. |
| `/suggestions` | Requires app sign-in/access. Prepares a user-written email or WhatsApp draft; the user sends it in that service. No portfolio or account data is attached automatically, and the UI does not falsely claim delivery. |
| `/settings/profile` | Profile & Security in the sidebar: account details, current-password verification, change password, password setup and reset emails. |
| `/reset-password` | Handles setup/recovery email sessions; validates and confirms the new password. Invalid/expired links show a route back to login. |

Public contact details are **itruth2011@gmail.com** and **+92 347 4440983**, supplied by the owner. The WhatsApp link uses Pakistan’s country code. No company entity, registered address or jurisdiction was invented.

About, Privacy, Terms and Contact are generated as standalone HTML with unique titles, descriptions and canonical URLs, and appear in the sitemap. They remain readable without JavaScript. The small theme script respects the app’s saved preference; CSS supplies a system-theme fallback. Login, reset and private app routes receive `noindex` headers on Vercel. Public pages include the selected green/cyan brand and dark-mode assets.

### How Google users add a password

Google Drive OAuth and Supabase email authentication are separate systems. The optional first-use prompt offers a secure setup email. Supabase verifies control of that same email before the user chooses a password on `/reset-password`. The account’s existing email-based access approval still applies; the flow does not auto-approve a user. The prompt can be skipped and reopened through Profile & Security; its dismissal is remembered on this device.

This adds an alternative email login. It does not change the Google password, grant Drive permission to an email-only session, or replace an existing password silently. Signed-in password changes first verify the current password in an isolated, non-persistent session for the same email. If verification or the update fails, the UI offers the email reset route.

## Local evidence

- **250 unit tests passed across 41 files**, including **23 Drive tests** and the sync-health helpers. The previously reported two SEO failures now pass.
- **TypeScript and production build passed.**
- Both isolated PostgreSQL suites passed: alert migration/ownership/races and rollout approval/rate-limit/cloud-version behavior.
- **Two Python tests passed** for input bounds and subprocess deadline behavior. The external market SDK itself was not exercised by those tests.
- Browser checks covered 320px/390px public/login layouts, visible Get Started, signup labels and input sizes, Forgot password, invalid reset links, password-setup popup and persistent dismissal, signed-out suggestions gating, and prepared feedback links without sending them.
- Expanded and collapsed footer controls were exercised using the actual Sidebar component with synthetic data; the corrected popover was visually verified at 1280px. Service tests verify real callback behavior with mocked cloud requests. No live two-device Google write was attempted.
- Build output was isolated in `.audit-tools/rollout-dist`; tracked production assets and the bundled NAV catalog were preserved.

Initial landing JavaScript is approximately **146.5 kB gzip**, down from **711.2 kB** at audit time (about **79% less**). PWA precache is approximately **673 KiB**, down from **3,273 KiB**. These are generated asset sizes, not measured phone load times. The authenticated app remains larger and still needs a low-end-phone performance check.

## Release checklist

**Completed activation:** the two migrations and protected grants/functions, authentication URL/password/SMTP settings, Production admin-secret configuration and the owner's backend/frontend deployment were verified. Live public routes, private noindex headers, the request-access alias and the Python subprocess passed smoke checks; one authorized recovery email test worked. The original checklist below records the requirements and operating constraints. Remaining acceptance is listed in [activation status](release-activation-status-2026-09-17.md); not every signed-in journey has passed yet.

1. **Apply database migrations to the production database before deploying this code.** Verify `20260914_alert_safety.sql` first, then apply `20260917_public_rollout.sql`. The latter requires the existing allowlist table and creates approval tokens, shared request limits, cloud heads and service-role-only functions. Confirm anonymous/authenticated clients cannot access protected tables or RPCs. The new endpoints deliberately return unavailable if this migration is missing.
2. **Set server configuration:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, a separate nonempty `ADMIN_SECRET`, `APP_URL=https://www.psx-tracker.com`, `OWNER_EMAIL`, `BREVO_API_KEY` and the verified `BREVO_SENDER`. Retain correct scheduler/VAPID settings for alerts. Never expose service/admin secrets through `VITE_` variables. Old reusable `APPROVE_SECRET` URLs are intentionally rejected; issue fresh links or use authenticated admin approval.
3. **Configure email authentication:** set the matching public `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` at build time. Enable email sign-in and configure production Site URL plus an allowed `https://www.psx-tracker.com/reset-password` redirect. Password setup uses Supabase’s magic-link/OTP email with `shouldCreateUser`; keep that template’s confirmation link intact. Forgot password uses the recovery template. Use working production SMTP and validate delivery/rate limits with controlled tester accounts. Test new Google-only users, existing password users, expired/reused links and wrong-current-password handling. Recommended provider protections include suitable password requirements and leaked-password checks where available.
4. **Confirm Google OAuth production readiness:** client/domain/origin settings and the published public homepage/privacy/terms URLs. Gmail is now incremental, requested only for import; any required restricted-scope verification is still a release requirement. The code change is not Google verification approval.
5. **Deploy backend and frontend together, then require users to reload old tabs.** Old app versions do not participate in the new cloud protocol. Keep the legacy Drive JSON as a recovery source until migration acceptance is complete. Do not roll back to a writer that blindly overwrites the old backup as if it were current. Use a previous version containing the safe protocol or temporarily disable writes during recovery.
6. **Confirm server packaging and routes in staging.** Python helpers moved to `lib/market` and are explicitly included in the Python function. `/api/request-access` rewrites to the authenticated `notify-signup` handler, keeping 12 API entrypoints. Confirm this alias, static public pages, private noindex headers, and the Python subprocess work in the actual Vercel environment. The local build only verifies frontend assets and source checks, not a Vercel deployment.
7. **Perform signed-in device acceptance:** iPhone Safari and installed PWA, Android Chrome and desktop; safe areas, chart touch scrolling/drawing, stock tables, both themes, keyboard-open forms, import/export, empty-portfolio reload, two-device conflict recovery, logout/account switch, token expiry and offline/reconnect. Test one controlled email and notification delivery. Record results before a small beta and unrestricted rollout.
8. **Review the public legal copy and operations.** Confirm the operator identity, applicable legal requirements, provider data practices, support/deletion process, and actual payment/refund and retention terms before publishing. The added pages describe the implementation; they are not a legal compliance certification. Assign an owner for monitoring API failures, sync conflicts, approval email failures and user support.

## Source documentation used

- [Google OAuth policies](https://developers.google.com/identity/protocols/oauth2/policies) and [Google API user data policy](https://developers.google.com/terms/api-services-user-data-policy) inform the public-page and OAuth verification checklist.
- [Supabase password security](https://supabase.com/docs/guides/auth/password-security) and [updateUser](https://supabase.com/docs/reference/javascript/auth-updateuser) inform the password/recovery configuration checks.
- [Vercel function runtimes](https://vercel.com/docs/functions/runtimes) and [Python runtime packaging](https://vercel.com/docs/functions/runtimes/python) inform the API entrypoint budget and staging checks.

These references inform the checklist. Actual production changes and observed results are recorded separately in the activation report.
