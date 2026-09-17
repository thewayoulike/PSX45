# Google sign-in permission warning

The normal Drive sign-in request included `https://www.googleapis.com/auth/spreadsheets`, which grants access to all of the user's spreadsheets. Google classifies that scope as sensitive; an unverified request produces the warning reported by the owner.

Normal sign-in now requests only `openid`, email, profile, and `drive.file`. PSX Tracker creates its transaction spreadsheet using the Drive API, and the Sheets API permits reading and updating that app-created file with `drive.file`. No portfolio data or existing files are changed by this fix.

Both code-based remembered login and the legacy token flow opt out of including previously granted scopes. Gmail import also has an isolated request, only when explicitly opened. Gmail read-only access remains restricted and requires Google's separate verification for a public rollout; this change does not claim Google has verified the app.

## Checks

- Regression assertions failed on both login paths before the fix because broad Sheets access was requested.
- All 302 tests across 44 files passed after the fix, including Drive recovery, remembered login, and spreadsheet synchronization tests.
- Type checking and the production build passed.
- Owner acceptance: reload the deployed login page and start Google sign-in. Confirm normal login no longer shows the sensitive-scope warning, then confirm Drive holdings load and transaction spreadsheet sync succeeds. Do not revoke the existing Drive connection merely to test this.

## Google references

- [Sheets scope classification and per-file access](https://developers.google.com/workspace/sheets/api/scopes)
- [Google authorization client configuration](https://developers.google.com/identity/oauth2/web/reference/js-reference)
- [Unverified-app warning](https://developers.google.com/workspace/drive/api/troubleshoot-authentication-authorization)

## Returning-login follow-up

After the sensitive-scope warning was removed, the owner reported Google's separate “You're signing back in” confirmation. The app was initiating the code-based remembered-connection setup on every Google login.

Normal Google login now uses the token flow with `prompt: ''`, retaining the narrow permission list. A read-only `drive-status` action verifies the Google bearer identity and checks only that identity's saved connection. It returns a boolean, never refresh credentials, portfolio data, or another account's status. The client uses the configured OAuth client ID and guards against stale responses after sign-out or a newer login attempt.

Returning accounts enter directly with their fresh Google access token. An account without a stored connection gets an explicit one-time setup dialog; its button initiates the code flow from a user gesture so browser popup blocking cannot silently lose setup. Explicit password-to-Drive linking retains its existing identity checks and code flow. No database migration or additional credential storage is introduced.

Verification: 310 tests passed, type checking and production build passed. The isolated browser fixture at `tests/rollout/google-login.html` confirmed both returning login without setup and first-time setup followed by successful login. Live Google account chooser, reauthentication, and security decisions remain controlled by Google; the app no longer forces the setup flow on every returning login. Owner acceptance remains a fresh login from the updated production page.
