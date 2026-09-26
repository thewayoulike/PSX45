# Selected mobile layouts

Implemented on 26 September 2026. The source of truth for the user's 95 choices is `mobile-design-selections.json`.

## Layout choices

- **A (88 screens):** compact layout with the existing colours and drawer navigation. The dashboard combines Performance, Capital and Income into a tabbed card, keeps net worth full width, and pairs the return summaries. A compact portfolio header and Add / Sync / More toolbar retain the original controls and callbacks. Holdings use a three-column metric layout with average price and the four grand totals. Other signed-in pages retain their contents with tighter spacing and section navigation where applicable. Setup dialogs open full height. Public reading pages use a collapsible contents menu.
- **B (7 screens):** Add Transaction, file import, broker email scan, email text review, AI document scan, mutual-fund statement scan and Future X-Dates use bottom sheets with larger controls. Shared transaction modes remain available in the same sheet.
- The mobile breakpoint is 767px. Desktop keeps the existing header, action toolbar, three metric panels and page contents. No new dependencies were added.

## Validation

- Type checking and production build pass.
- Existing automated suite: **533 tests in 72 files pass**.
- Browser opening checks: **95/95 screens open**, with no page-wide horizontal overflow at the 390px test width.
- Interaction checks: dashboard Capital and Income tabs, More actions, email search and text review, public contents expansion and a calculator submission. Holdings retain quantity, price, average price, cost, value and daily P&L; totals retain current value, invested, daily P&L and overall P&L.
- Additional breakpoint checks cover a 360px dark-mode dashboard and the original three metric cards / full action toolbar at 1280px.

The browser checks use sample portfolio records and intercepted services. They verify layout and local interactions, not live Google, email, AI, trading or account services. No live portfolio records were changed. No deployment was performed.

Local review: `http://127.0.0.1:4185/.audit-tools/mobile-implementation/index.html`. The page selector includes all 95 screens, width and theme controls. Opening-check results and screenshots are in `.audit-tools/mobile-implementation/` (local, excluded from the application build).
