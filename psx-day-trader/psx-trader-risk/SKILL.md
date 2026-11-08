---
name: psx-trader-risk
description: >-
  PSX Risk Manager. Checks every proposed Pakistan Stock Exchange order
  against your limits and blocks anything over them before it reaches your
  broker ticket: max loss per trade after charges, the daily loss limit
  (losses already taken today plus open risk plus this order), trades per
  day, minimum reward/risk after costs, targets that do not cover costs, the
  entry window in each PSX session, market open and trading day (weekends,
  holidays, the Friday break), flat-by before the session ends, position
  cap, cash after your buffer, the daily price band, and duplicates (already
  held or ordered today). Prints PASS or BLOCK with plain reasons and records
  the verdicts. Use when the user says "check my order", "is this safe",
  "risk check", "does this break my rules", "can I take this trade", "how
  much have I risked today", "am I over my daily limit", or after
  psx-trader-budget and before psx-trader-broker, always.
argument-hint: "[--now \"YYYY-MM-DD HH:MM\"] [--prior-close SYMBOL=PRICE] [--quotes] [--write]"
---

# psx-trader-risk

The Risk Manager is the gate between a proposal and the broker ticket. Every
order psx-trader-budget writes passes through it. A BLOCK is final for that
order: it is not shown to the user as a ticket. These limits keep each loss
and each day's losses small. They do not make a trade win.

Run commands from the pack root:

```bash
python3 psx-trader-risk/check.py                          # trader/orders.json, now
python3 psx-trader-risk/check.py --write                  # also write trader/risk.json
python3 psx-trader-risk/check.py --prior-close OGDC=316.24
python3 psx-trader-risk/check.py --quotes                 # prior close (LDCP) from PSX Market Watch
python3 psx-trader-risk/check.py --now "2026-11-06 10:20" --json
```

Exit code 0: every order passed. 1: at least one was blocked. 2: an input
problem (said in plain words). No network unless `--quotes`.

## What it reads and writes

| file | what |
| --- | --- |
| `trader/orders.json` | the proposed orders (psx-trader-budget) |
| `trader/config.json` | the limits |
| `trader/portfolio.json` | optional: cash and holdings; without it, config capital less today's open orders |
| `trader/prices.json` | optional: `ldcp` for the band, `current` to value holdings |
| `trader/state/broker.json` | today's tickets, placed and filled orders, realized results |
| `trader/risk.json` | with `--write`: `{checked_at, verdicts: [{id, symbol, verdict, checks, reasons, warnings}], today}` |

## The checks

Orders are checked in file order as if each passed order had filled, so a
batch that is fine order by order but breaks a limit together is caught.

| check | blocks when |
| --- | --- |
| order shape | not a buy (long only), qty not whole lots, or not stop < limit < target |
| trading day | weekend or PSX holiday (add Eid and other announced holidays to `extra_holidays`) |
| session date | the order's session_date is not today |
| market open | now is outside a PSX session (Mon-Thu 09:32-15:30; Fri 09:17-12:00 and 14:32-16:30) |
| entry window | outside `entry_window_minutes` after the current session opens, or later than flat-by minutes before its end |
| flat-by | missing, already passed, or after the current session ends (a Friday-morning trade cannot be held through the break) |
| max loss per trade | qty x (cost a share - money from selling at the stop), charges both sides, over `max_loss_per_trade` |
| daily loss limit | losses taken today + open risk of today's open orders + earlier passes + this one, over `daily_loss_limit` |
| trades per day | `max_trades_per_day` already placed or filled today |
| reward/risk | net reward/risk after charges under `min_reward_risk` |
| target covers costs | selling at the target does not beat the cost of buying (Skip), or the order says `skip` |
| position size | cost plus what is already held over `max_position_pct` of capital |
| cash after buffer | the cost would eat into `cash_buffer_pct` of capital |
| price band | the limit is outside today's band (prior close +/- max(10%, Rs 1)) |
| duplicate | the symbol is already held, already has a live order in today's broker log, or appears twice in the batch |

Band source: `--prior-close`, else `ldcp` in `trader/prices.json` (or
`--quotes`), else the plan's band copied into the order. If none is known it
WARNS, it does not block. A stop below the lower limit or a target above the
upper limit is a warning: it cannot fill today.

Rebalance orders (`kind: "rebalance"`) are plain long-term buys: they get the
shape, day, market, position, cash, band and duplicate checks only.

There is no US pattern-day-trader rule on PSX, so there is no PDT check.

## Steps

1. If the price may have moved, refresh prices first (psx-trader-alerts
   `quote --write`) or pass `--quotes`.
2. Run `check.py --write`.
3. Tell the user order by order: PASS or BLOCK, the loss at the stop,
   reward/risk, and how much of today's loss limit and trades it uses. For a
   BLOCK give each reason and the fix (fewer shares via psx-trader-budget, a
   closer stop from psx-trader-exit, wait for the window, or skip the trade).
   Repeat every warning. Never change a limit yourself.
4. Any change to the order means a new check.

## Honest limits

- A PASS only means the order may be shown as a ticket. It is not a yes and
  not advice.
- Charges and bands are estimates; PSX notices (special hours, new holidays,
  special bands) override them. Open risk counts each open order's full loss
  at its stop; a gap or a lower-limit lock can lose more.
- It never places, edits or approves an order, and never loosens a limit.
