# Automatic Drive loading and phone storage recovery

## Behavior

- Opening the account reads the latest committed Drive snapshot automatically. Local pending/current data is archived before replacement; a conflict no longer requires choosing Load latest at startup.
- Returning to the app or coming back online checks the cloud version. An unchanged version does not download the portfolio again. A save conflict also triggers this check automatically.
- Refresh applies the downloaded data in place, removing the old full-page reload and second download. Applying the cloud snapshot no longer immediately uploads that same hydration state.
- Manual refresh remains available without a confirmation popup. Background checks keep the current screen visible.
- Recovery copies are stored in IndexedDB, outside the small localStorage area used by active settings. Existing copies for the same account migrate only after the archive transaction commits; none are discarded. Profile & Security includes Download recovery copies.
- If the archive cannot be stored, the account changes, or new local edits appear while archiving, loading stops before clearing pending data. The app explains the failure. Portfolio files remain in Drive; no Supabase file storage was added.

## Verification

- TypeScript passed. Full suite: 302 tests passed in 44 files.
- IndexedDB tests cover full localStorage, atomic transaction failure, migration while a legacy copy changes, and account scoping. Drive tests cover automatic latest loading, keeping current and pending edits, an unchanged-version check without another download, and edits during archival.
- Browser fixture `tests/rollout/recovery.html` uses synthetic data and blocks live APIs. It passed with localStorage writes throwing QuotaExceededError: all three recovery copies preserved, pending cleared only after archival, one download, no reload, unchanged version check only.
- The owner reported the quota message on a phone. Its wording and the old recovery-write path point to localStorage; the actual phone storage was not inspected. Device acceptance is still needed after deployment.

## Release

Deployment pending. Reload the app on both devices after publication, then save on one and return to the other. The latest portfolio should appear automatically. Existing Google permission is still required; this does not bypass Google authorization.
