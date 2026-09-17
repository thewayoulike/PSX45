# Password login → the same Google Drive portfolio

Status: the connection table and initial implementation are deployed. The first live configuration check returned disabled because the owner used four digits for the encryption key. A valid random 32-byte Base64 key was generated locally in an ignored file, and the owner confirmed replacing the setting. The follow-up rejects temporary-only password connections when server setup is invalid and reports a specific configuration error. Deployment of that guard, a fresh configuration check and a real Google/password round trip remain pending.

## Behavior

Google authorization is now exchanged on the server for a short-lived access token and an encrypted refresh credential. The saved permission is bound to the verified Google email/subject and, after explicit linking or verified password setup, to the matching Supabase user ID. Password login can then renew Drive access and load the existing portfolio before enabling cloud saves. Portfolio contents remain in Google Drive.

Signing out clears the local session but keeps remembered access. Profile & security offers **Disconnect remembered Drive access**, which deletes the saved credential and requests revocation at Google. Deleting or trashing portfolio files is never part of disconnecting.

Older Google connections used access tokens only. They cannot be converted into remembered permission without one new Google authorization. After that link, subsequent password logins, including on a new device, should not need another connection step unless Google revokes/expires permission or the user disconnects it.

## Activation order

1. **Completed:** applied `migrations/20260917_drive_connections.sql` to the existing Supabase project through a separate SQL query, with no customer-data writes. The result verified `rls=true`, `anon_read=false`, `user_read=false`, `server_access=true`. This creates one server-only row per linked Google account and does not move portfolio data.
2. **Completed by owner:** both **Production server secrets** are saved in Vercel project `psx-45-naeh`. Values were not inspected. Never send the values in chat or prefix them with `VITE_`:
   - `GOOGLE_CLIENT_SECRET`: the secret for the existing Google **Web application OAuth client** whose ID is configured as `VITE_GOOGLE_CLIENT_ID`. Keep the same client so existing Drive files remain accessible.
   - `DRIVE_TOKEN_ENCRYPTION_KEY`: 32 cryptographically random bytes encoded as Base64. Keep a secure backup. Replacing it later without re-encrypting saved rows would require users to reconnect.
3. Verify `APP_URL` is exactly `https://www.psx-tracker.com`; it supplies the permitted browser origin and popup code-exchange redirect URI. `GOOGLE_CLIENT_ID` is optional if the existing `VITE_GOOGLE_CLIENT_ID` is available server-side.
4. In that same Google OAuth client, verify `https://www.psx-tracker.com` is an authorized JavaScript origin. This implementation uses Google's popup code flow; do not substitute the Supabase callback URL or enable a second Google provider. Review OAuth publishing/verification status: Google's Testing status can cause refresh permissions to expire after seven days for these scopes.
5. Deploy the complete source change after the schema and settings are ready. A config request with action `drive-config` should return `enabled: true` and the public client ID, never secret values.

To generate the encryption key privately in a local terminal, the owner can run:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Copy the result directly into the Vercel secret field. Do not commit it, include it in screenshots, or paste it into a support message. Credential entry/submission in the dashboard must be completed by the owner.

## Acceptance after activation

1. Sign in with the existing password. If this account predates remembered access, complete one Google authorization using **the same email**. Confirm the existing portfolio loads; no empty replacement is saved.
2. Sign out. Open a private window or a second device and sign in with that email/password. The same holdings and transactions must load automatically without a Google prompt.
3. With a test account, sign in with Google, request a password setup email, set a password, then repeat step 2. This checks fresh email proof binds the existing Google permission.
4. Leave a linked password session open beyond one hour. Reload/load/save a small test change; expired access should renew without a popup.
5. Check sign-out and switching between two test accounts: neither account may display or write the other's portfolio.
6. On a test account, disconnect remembered access. Files must remain in Drive. The next password login should offer authorization instead of silently claiming cloud sync.
7. Revoke a test grant in Google Account permissions. The app should show a reconnect/retry explanation; it must preserve local pending changes.

## Local verification completed

- TypeScript check passed.
- Full test suite: 284 tests passed in 42 files, including 18 backend connection tests, client/password regressions and invalid-configuration behavior.
- Production Vite build passed; existing chunk-size/dynamic-import advisory remains.
- Migration applied twice in isolated PostgreSQL-compatible PGlite: idempotent, RLS enabled, anon/authenticated access denied, service role CRUD allowed.
- Mobile preview at 390 × 844: fallback screen and Profile control readable in light/dark appearance. Google approval was not executed in the synthetic preview.

Tests cover ciphertext authentication and identity binding, same-account code exchange, verified email, required Drive scope, CSRF origin/header rejection, old-session rejection, fresh-email binding, new-device refresh, revoked grants, concurrent disconnect/sign-out and safe errors. Refresh credentials never enter browser storage or API responses.

## Operational notes

- Requires only a small credential/identity row per connected account in the existing database; no separate Supabase Storage bucket is used. Actual size depends on Google token length and database overhead.
- Keep secrets in server configuration and apply normal access control to database backups. Never log OAuth codes, token responses or plaintext credentials.
- Account-deletion handling must also remove the matching `drive_connections` row; Google revocation should be requested before deleting the credential when available.
- If the encryption key is lost, saved credentials cannot be decrypted. Do not disable encryption as a workaround; restore the key or reauthorize the affected connections.
- Local preview environments must use their own matching allowed origin and non-production credentials/data; production origins are intentionally rejected elsewhere.

References: [Google popup code model](https://developers.google.com/identity/oauth2/web/guides/use-code-model), [OAuth web-server and refresh-token behavior](https://developers.google.com/identity/protocols/oauth2/web-server), [Google credential handling guidance](https://developers.google.com/identity/protocols/oauth2/resources/best-practices), [Supabase JWT fields](https://supabase.com/docs/guides/auth/jwt-fields).
