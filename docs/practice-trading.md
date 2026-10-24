# Practice Trading (sandbox only)

Signed-in, approved users can open **Practice Trading** in the main sidebar at
`/practice-trading`. It is available across app plans and does not need a loaded
Google Drive portfolio. The existing Trading Simulator remains unchanged.

## Server configuration

`/api/practice-trading` rewrites to the existing `check-access` entrypoint with
`service=practice-trading`. Its isolated handler lives in
`lib/practiceTradingRoute.js`, keeping deployment within the 12-function limit.
Both entry paths use the same practice authentication and ownership checks.

Configure these as server-only Vercel secrets (never `VITE_` variables):

- `PSX_PAPER_KEY_ID`: a `PYPSX-SANDBOX-` partner key.
- `PSX_PAPER_SECRET`: the matching secret.
- `PSX_PAPER_IDENTITY_SECRET`: a persistent random secret of at least 32 characters.

Keep the identity secret stable across deployments and API key rotations, and
back it up securely. It derives the private account reference used to find each
user's existing sandbox account. Changing it without migrating the mappings
would make existing practice histories unreachable through the app.

The server uses the verified, normalized login email to derive an HMAC account
reference and a synthetic email under `sandbox.psx-tracker.com`. It sends that
reference and a generic display name to pyPSX, not the user's real name, email,
CNIC, Google Drive records or broker credentials. Account creation happens only
after the user selects **Start practice trading**. Provider records persist
across devices; they are never merged into the real portfolio ledger.

## Boundaries and behavior

- The upstream URL is fixed to `https://brokerapi-paper.pypsx.com`.
- Live keys, non-sandbox configuration and linked broker accounts are rejected.
- The browser cannot choose an account ID, upstream path, commission or environment.
- Start and every trade re-check the server-side user/account association.
- Cancellation checks ownership before sending DELETE to the provider.
- Market and limit orders use a client reference and `Idempotency-Key`; repeat
  submissions reuse that reference. Unknown outcomes must be retried with the
  same reference, not resubmitted as a new order.
- Provider cash, fees, positions and order status remain authoritative. Pending
  weekend orders are shown as pending, never as completed trades.
- History is paginated at 25 per page; visible pages refresh every 30 seconds.
- Starting cash and commission are read from `/config`, never hardcoded.
- There are no real trading, deposit, withdrawal, reset or broker-link routes.

Tests: `npx vitest run lib/practiceTrading.test.ts src/utils/driveBoot.test.ts`.
Test credentials and isolated sandbox smoke scripts belong only in ignored local
files. Production users must not receive test fixtures or authentication bypasses.
