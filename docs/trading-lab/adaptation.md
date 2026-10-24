# PSX Trading Lab

An independent testing section at `/trading-lab`, under **Testing → PSX Trading Lab**. It adapts the research workflow in [Jake Schincariol's day-trader-skill](https://github.com/Jakeschincariol/day-trader-skill), reviewed at commit `3d0f4ef6986f4984b7c6bd46f7ff4f87744c3abd`. The original MIT notice is retained in `public/licenses/day-trader-skill.txt`.

This is a TypeScript app implementation. It does not install or execute the original Python tools, use a language model, submit brokerage orders, or alter an existing portfolio or Practice Trading account.

## Workflow mapping

| Original module | PSX adaptation and remaining boundary |
| --- | --- |
| trader-scanner | All five original daily patterns (bull flag, closing breakout, MA20 reclaim, oversold, oversold bounce) plus RSI recovery; price/volume filters and liquidity sorting. Manual watchlist up to 20, not exchange-wide discovery. |
| trader-entry | Three complete opening candles, custom level alternative, volume confirmation, entry window and visible-page 30-second monitor. PSX 5-minute data only. |
| trader-exit | Range low/midpoint, percentage, ATR or manual stop; R target and flat-by time. ATR needs 14 past true ranges and never borrows future candles. |
| trader-timemachine | Same-rule historical replay, configurable entry slot/flat-by/window, seeded 10,000 paths, price fan and outcome histogram. Minimum 3 sessions is explicitly weaker than upstream's default 20. |
| trader-budget | Whole-lot sizing with capital, position/risk caps and costs. Valid low-RR research plans remain savable. |
| trader-risk | Manual hypothetical cash buffer, losses plus reserved risk, trade count, duplicate/blocked names and order-value limits. No live account inspection or US PDT rule. |
| trader-news | Publisher attribution, literal whole-word title matching and keyword catalyst tags. No claim of comprehensive symbol coverage or verified causation. |
| trader-analyst | On-demand PSX annual/quarterly statements and adjacent annual changes. No quarterly/cumulative mixing, percentage growth from nonpositive baselines, SEC XBRL or generated analyst verdict. |
| trader-pelosi | Public PSX director/sponsor disclosures, not US congressional data. |
| trader-alerts | Entry, stop/target touches, standard opening and flat-by reminders while the visible page is monitoring. No background/push or execution. |
| trader-broker | Exportable hypothetical ticket with risk checks. No Alpaca/PSX broker connection, automatic fill simulation or order transmission. |

The in-app comparison lists all eleven modules and these differences. This is not full behavioral parity with the original tools. Existing Practice Trading remains separate. Original US connectors, a whole-market universe, continuous background operation and actual broker execution are not installed by this adaptation.

## Boundaries and storage

- Navigation, route wiring and the existing Google Drive connection integrate with the main app. Existing scanners, watchlists, backtests and Practice Trading remain separate.
- Read-only requests use the existing daily OHLC proxy, direct pyPSX intraday route, company feed, news feed and insider feed. No new serverless function is required.
- The scanned watchlist and saved plans (including notes, costs and entry-source dates) sync to a separate `PSX Tracker - Trading Lab.json` Drive file when connected. The local copy remains under `psx-trading-lab:v1:<normalized-email>`. The UI allows creating up to 100 plans; cross-device merges retain all plans even if their combined count exceeds 100. The journal can also be exported to JSON.
- The existing account-checked Drive session is used only for the separate journal. No portfolio transactions, balances or brokerage sessions are consumed by the lab. Market data errors remain visible; missing history does not trigger fabricated data or inferred signals.

## Market and model assumptions

Regular continuous sessions, verified against [PSX trading hours](https://www.psx.com.pk/psx/exchange/general/trading-hours): Monday–Thursday 09:32–15:30 PKT; Friday 09:17–12:00 and 14:32–16:30. Full grid-aligned 5-minute bars therefore start at 09:35, 09:20 and 14:35 respectively. Auction candles, forming candles, the Friday break and post-close bars are excluded. Standard hours do not implement special Ramadan or holiday circulars; incomplete sessions are excluded from replay.

Daily rules require at least 22 completed daily candles. Relative volume requires all 20 comparison-session volumes and the latest volume. Prices are not adjusted by this feature for dividends, splits or rights issues. Daily history is not a live quote.

Historical replay enters at a confirmed closing breakout and checks only subsequent bars. It closes any remaining position at the selected flat-by candle (default five minutes before the session ends), including before Friday's break. Entry/volume/window/stop/target rules are shared with the plan controls. Missing ATR history, invalid stops and entries with no following exit candle are counted as skipped triggers. Missing candles exclude the entire session. If a candle touches both levels, the stop wins; an opening gap below the stop uses the worse opening price. Estimated slippage and fees apply on both sides. Real fills can differ, especially at locked price limits or in thin trading.

The Time Machine starts after the selected entry candle (default candle 3, the end of the opening range) in the latest available session. A rule-confirmed entry copies its actual slot. It stops at the selected flat-by time. It uses earlier complete sessions of the same family, excluding the latest day's data from the sample pool. Each step samples one candle relative to its prior close from the corresponding historical slot, with optional jitter of 0–6 slots (default ±2). The deterministic seed is 19. At least 3 comparable sessions are required; the threshold is configurable up to 60 and samples below the upstream default of 20 have an explicit warning.

The price fan uses the first 1,000 simulated price paths, without stopping them at exits; the outcome histogram uses all modeled trade exits. Neither is a forecast or confidence interval. Resampling does not preserve whole-day serial dependence or model news, order books, circuit locks or future volatility. Stop/target evaluation is conservative: stop first on ambiguous candles and gap stops at the worse open.

Monitoring begins only after the user starts it. Stale, historical, unfinished and pre-monitor candles never fire observed price/entry notices. Each notice fires once per monitor session/rule/level. Leaving or reloading the page ends monitoring; restarting clears the transient notice list. Standard-session time reminders explicitly require checking special-hours/holiday circulars. These transient notices are not saved as trades or synced to Drive.


Replay and scenario R values use the entry-to-stop price distance as their denominator, with fees/slippage deducted from the numerator. Sizing's reward/risk also includes costs in its loss denominator; the two measures have explicitly different purposes.

Default plan levels (2% stop, 5% target), capital, risk, position cap, fee/slippage estimates and lot size are editable testing inputs, not recommendations or verified broker charges. Capital gains tax is excluded. No universal current circuit band is hardcoded. Available cash, executable prices and actual lot sizes must be checked separately. [NCCPL's T+1 settlement transition](https://www.nccpl.com.pk/transition-to-t1-settlement-cycle) is market context, not a substitute for a broker's available-cash calculation.

## Verification

Automated coverage includes Pakistan session boundaries, unfinished candles, missing history/volume, first closing confirmation, sizing and costs, ambiguous candle outcomes, gap stops, no entry-candle lookahead, Friday separation, deterministic resampling with earlier-session-only inputs, local-storage isolation, invalid feeds and partial research failures. Browser previews use captured real PSX feed data and are labelled as recorded data; they are excluded from the production build.

## Beginner workflow and chart interaction

An in-page beginner guide explains the six-step research workflow, OHLC candles, fees, position sizing, R, replay outcomes and separate Drive journal storage. The daily OHLC chart supports 30/60/90-session windows, pointer/touch inspection and keyboard navigation. Historical breakout levels may populate a hypothetical plan, retaining the original timestamp in the saved journal. Daily and intraday feeds publish independently so replay becomes available as soon as intraday data arrives; loading and unavailable states explain disabled actions.

## Drive sync safety

Sync runs on opening the lab, saving a plan/scanned watchlist, focus, reconnection and once per minute while visible. It merges immutable tickets by ID and uses the latest dated watchlist. New devices load the Drive journal; local edits made during an upload remain pending and are retried. Invalid cloud files and conflicting ticket contents block replacement, rather than silently dropping plans. The app warns before closing or signing out with pending lab changes.

Drive writes are immutable uploads tagged `psxWorkspace=trading-lab-v1`, using the existing `drive.file` permission. Each upload is read back and verified before previously observed, fully incorporated copies are moved to Drive Trash. A concurrent device's unseen file is never retired. Concurrent copies are merged on the next sync; no database migration or portfolio file update is involved. There can briefly be multiple same-named files.

Only saved plans (including validated entry/exit/scenario rules and hypothetical session risk inputs) and the scanned watchlist sync. Older plans without those optional fields still load; the UI supplies clearly identified defaults for review. Unsaved form edits, fetched candles, research feeds and replay results are recomputed, not backed up.


## October 24 parity review

Rechecked upstream HEAD `3d0f4ef6986f4984b7c6bd46f7ff4f87744c3abd`. Regression tests cover both added daily patterns, volume/time confirmation, missing-bar/volume ambiguity, ATR lookahead prevention, hypothetical session gates, legacy and new Drive snapshots, entry-slot/flat-by resampling, deterministic counts/distributions, stale/pre-monitor notice suppression, headline boundaries and annual comparison denominators. The UI supports loading saved plans with their rule and risk settings.

Financial tables are read from the explicitly labelled PSX Annual/Quarterly panels, preserving years/quarters and validating the stated thousands/EPS units. Bank Total Income is supported without requiring a Sales row. If that source is unavailable, a toolkit fallback displays unknown periods explicitly and disables automatic annual changes. PSX/Capital Stake standardized data can differ from issuer filings.
