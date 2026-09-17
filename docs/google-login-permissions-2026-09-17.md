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
