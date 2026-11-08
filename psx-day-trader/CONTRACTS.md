# trader/ folder contracts

Every skill reads and writes plain JSON in a `trader/` folder in the folder you
run Claude from (override with `PSX_TRADER_DIR`). Each skill reads what the last
one wrote. Field names below are fixed; skills may add fields but must not
rename these. Prices are rupees, times are Pakistan time (PKT, UTC+5), dates
are `YYYY-MM-DD`, candle times are epoch milliseconds (`t`).

| file | written by | read by |
| --- | --- | --- |
| `config.json` | you (copy `config.example.json`) | all |
| `scan.json` | psx-trader-scanner | entry, news |
| `news.json` | psx-trader-news | entry (optional), you |
| `entry.json` | psx-trader-entry | exit |
| `plan.json` | psx-trader-exit | timemachine, budget, alerts |
| `timemachine.json` | psx-trader-timemachine | budget (optional), you |
| `orders.json` | psx-trader-budget | risk, broker |
| `risk.json` | psx-trader-risk | broker |
| `portfolio.json` | you, or Claude from the PSX Tracker connector | risk, budget |
| `prices.json` | psx-trader-alerts (`quote --write`) | risk |
| `alerts.json` | psx-trader-alerts | alerts |
| `state/broker.json` | psx-trader-broker (append only) | risk (today's trades and losses) |
| `bars/SYMBOL/DATE.json` | psx-trader-timemachine `record` (or entry `record`) | timemachine |
| `analyst/SYMBOL.json` | psx-trader-analyst | you |
| `insiders.json` | psx-trader-insiders | you, scanner (optional) |

## Shapes

```jsonc
// scan.json
{ "as_of": "2026-11-06 10:15 PKT", "mode": "orb" | "daily", "universe": 500,
  "source": "...", "results": [
    { "symbol": "OGDC", "name": "...", "setup": "opening-range breakout" | "20-day closing breakout" | ...,
      "price": 312.89, "change_pct": -1.06, "volume": 4692324,
      "relative_volume": 1.8,            // optional
      "range": {"high": 0, "low": 0},    // orb only
      "trigger": {"time": "10:10", "close": 0},  // orb only
      "notes": ["..."] } ] }

// entry.json
{ "symbol": "OGDC", "setup": "orb", "status": "waiting" | "triggered" | "expired" | "no-setup" | "closed",
  "checked_at": "2026-11-06 10:15 PKT", "session_date": "2026-11-06", "session": "Monday-Thursday",
  "range": {"high": 0, "low": 0, "mid": 0, "start": "09:35", "end": "09:50"},
  "trigger": {"time": "10:10", "close": 0, "volume": 0} | null,
  "message": "plain words" }

// plan.json
{ "symbol": "OGDC", "side": "buy", "session_date": "...", "entry": 0, "stop": 0, "target": 0,
  "risk_per_share": 0, "target_r": 2, "stop_rule": "or-mid" | "or-low" | "atr" | "pct" | "manual",
  "target_rule": "...", "flat_by": "15:25", "band": {"lower": 0, "upper": 0, "basis": "..."},
  "net_reward_per_share": 0, "net_risk_per_share": 0, "net_rr": 0,   // after PSX charges and slippage
  "warnings": ["..."], "created_at": "..." }

// orders.json
{ "created_at": "...", "orders": [
  { "id": "OGDC-20261106-1015", "symbol": "OGDC", "side": "buy", "type": "limit",
    "qty": 0, "limit": 0, "stop": 0, "target": 0, "flat_by": "15:25", "session_date": "...",
    "est_cost": 0,              // qty x buy cost incl. charges
    "max_loss_at_stop": 0,      // after charges both sides
    "profit_at_target": 0,      // after charges both sides, before CGT
    "net_rr": 0, "binding": "risk budget" | "position cap" | "cash buffer",
    "warnings": ["..."] } ] }

// risk.json
{ "checked_at": "...", "verdicts": [ { "id": "...", "symbol": "...", "verdict": "PASS" | "BLOCK",
  "checks": [ {"name": "max loss per trade", "ok": true, "detail": "..."} ], "reasons": ["..."] } ] }

// portfolio.json (you keep this; Claude can fill it from the PSX Tracker connector)
{ "cash": 500000, "positions": [ {"symbol": "OGDC", "qty": 100, "avg_price": 300} ] }

// state/broker.json (append only)
{ "orders": [ { "id": "...", "status": "ticket" | "placed" | "filled" | "cancelled" | "denied",
  "symbol": "...", "qty": 0, "limit": 0, "stop": 0, "target": 0, "at": "...",
  "fill_price": 0, "exit_price": 0, "realized": 0, "note": "..." } ] }
```

## Rules every skill follows

- Long only. No short selling, margin or futures.
- Never places an order. Pakistani brokers have no public order connection;
  psx-trader-broker writes a ticket you enter in your broker's app yourself.
- Data comes only through `psx-trader-common/psx.py` (your PSX Tracker server).
- PSX rules come only from `psx.py`: sessions, price band, charges, price step.
- Unfinished candles never confirm anything. Missing data is reported, never guessed.
- Plain words in every message; numbers in rupees with two decimals.
