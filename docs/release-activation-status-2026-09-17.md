# Release activation status — 17 September 2026

The earlier rollout implementation was activated in production and basic live checks passed. The owner confirmed that phone-to-web sync recovery works. A subsequent password-login report revealed that the old Google permission was not retained across password logins. The remembered-Drive fix, server-only connection table and corrected settings are now deployed; live configuration/origin checks pass and the Google client-secret error has cleared. A real Google approval followed by password logout/login acceptance is still required, as described in [remembered-drive activation](remembered-drive-activation-2026-09-17.md). Public rollout should wait for this and the remaining device/operational checks.

## Production activation verified

- Remembered Drive follow-up: the agent pushed commit `f66428921400237ad01bc2a342c9f5cd576692a5` and redeployed after the owner updated the Google client secret. Deployment `6ZzTeET8wWgWacrsPATUHxdnGXN8` is Ready. Its live configuration and anonymous/origin rejection checks pass; signed-in portfolio acceptance remains open.
- Vercel project `psx-45-naeh`, repository `thewayoulike/PSX45`, production branch `main`. Initial activation was verified at commit `47f40ba7890b29f793b6022761350221a04899fc`. After the owner's subsequent pushes, the sync fix and regression tests were verified in production at commit `82e63cccc8a0e26813d3ce1e52abb853a177a404`, deployment `77saje3kPCLLxiovsjTSW7jT7gAU`, status Ready. The agent did not push or trigger a separate deployment.
- Canonical domain: `https://www.psx-tracker.com`. The apex redirects there with HTTP 301.
- The owner saved the Production `ADMIN_SECRET` and Brevo SMTP credentials directly in the dashboards. Secret values were not inspected. Other required server/client variable names were present. An unauthenticated admin request returned 401; authenticated admin acceptance remains open.
- With explicit owner approval, applied `20260914_alert_safety.sql` and `20260917_public_rollout.sql` together in a transaction through the Supabase SQL editor. Execution succeeded. Existing alert/account rows were preserved; no portfolio content was moved into Supabase and no Drive file was changed during activation.
- Read-only verification confirmed all four required functions match the locally tested definitions. `service_role` can execute them; `anon` and `authenticated` cannot. RLS is enabled on `alert_store`, `allowlist`, `approval_tokens`, `request_limits` and `cloud_heads`, with no anonymous/authenticated SELECT/INSERT/UPDATE/DELETE grants.
- Verification is reproducible with [verify-rollout-schema.sql](../scripts/verify-rollout-schema.sql). These migrations were applied as SQL, not through the Supabase CLI migration-history mechanism.

| Function | Normalized body hash verified in production |
|---|---|
| `psx_cloud_head` | `c2c8fcd37940d1bce518a3af1b197368` |
| `psx_consume_approval` | `982c607b2b182c47ca102eaa69b93c1f` |
| `psx_mutate_alerts` | `e72495ef4e23f5952aa2a9b125fd6429` |
| `psx_rate_limit` | `002a0bf93de4d52b15617907a07f2ef2` |

## Authentication and email

- Site URL is `https://www.psx-tracker.com`, with the exact allowed redirect `https://www.psx-tracker.com/reset-password`.
- Confirm email is enabled; minimum password length is 10; Secure password change and Secure email change are enabled. Anonymous sign-in and manual linking remain disabled.
- Supabase's Google provider remains disabled because this app uses its separate Google Drive OAuth flow.
- Custom SMTP is enabled with sender `itruth2011@gmail.com`, name `PSX Tracker`, the Brevo relay on port 587 and a 60-second per-user interval.
- The owner explicitly authorized **one** recovery test email to `itruth2011@gmail.com`. Submitted the live Forgot password form once; it returned the expected neutral success message. The owner replied **“worked.”** This confirms the recovery email test, not every setup/reset/login case. No new password was entered by the agent and no second test email was sent.
- Live login had no observed JavaScript errors. At 390 × 844, the forgot-password form had no horizontal document overflow.

## Live smoke checks

| Check | Observed result |
|---|---|
| Home, About, Privacy, Terms and Contact | HTTP 200 with expected page titles |
| Login and reset-password routes | HTTP 200 and `X-Robots-Tag: noindex, follow` |
| Anonymous cloud-sync, check-access, request-access and admin-users | HTTP 401 |
| Fund NAV endpoint | HTTP 200, 528 records, source `synced` |
| Python HBL quote | HTTP 200, source `pypsx:quote`; deployed subprocess exercised |
| Invalid stock symbol | HTTP 400 |

Earlier dashboard logs included 503s before database activation. Fresh checks after activation passed; this is a smoke test, not a production load or uptime guarantee.

## Free-plan footprint and cleanup

The owner approved storing only sync revision numbers and Drive backup IDs after reviewing the measurements. Portfolio snapshots remain in each user's Google Drive. This design uses **zero Supabase file storage**.

Read-only production checks reported **11 MB total database size before and after activation**. The three new empty tables and indexes totaled approximately **64 kB** at verification time; subsequent traffic creates short-lived request-limit records.

`node scripts/measure-sync-storage.mjs` uses isolated local PostgreSQL with synthetic accounts, not production:

| Sample | Accounts | Backup IDs/account | Table + indexes + TOAST |
|---|---:|---:|---:|
| 44-character IDs | 1,000 | 20 | 1,302,528 bytes (about 1.3 MB) |
| Maximum accepted 200-character IDs | 1,000 | 20 | 6,012,928 bytes (about 6 MB) |

One sync row per account is reused, with at most 20 backup IDs. These fresh-table estimates exclude update bloat, authentication, alerts and other tables. The applied rate-limit function cleans expired request-limit and approval-token rows during normal traffic; no additional scheduler is required.

At activation, Supabase's published Free allowances were 500 MB database and 1 GB file storage. [Official pricing](https://supabase.com/pricing).

## Phone-to-web conflict follow-up

The owner reported that a phone save was not loading on the web, where an old pending snapshot and “Another device saved a newer version” remained after Retry. Source review confirmed that Retry attempted the stale upload again (or reloaded the same conflicting pending snapshot). The shortened error hid the recovery instructions.

The follow-up replaces Retry with **Load latest** for this conflict, explains that another device has newer data, and keeps **Download local copy** visible. A manual Load latest action is also available when synced. Recovery waits for in-flight saves, pauses new saves, verifies a readable backup with transaction/portfolio arrays, and preserves both the pending snapshot and current in-memory web data before reloading. A failed read, account change or storage failure leaves pending data intact.

Validation: **250 tests passed across 41 files**, TypeScript passed, and the production build passed. Service regressions simulate loading a newer phone snapshot after a web conflict, preserving newer local edits, invalid/missing backups, account switching and storage failure. The actual sidebar's expanded mobile layout, collapsed Details popover and confirmation callback were checked with synthetic data. The owner then confirmed the actual phone-to-web recovery: **“its good now.”** No real portfolio was modified by the agent during these tests.

## Remaining acceptance and operations

Follow the [manual release checklist](manual-release-checklist-2026-09-17.md) for exact steps and expected results. Its unchecked items are instructions, not completed test evidence.

1. Phone-to-web recovery is owner-confirmed. Complete broader two-device save, account-switch, token-expiry, offline/reconnect and imported/empty-portfolio checks. Use iPhone Safari/PWA, Android Chrome and desktop, including chart scrolling, stock tables and keyboard-open forms.
2. Verify first-time Google password setup, existing password users, expired/reused links and wrong-current-password handling. Confirm email was previously disabled; review ownership of legacy accounts before relying solely on their existing confirmed flags.
3. Complete authenticated admin and controlled alert-notification acceptance. No live notification was sent during these checks.
4. Confirm Google OAuth publication/verification requirements, review operator/legal/payment/refund/retention details, and assign support/deletion and monitoring ownership.
5. Review Vercel capacity: the dashboard reported **19.51 GB function storage against a Hobby 10 GB allowance**. Deployment succeeded, but the warning remains unresolved. No deployments were deleted and no plan was purchased. [Vercel storage documentation](https://vercel.com/docs/deployment-storage).
6. Require updated tabs on both devices before testing the new sync protocol. Preserve legacy Drive backups during acceptance; do not roll back to a writer that blindly overwrites them.

See [the implementation report](public-rollout-fixes-2026-09-17.md) for detailed changes and the original release checklist.
