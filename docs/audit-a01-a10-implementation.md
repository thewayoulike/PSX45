# A01–A10 implementation and rollout

September 14, 2026. The fixes below are implemented in the local checkout. **They are not deployed and the production database migration has not been applied.**

## Changes

| Finding | Implemented behavior | Verification |
|---|---|---|
| A01 — alert ownership | Read, append and remove all check the verified account in a service-only database transaction. Empty subscriptions retain their owner; ownerless records cannot be claimed by supplying an endpoint. Google identity must have a verified email. | Route tests and PostgreSQL ownership/permission tests. |
| A02 — approval/quotas | Pending users receive 403; access lookup failures receive 503. Only server-derived plan limits reach storage. | Pending, outage, free, trial, paid and lifetime route tests. |
| A03 — cloud save outcomes | HTTP failures propagate to a visible unsynced state with retry. Full snapshots are queued in order and preserved locally per Google account until both Drive and Sheets succeed. Failed initial loads block autosave. Empty transaction lists are synchronized too. | HTTP 401/403/429/500, failed lookup, queued saves, recovery and Sheets-failure tests. |
| A04 — alert races | Transactional mutations preserve unrelated alerts. Workers durably claim an individual alert before sending and finish only that claim. The old duplicate runner delegates to the same handler. | Overlapping workers, append during dispatch, delete during dispatch, wrong claim token and retry tests. |
| A05 — Sheets identity | Portfolio IDs map to numeric sheet IDs through developer metadata. Names are labels; renamed/colliding portfolios cannot overwrite each other. One atomic batch updates cells, including clearing trailing stale values. Notes are literal strings, never formulas. | Collisions, legacy tabs, rename, long/apostrophe names, empty export and formula-like notes. |
| A06 — renewing trials | Missing/invalid approval dates produce Free access, not a fresh trial. Paid/lifetime grants remain effective. | Advancing-clock and malformed-date tests. |
| A07 — invalid XIRR | A bounded root search returns `null` without a converged solution; the dashboard shows N/A. Non-finite inputs and same-day inputs are rejected. | Ordinary/zero return, near-total loss, invalid data and multiple-root example. |
| A08 — cron authorization | Nonempty configured secret and Bearer header required. Scheduled curl now fails on HTTP errors. Query-string secrets are no longer accepted. | Missing, mismatched and valid credential checks. |
| A09 — quota scope | Alert ticker and TP/SL limits apply across an account's devices inside the database transaction. Soft browser tool counters have separate account namespaces; the upgrade UI explains their scope. | Cross-device database limits and browser account-switch tests. |
| A10 — backtest execution | Opening gaps fill at the open. Ambiguous intraday stop/target bars use stop-first. Daily equity includes open positions and reserves round-trip fees; drawdown and buy-and-hold use consistent fee assumptions. UI explains the model. | Synthetic gap-down/up, ambiguous-bar and recovering-position drawdown tests. |

Test discovery is now explicitly limited to current `src` and `lib` tests. Worktree copies and isolated test tooling are excluded.

## Required production rollout

1. Pause the scheduled alert runner and alert writes during rollout. Old API code does not participate in the new database transaction lock, so do not run mixed versions against the table.
2. Back up `public.alert_store`. Inspect legacy rows with missing/empty `record.userEmail`. They are deliberately quarantined: the new code will neither send nor allow a browser to take them over. Assign an owner only after independent verification, or have the user create a new push subscription. Existing nonempty owners are retained. The legacy KV migration script is retired and returns 410 without changing data.
3. Apply [20260914_alert_safety.sql](../migrations/20260914_alert_safety.sql) in the target Supabase database. It enables RLS, revokes browser-role table access, grants service-role table access and installs the transactional RPC. It does not delete existing records. Confirm `service_role` has its normal Supabase RLS-bypass property.
4. Deploy the API/frontend changes and the updated scheduled workflow together. Confirm the scheduler and server use the same `CRON_SECRET`; the runner now requires `Authorization: Bearer …`.
5. Verify with two test accounts and two devices: owner rejection, account-wide quotas, save/list/delete, and a controlled test alert. Verify a Drive save and rename/empty export on a test portfolio. Resume scheduling and normal writes after these checks.

The service returns a retryable storage failure if the RPC is absent; it never falls back to unsafe whole-record writes. Rolling back the API requires pausing the runner/writes again; do not restore old writes while assuming the transaction guarantees still hold.

## Behavior choices and limits

- **Identity:** verified, normalized email is the canonical account key because the application supports both Google and Supabase sign-in. An email change does not automatically transfer alert ownership. A shared browser subscription remains owned by the original account, even when empty; another account must use a new subscription or an operator-verified migration.
- **Delivery:** a timeout or worker crash can happen after a push provider accepted a message. Such a claim is retained and displayed as “Delivery unconfirmed,” rather than automatically sending duplicates. Explicit 429/503 rejections can retry. Users should check their notifications before deleting/recreating an unconfirmed alert. This is not an exactly-once delivery guarantee; a crash before the send may require manual recovery.
- **Quota scope:** browser tool/profile limits intentionally remain soft and can reset when browser storage is cleared; they are not billing/security enforcement. The v2 account namespace starts fresh rather than assigning old shared consumption to the wrong account. Alert limits are hard, account-wide limits. Existing over-limit accounts must remove alerts before adding more.
- **Legacy approvals:** undated/invalid-date approvals now use Free access. If an administrator intends a fresh trial for a legacy user, they should explicitly set a persisted `approved_at` or paid/lifetime grant. No approval rows were changed automatically.
- **Cloud recovery:** pending snapshots are stored per Google account and restored on reload. They survive network failure, but clearing browser storage removes them. Serialization prevents overlapping writes within this app instance; conflict resolution across separate tabs/devices is still outside this change. Pending local recovery may supersede changes made remotely on another device, so reconcile concurrent-device work before retrying.
- **Sheets transition:** old name-only tabs are preserved. The first new sync creates ID-mapped tabs rather than guessing which legacy tab belongs to which portfolio. Subsequent renames retain the same mapped sheet. Removed portfolios' historical tabs are not automatically deleted.
- **Calculations:** XIRR searches a bounded logarithmic rate interval and reports N/A when it cannot establish a converged result; it is not a symbolic proof of root uniqueness for every unusual cash-flow pattern. Backtests still use daily bars and assumed signal-close fills, not an exchange execution simulator or intraday drawdown calculation.
- **Database throughput:** alert mutations use a short global advisory transaction lock for correctness at the present scale. A larger deployment should move to normalized rows/account locks while retaining the same ownership and atomic quota checks. No network call occurs while holding this lock.

## Validation

- `npm test`: **195 tests passed in 34 files**.
- `node scripts/test-alert-db.mjs`: **passed** against an isolated PostgreSQL WASM runtime, including migration execution, ownership, legacy quarantine, cross-device quota checks, deterministic mutation interleavings, service-role access and denied anonymous access. This does not simulate a multi-process production load test.
- `npm run build`: passed; existing large-chunk and mixed-import warnings remain.
- `npx tsc -p src/tsconfig.json --noEmit`: **67 existing diagnostics**, matching a clean HEAD-source baseline with the same data/dependencies. No new diagnostic messages were introduced by these changes. Broad type cleanup is outside A01–A10.
- No live Supabase/Google writes, real notifications, production deployment or browser acceptance checks were performed.

To reproduce the database test without changing application dependencies:

```powershell
npm install --prefix .audit-tools --no-save --package-lock=false @electric-sql/pglite
node scripts/test-alert-db.mjs
```

`.audit-tools` is ignored and contains only local test tooling/baseline artifacts. The root dependency manifest and lockfile were not changed.

The Sheets implementation follows Google's documented [atomic batch behavior](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/batchUpdate), [updateCells range clearing](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/request#UpdateCellsRequest), and [developer metadata mapping](https://developers.google.com/workspace/sheets/api/guides/metadata).
