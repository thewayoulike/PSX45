---
name: psx-trader-scanner
description: >-
  PSX Chart Scanner. Lists Pakistan Stock Exchange charts that match a simple
  rule: liquid symbols from PSX Market Watch, daily setups on completed daily
  candles (20-day closing breakout, bull flag, reclaimed 20-day average, RSI
  below 30, oversold bounce, RSI recovery, with volume against its 20-day
  average) and opening-range breakouts in the latest PSX session on
  5-minute candles built from PSX trades (Friday afternoon is its own
  session). Writes trader/scan.json for psx-trader-news and psx-trader-entry.
  Long only, never places an order. Use when the user says "scan PSX", "scan
  the KSE-100", "find me setups", "what is breaking out on PSX", "opening range
  breakouts", "ORB scan", "bull flags", "oversold shares", "KSE-30 breakouts",
  "which stocks are moving today", "build my watchlist", "pre-market scan",
  "what should I look at today", "kaunsa share breakout kar raha hai", or at
  the start of a PSX trading day.
argument-hint: "[universe | daily | orb] [--index KSE100] [--symbols A,B] [--at HH:MM]"
---

# psx-trader-scanner

The scanner is the first step of a day trade on PSX. It reads charts and
lists the ones that match a rule. A match is a chart that met a rule, not a
stock to buy, and not a prediction. Most people who day trade lose money; the
scanner does not change that. It only saves flipping through 500 charts by
hand.

Run from the pack root (the folder that holds `psx-trader-common`):

```bash
python3 psx-trader-scanner/scan.py universe                        # liquid symbols on Market Watch
python3 psx-trader-scanner/scan.py universe --index KSE100 --write # -> trader/universe.txt
python3 psx-trader-scanner/scan.py daily                           # 60 most traded, daily setups
python3 psx-trader-scanner/scan.py daily --index KSE30 --write     # -> trader/scan.json
python3 psx-trader-scanner/scan.py daily --symbols OGDC,HUBC,PPL
python3 psx-trader-scanner/scan.py orb --write                     # opening-range breakouts now
python3 psx-trader-scanner/scan.py orb --at 10:15 --volume-x 1.5   # replay the latest session to 10:15
```

Flags: `--min-price` and `--min-volume` (default from `trader/config.json`:
Rs 5 and 100,000 shares), `--sector CODE`, `--index KSE100|KSE30|KMI30|...`,
`--symbols A,B`, `--watchlist FILE` (scan.json, universe.txt or a list),
`--limit N` (default 60, most traded first; 0 = all), `--now "YYYY-MM-DD
HH:MM"`, `--show N`, `--json`, `--quiet`, `--write`. Exit code 0 when
something matched, 1 when nothing did, 2 when it could not run (one plain
line says why).

## What it reads and writes

| file | what |
| --- | --- |
| `trader/config.json` | `min_price`, `min_volume`, `entry_window_minutes`, `flat_by_minutes` (optional) |
| `trader/universe.txt` | `universe --write`: one `SYMBOL\|Name` a line |
| `trader/scan.json` | `daily --write` / `orb --write`: `as_of`, `mode`, `universe`, `results[]` (symbol, setup, price, change, volume, relative volume; for orb also range and trigger), `failed[]` |

## The rules

- **Universe.** Market Watch, one request for about 500 symbols. Kept when
  the price is at least the minimum and the session's volume at least the
  minimum. Sorted by traded value (price x volume), most traded first.
- **Daily setups** (completed daily candles only; today's candle counts after
  the last session closes):
  20-day closing breakout (last close above every close of the 20 before it);
  bull flag (up more than 10% over the 10 sessions before the last 5, then the
  last 5 closes inside a 5% range); reclaimed 20-day average; RSI 14 below 30;
  oversold bounce (RSI was below 30 yesterday and today closed up); RSI
  recovery (back to 30 or more). Relative volume = last volume / average of
  the 20 before it.
- **Opening-range breakout.** The range is the first three complete 5-minute
  candles of the session: 09:35-09:50 Monday to Thursday, 09:20-09:35 Friday
  morning, 14:35-14:50 Friday afternoon. The trigger is the first completed
  candle that CLOSES above the range high (a wick is not enough). A 5-minute
  slot with no trades before the trigger rules the chart out: it could hide an
  earlier trigger. `--volume-x 1.5` also needs the trigger candle's volume at
  1.5x the range average. Each hit says its time, close, % over the range and
  whether it fell inside the entry window (by default 15 to 120 minutes after
  the session's first full candle, never after the flat-by time).

## Steps

1. Before the open or after the close: `scan.py daily` (or with `--index
   KSE100`). Say the data date, how many symbols were scanned out of how
   many, how many could not be read, and the matches by setup.
2. During the session, after the range has formed (09:50 Monday-Thursday,
   09:35 Friday morning, 14:50 Friday afternoon): `scan.py orb`. Say the time
   of the data and which hits are inside the entry window. A later hit is
   closer to the price now; an early one may have moved on.
3. Let the user pick. Hand it on: `/psx-trader-news SYMBOL`, then
   `/psx-trader-entry SYMBOL`. Never pick for them.

## Requests and speed

Daily candles and trades cost one request per symbol through the user's PSX
Tracker server (limit about 120 a minute), so a scan of 60 symbols takes
about a minute; progress lines go to stderr. Use `--limit`, `--index` or
`--symbols` to stay small. A symbol that fails is listed, not fatal.

## Honest limits

- Data is unofficial, read through the user's PSX Tracker server from the PSX
  data portal. It can lag and can be wrong. Say the time of the data.
- PSX publishes only the latest session's trades, so the ORB scan and
  `--at` replays work only on the latest session. Daily candles go back years.
- Never call a partial scan "the whole market": say "scanned 60 of 206".
- Say "matched a rule", never "a buy", "a winner" or "a good trade". Never
  print a profit figure.

## What it never does

It never places, sizes or checks an order, never says which stock to buy,
and never promises that a setup works. Education and tooling, not financial
advice. Long only: no short selling, margin or futures.

## Default list (config)

`scan_index` (e.g. "KSE100"), `scan_limit` (0 = every stock in it) and
`scan_min_volume` in trader/config.json set what a plain `daily` or `orb` scan
checks. Early in the session Market Watch volume is only what traded so far
today, so keep `scan_min_volume` low (0) for morning breakout scans. Pass
`--index all` or `--limit 60` to override for one run.
