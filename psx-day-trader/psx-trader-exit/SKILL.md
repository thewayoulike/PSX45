---
name: psx-trader-exit
description: >-
  PSX Exit Planner. Sets the stop and the target before you buy a Pakistan
  Stock Exchange share, so you know when to get out. Reads the entry from
  psx-trader-entry (or a price you give), puts the stop at the opening-range
  midpoint by default (or the range low, an ATR multiple, a percent, or your
  price), rounds it down to the paisa, sets the target at 2R and caps it at
  nearby resistance, the typical daily range and the upper circuit limit.
  Works out reward and risk a share after PSX brokerage, sales tax, CDC and
  exchange fees and slippage, says "Skip" when the target does not cover
  costs, and sets the flat-by time (11:55 on Friday morning). Refuses a stop
  too close to survive costs. Writes trader/plan.json. Long only, never places
  an order. Use when the user says "where's my stop", "set my stop and
  target", "plan the exit", "when do I get out", "stop loss", "what's my R",
  "risk reward after charges", "upper circuit", "will the target cover
  brokerage", or right after psx-trader-entry triggers.
argument-hint: "[plan | show] [--stop or-mid|or-low|atr:K|pct:X|price:X] [--target 2R|1R|price:X]"
---

# psx-trader-exit

The Exit Planner decides how a trade ends before it starts. The stop is
where the setup has failed. The target is where you take what you came for.
Both are set BEFORE the entry and written down, so nobody decides anything in
the middle of a fast move. A stop is a plan, not a guarantee: a gap, a fast
market or a lock at the lower circuit limit can fill past it, or not at all.

Run from the pack root (the folder that holds `psx-trader-common`):

```bash
python3 psx-trader-exit/exit.py plan                         # trader/entry.json: or-mid stop, 2R target
python3 psx-trader-exit/exit.py plan --stop or-low --target 1R --write
python3 psx-trader-exit/exit.py plan --stop atr:1.5
python3 psx-trader-exit/exit.py plan --symbol OGDC --entry 315.01 --stop pct:1   # plan ahead
python3 psx-trader-exit/exit.py show                         # the current trader/plan.json
```

Other flags: `--now "YYYY-MM-DD HH:MM"` (Pakistan time), `--no-entry-file`.
Exit code 0 = plan made, 1 = refused or Skip, 2 = could not run.

## What it reads and writes

| file | what |
| --- | --- |
| `trader/entry.json` | from psx-trader-entry: symbol, session, opening range, trigger |
| `trader/config.json` | `fee_pct`, `slip_pct`, `one_side_commission`, `flat_by_minutes`, `min_reward_risk` |
| PSX data | daily candles (resistance, typical range, prior close) and the latest session's trades |
| `trader/plan.json` | with `--write`: entry, stop and its rule, target and what bound it, risk a share, net reward, net risk and reward:risk after charges, flat-by, price band, warnings |

## Stops and targets

| stop | where it goes |
| --- | --- |
| `or-mid` | opening-range midpoint (default) |
| `or-low` | opening-range low: wider, so fewer shares for the same max loss |
| `atr:K` | K x the 14-candle ATR of 5-minute candles up to the entry candle |
| `pct:X` | X% under the entry |
| `price:X` | your price |

- **Rounding.** The stop rounds DOWN to Rs 0.01. Target = entry + R x risk,
  then rounded down.
- **Target cap.** The target is the LOWEST of: the R benchmark; one paisa
  below the nearest resistance above the entry (yesterday's high, swing highs
  of the last 60 daily candles, and swing highs of today's candles up to the
  entry); today's low so far plus the median daily range of up to 20 earlier
  days; the upper price limit. The plan names the one that bound it.
- **Price band.** Estimated as prior close +/- max(10%, Rs 1). Special bands
  and ex-dates differ: check the PSX company page.
- **After charges.** Broker commission (with 15% sales tax), CDC and exchange
  fees and slippage, both sides. If the target leaves nothing after costs:
  "Skip — target does not cover costs".
- **Refused, with the reason.** Stop at or above the entry; target at or
  below it; a stop closer than two price steps or the round-trip cost a share;
  an entry outside the price band; an entry at or after flat-by; an
  entry.json that has not triggered (give `--entry` to plan ahead).
- **Flat by.** 5 minutes before the session ends: 15:25 Monday-Thursday,
  11:55 Friday morning (before the break), 16:25 Friday afternoon.
- **Warnings.** Entry near the upper limit (buy orders may queue), stop near
  or below the lower limit (may not fill), gap risk to the lower limit,
  reward:risk under your minimum.

## Steps

1. Run it right after `/psx-trader-entry` triggers. Before that, `--entry
   PRICE` plans ahead.
2. Use the default stop for an opening-range breakout unless the user names
   another. A level setup has no range of its own to lean on: ask.
3. Run `exit.py plan --write`. Read back entry, stop and its rule, target and
   what bound it, risk a share, reward:risk after charges, and flat by.
4. If it refuses or says Skip, give the reason and the fix (a wider stop, a
   different trade). Never loosen anything on your own.
5. Say once that the stop is a plan, not a guarantee.
6. Hand off to `/psx-trader-timemachine` to replay it, then `/psx-trader-budget`.

## Honest limits

- Data is unofficial, through the user's PSX Tracker server; intraday only for
  the latest session, so an ATR stop early in the session may be refused.
- Bands and charges are estimates from `psx.py`; your broker's rates may
  differ (set `fee_pct` in the config). Capital gains tax is not included.

## What it never does

It never places an order, never sizes a position, never widens a stop to make
a plan pass, never prints a profit forecast, and never calls a stop a
guarantee. Education and tooling, not financial advice. Long only.
