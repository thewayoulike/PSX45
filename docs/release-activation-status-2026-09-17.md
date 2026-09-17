# Release activation status — 17 September 2026

The requested app features and audit fixes are implemented and tested locally. Production activation has not occurred.

## Storage clarification

The owner confirmed that portfolio data belongs in each user's Google Drive; the existing database is used for alerts. The code also uses Supabase authentication and an access-approval allowlist.

The earlier proposed `cloud_heads` table stores only revision numbers and Drive backup IDs, never portfolio contents. Whether to use those metadata records or keep sync metadata entirely in Drive is awaiting the owner's choice. **Do not apply `20260917_public_rollout.sql` or deploy the current cloud protocol until that choice is resolved.** The migration and protocol must remain consistent.

No existing production database, Drive files or account permissions have been modified.

## Access needed

- The local workspace contains the public Supabase/Google client configuration, but no server database credential, Supabase management credential or Vercel deployment credential was found in the checked project configuration.
- The linked hosting project is `psx-45-naeh`.
- Vercel redirected to its sign-in page.
- The configured Supabase project redirected to its sign-in page.
- Both dashboard tabs were left available for the owner to sign in. Passwords or secret keys do not need to be pasted into the conversation.

After dashboard access and the sync-storage choice are available, verify the selected schema/auth configuration, stage the matching backend and frontend, then complete the release checks in [the implementation report](public-rollout-fixes-2026-09-17.md).
