# Admin users and mobile holdings follow-up

## Changes

- The admin page crashed when an account had the server's `free` access status. The badge lookup did not include it and tried to read a missing entry. Added Free badges and counts, an exhaustive status map, and an Unknown fallback for unexpected statuses.
- Mobile stock holdings now show Avg Price and Total Cost. Mobile fund holdings show Avg NAV and Total Cost, using the same rounding as the desktop table. Current prices/NAVs are explicitly labeled to distinguish them from average purchase values.
- Mobile Grand Total now shows Current Value, Invested, Daily P&L and Overall P&L in two columns. It uses the same filtered holdings totals as the desktop table; percentages stay below the profit/loss values to fit narrow screens.
- Removed the automatic password-setup popup after Google sign-in, including the pending-approval screen. Password setup, reset and change remain available in Profile & Security.

## Verification

- Reproduced the original admin crash using actual `computeAccess` results for ended trials, lapsed paid access and legacy undated approvals.
- After the fix, all 15 targeted admin/access tests passed, including unknown and missing statuses.
- TypeScript and an isolated production Vite build passed.
- Browser checks used synthetic accounts and holdings only. The admin list, Free count, search and Manage controls opened successfully. No live account access was changed.
- At 320px, stock Avg Price and fund Avg NAV were visible in light/dark layouts without horizontal page overflow. Example stock average `183.257` displays `183.26`; fund average `108.123456` displays `108.1235`, matching existing rounding rules.
- Preview: `tests/rollout/admin-holdings.html`. It replaces storage with an in-memory store and blocks live API requests; it is excluded from production entrypoints.

## Deployment

Publication in progress. The live owner-signed-in admin page still requires the owner's reload check; the available browser session is signed out.
