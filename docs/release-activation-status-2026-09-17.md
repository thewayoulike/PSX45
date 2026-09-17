# Release activation status — 17 September 2026

The requested app features and audit fixes are implemented and tested locally. The owner has signed in to both production dashboards. Authentication configuration has been updated as listed below; app deployment and database migrations have not occurred.

## Storage clarification

The owner confirmed that portfolio data belongs in each user's Google Drive; the existing database is used for alerts. The code also uses Supabase authentication and an access-approval allowlist.

The earlier proposed `cloud_heads` table stores only revision numbers and Drive backup IDs, never portfolio contents. Whether to use those metadata records or keep sync metadata entirely in Drive is awaiting the owner's choice. **Do not apply `20260917_public_rollout.sql` or deploy the current cloud protocol until that choice is resolved.** The migration and protocol must remain consistent.

No production table contents or Drive files have been modified. No emails or messages have been sent.

## Verified production state

- The local workspace contains the public Supabase/Google client configuration, but no server database credential, Supabase management credential or Vercel deployment credential was found in the checked project configuration.
- Vercel project `psx-45-naeh` is linked to `thewayoulike/PSX45`, production branch `main`. Current production is commit `d5d87769876e2cccbe05c4801ef71cef39b50e51` (NAV catalog update), not the uncommitted rollout work.
- Vercel confirms `www.psx-tracker.com` is the production domain; the apex domain redirects there with HTTP 301.
- Supabase project `sxtqoiywnrurgwdmhnua` (`PSX`) currently lists only `alert_store`, `allowlist`, and `profiles` in the public schema. Its function list contains `handle_new_user` and `rls_auto_enable`; the alert mutation, approval, request-limit, and cloud-version functions required by the new code are absent.
- Existing production/preview environment-variable names include Supabase server/client configuration, Google client ID, Brevo key/sender, `APP_URL`, `OWNER_EMAIL`, scheduler and VAPID settings. Their secret values were not revealed. The owner has now saved **`ADMIN_SECRET` as a Production secret**, confirmed by the Vercel variable list and success message. It requires a new deployment to take effect. The legacy `APPROVE_SECRET` remains separate.
- A read-only production SQL check reported **11 MB total database size**, **112 kB public tables including indexes**, and RLS enabled on all three existing public tables. All four required `psx_*` functions remain missing. The query did not read account records or change data.
- Vercel reports **19.51 GB function storage against the Hobby 10 GB allowance**. No deployments were deleted and no plan was purchased. Resolve capacity before attempting the release; inspect retention and function packaging first. [Vercel storage documentation](https://vercel.com/docs/deployment-storage).

## Authentication changes applied

- Site URL changed from `https://psx-tracker.com` to the verified canonical domain `https://www.psx-tracker.com`.
- Added the exact allowed redirect `https://www.psx-tracker.com/reset-password`. There were no allowed redirects before this change. No wildcard or third-party callback was added.
- Enabled **Confirm email**, which was previously disabled. New email accounts must now prove email ownership. Anonymous sign-in and manual linking remain disabled.
- Set the minimum password length to 10 and enabled **Secure password change** (recent sign-in required), matching the new app flow. Secure email change was already enabled and remains enabled.
- Supabase's Google provider is disabled. The app uses its separate Google Drive OAuth flow, so enabling this provider is not required for the implemented design.
- The owner completed and saved custom SMTP. The dashboard showed **Successfully updated settings**, SMTP enabled, sender `itruth2011@gmail.com`, name `PSX Tracker`, Brevo relay host, port 587, and a 60-second per-user interval. No SMTP key was revealed. Saving configuration is not proof of email delivery; an end-to-end test remains pending.

## Remaining activation requirements

1. **Production email delivery:** SMTP configuration is saved. Test delivery with an explicitly authorized tester after the reset page is deployed; verify Brevo accepts the sender and the delivered link returns to the app. No test email has been sent. [Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [Brevo SMTP configuration](https://help.brevo.com/hc/en-us/articles/7924908994450-Send-transactional-emails-using-Brevo-SMTP).
2. **Existing account verification:** enabling Confirm email only protects future signups. Accounts created while confirmation was disabled may already be marked confirmed without an email ownership check. Review these existing accounts and complete controlled ownership verification before treating `email_confirmed_at` alone as sufficient release evidence. No account has been deleted or had its password changed.
3. **Sync storage decision:** the owner is concerned about free-plan capacity. The measurements below show the small metadata footprint. No sync tables have been created; finalize this decision before applying the migration.
4. **Admin secret:** Production configuration is saved. Verify the new admin route after deploying. Configure a separate preview secret only if preview admin tests need one.
5. **Database and deployment:** apply the matching migrations, verify protected permissions, resolve hosting storage, then deploy backend/frontend together and complete the controlled acceptance checks. The dashboard sign-ins alone do not deploy local files.

See [the implementation report](public-rollout-fixes-2026-09-17.md) for the complete release checks and the already-passing local test evidence.

## Completed credential handoff

- The owner entered and saved both credentials directly in the dashboards. Only their configured state was checked; secret values were not inspected.
- The sync-storage question is awaiting resolution of the owner's free-plan concern; completing the two credential forms was not approval for a database migration.

## Free-plan footprint and cleanup

Supabase currently includes a **500 MB database allowance** and a separate **1 GB file-storage allowance** on Free. The proposed sync design consumes **zero Supabase file storage**: all snapshots remain in Google Drive. [Official pricing](https://supabase.com/pricing).

`node scripts/measure-sync-storage.mjs` builds a fresh, isolated local PostgreSQL database using the actual migration and synthetic accounts. It does not connect to production.

| Sample | Accounts | Backup IDs/account | Table + indexes + TOAST |
|---|---:|---:|---:|
| 44-character IDs | 1,000 | 20 | 1,302,528 bytes (about 1.3 MB) |
| Maximum accepted 200-character IDs | 1,000 | 20 | 6,012,928 bytes (about 6 MB) |

These are fresh-table estimates, not a total-project size guarantee. Production update bloat, auth, alerts and other tables require separate monitoring. One sync row per account is reused; its history stays capped at 20 IDs.

The local rollout migration now cleans expired request-limit rows and expired approval-token rows during normal traffic, using their expiry indexes. No extra scheduler is required. With no traffic, cleanup waits until the next request, and those tables do not receive new rows during that inactivity. The PostgreSQL suite passes the new cleanup checks and preserves unexpired records. This migration is **not yet applied to production**.
