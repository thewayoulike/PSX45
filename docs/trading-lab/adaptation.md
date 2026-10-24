# PSX Trading Lab

An independent testing section at `/trading-lab`, under **Testing → PSX Trading Lab**. It adapts the research workflow in [Jake Schincariol's day-trader-skill](https://github.com/Jakeschincariol/day-trader-skill), reviewed at commit `3d0f4ef6986f4984b7c6bd46f7ff4f87744c3abd`. The original MIT notice is retained in `public/licenses/day-trader-skill.txt`.

This is a TypeScript app implementation. It does not install or execute the original Python tools, use a language model, submit brokerage orders, or alter an existing portfolio or Practice Trading account.

## Workflow mapping

| Original module | PSX adaptation |
| --- | --- |
| trader-scanner | Manual watchlist of up to 20 PSX symbols; closing breakout, 20-day average reclaim, Wilder RSI and relative-volume context. |
| trader-entry | First three full 5-minute candles after each continuous session opens; confirmation requires a subsequent close above the range. |
| trader-exit | Editable stop and target; candle-based historical outcomes and manual journal level checks. |
| trader-timemachine | Opening-range historical replay and 10,000 seeded historical resampling paths. |
| trader-budget | Whole-lot sizing constrained by test capital, position cap and estimated stop risk, including fees and slippage. Valid research plans below the chosen reward/risk threshold can be saved with a warning. |
| trader-risk | Input and after-cost reward/risk checks; source timestamps and explicit execution limitations. |
| trader-news | Existing public stock-market headline metadata, publisher attribution and article links. |
| trader-analyst | PSX company profile and links to official financials/announcements. No generated analyst verdict. |
| trader-pelosi | Public PSX insider disclosures for the selected stock, replacing US congressional filings. |
| trader-alerts | Manual refresh and level checks within the lab journal; no background notifications. |
| trader-broker | Local research tickets only. No broker integration or order placement. |

## Boundaries and storage

- Navigation, route wiring and the existing Google Drive connection integrate with the main app. Existing scanners, watchlists, backtests and Practice Trading remain separate.
- Read-only requests use the existing daily OHLC proxy, direct pyPSX intraday route, company feed, news feed and insider feed. No new serverless function is required.
- The scanned watchlist and saved plans (including notes, costs and entry-source dates) sync to a separate `PSX Tracker - Trading Lab.json` Drive file when connected. The local copy remains under `psx-trading-lab:v1:<normalized-email>`. The UI allows creating up to 100 plans; cross-device merges retain all plans even if their combined count exceeds 100. The journal can also be exported to JSON.
- The existing account-checked Drive session is used only for the separate journal. No portfolio transactions, balances or brokerage sessions are consumed by the lab. Market data errors remain visible; missing history does not trigger fabricated data or inferred signals.

## Market and model assumptions

Regular continuous sessions, verified against [PSX trading hours](https://www.psx.com.pk/psx/exchange/general/trading-hours): Monday–Thursday 09:32–15:30 PKT; Friday 09:17–12:00 and 14:32–16:30. Full grid-aligned 5-minute bars therefore start at 09:35, 09:20 and 14:35 respectively. Auction candles, forming candles, the Friday break and post-close bars are excluded. Standard hours do not implement special Ramadan or holiday circulars; incomplete sessions are excluded from replay.

Daily rules require at least 22 completed daily candles. Relative volume requires all 20 comparison-session volumes and the latest volume. Prices are not adjusted by this feature for dividends, splits or rights issues. Daily history is not a live quote.

Historical replay enters at a confirmed closing breakout and checks only subsequent bars. It closes any remaining position at the session's final candle, including before Friday's break. Missing candles exclude the entire session. If a candle touches both levels, the stop wins; an opening gap below the stop uses the worse opening price. Estimated slippage and fees apply on both sides. Real fills can differ, especially at locked price limits or in thin trading.

The Time Machine is a standardized scenario starting after the opening range, **not a forecast for the rest of today**. It uses earlier complete sessions of the same family (Monday–Thursday, Friday morning or Friday afternoon), excluding the latest day's data from the sample pool. Each slot samples one historical candle relative to its prior close. At least three comparable sessions are required. The deterministic seed is 19. Resampling does not preserve whole-day serial dependence or model news, order books, circuit locks or future volatility; displayed outcome frequencies are model results, not estimated probabilities of actual success.

Replay and scenario R values use the entry-to-stop price distance as their denominator, with fees/slippage deducted from the numerator. Sizing's reward/risk also includes costs in its loss denominator; the two measures have explicitly different purposes.

Default plan levels (2% stop, 5% target), capital, risk, position cap, fee/slippage estimates and lot size are editable testing inputs, not recommendations or verified broker charges. Capital gains tax is excluded. No universal current circuit band is hardcoded. Available cash, executable prices and actual lot sizes must be checked separately. [NCCPL's T+1 settlement transition](https://www.nccpl.com.pk/transition-to-t1-settlement-cycle) is market context, not a substitute for a broker's available-cash calculation.

## Verification

Automated coverage includes Pakistan session boundaries, unfinished candles, missing history/volume, first closing confirmation, sizing and costs, ambiguous candle outcomes, gap stops, no entry-candle lookahead, Friday separation, deterministic resampling with earlier-session-only inputs, local-storage isolation, invalid feeds and partial research failures. Browser previews use captured real PSX feed data and are labelled as recorded data; they are excluded from the production build.

## Beginner workflow and chart interaction

An in-page beginner guide explains the six-step research workflow, OHLC candles, fees, position sizing, R, replay outcomes and separate Drive journal storage. The daily OHLC chart supports 30/60/90-session windows, pointer/touch inspection and keyboard navigation. Historical breakout levels may populate a hypothetical plan, retaining the original timestamp in the saved journal. Daily and intraday feeds publish independently so replay becomes available as soon as intraday data arrives; loading and unavailable states explain disabled actions.

## Drive sync safety

Sync runs on opening the lab, saving a plan/scanned watchlist, focus, reconnection and once per minute while visible. It merges immutable tickets by ID and uses the latest dated watchlist. New devices load the Drive journal; local edits made during an upload remain pending and are retried. Invalid cloud files and conflicting ticket contents block replacement, rather than silently dropping plans. The app warns before closing or signing out with pending lab changes.

Drive writes are immutable uploads tagged `psxWorkspace=trading-lab-v1`, using the existing `drive.file` permission. Each upload is read back and verified before previously observed, fully incorporated copies are moved to Drive Trash. A concurrent device's unseen file is never retired. Concurrent copies are merged on the next sync; no database migration or portfolio file update is involved. There can briefly be multiple same-named files.

Only saved plans and the scanned watchlist sync. Unsaved form edits, fetched candles, research feeds and replay results are recomputed, not backed up.
