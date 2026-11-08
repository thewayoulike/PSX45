---
name: psx-trader-entry
description: >-
  PSX Entry Timer. Watches one Pakistan Stock Exchange setup candle by candle
  and says the moment it confirms: builds the opening range from the first
  three 5-minute candles of the session (09:35 Monday-Thursday, 09:20 Friday
  morning, 14:35 Friday afternoon) from PSX trades and calls the entry on the
  first completed candle that CLOSES above the range high, or above a price
  you give, with an optional volume check. Says waiting (and how far),
  triggered (time and price), expired, no setup, or closed (and when PSX opens
  next). Writes trader/entry.json for psx-trader-exit. Long only, never places
  an order. Use when the user says "tell me when to get in", "watch OGDC",
  "has HUBC broken out", "did it break the opening range", "entry signal",
  "time my entry", "kab khareedna hai", "is the breakout confirmed", "watch
  this PSX share", or after psx-trader-scanner, before psx-trader-exit.
argument-hint: "[check | watch] SYMBOL [--setup orb|level:PRICE] [--volume-x X]"
---

# psx-trader-entry

The Entry Timer turns a setup into one moment: the candle that confirms it.
It waits for each 5-minute candle to finish. A price that pokes above the high
in the middle of a candle is not an entry; a candle that CLOSES above it is.
Then it says the time and the price, writes them down for the Exit Planner,
and stops. It never buys anything. Day trading loses most people money, and a
clean signal does not change that.

Run from the pack root (the folder that holds `psx-trader-common`):

```bash
python3 psx-trader-entry/entry.py check OGDC                       # opening-range breakout
python3 psx-trader-entry/entry.py check OGDC --write               # also save trader/entry.json
python3 psx-trader-entry/entry.py check OGDC --setup level:316.50  # first close above your price
python3 psx-trader-entry/entry.py check HUBC --volume-x 1.5
python3 psx-trader-entry/entry.py check HUBC --now "2026-11-06 10:15"   # replay the latest session
python3 psx-trader-entry/entry.py watch OGDC --every 30            # polls until triggered or expired
```

Exit code 0 = triggered, 1 = anything else, 2 = could not run.

## What it reads and writes

| file | what |
| --- | --- |
| `trader/config.json` | `entry_window_minutes` ([15, 120]) and `flat_by_minutes` (5). Optional |
| `trader/scan.json` | the scanner's hits, if the user wants to go down the list |
| `trader/entry.json` | `check --write`, or `watch` on a trigger: symbol, setup, status, session, opening range (high, low, mid, start, end), trigger (time, close, volume), message |

## The rule

- **Opening range.** High and low of the first three complete 5-minute
  candles of the session. Friday has two sessions; the afternoon builds its
  own range at 14:35-14:50.
- **Trigger.** The first completed candle after the range that closes above
  the range high (or your level). A close equal to it is not above. With a
  level, the candle before must have closed at or below it: a share already
  above your level all morning is not a breakout.
- **Time** is the candle's close time (the 09:45 candle closes at 09:50); the
  price is its close, to the paisa.
- **Only finished candles count.** A candle still forming never confirms.
- **Missing candles.** A 5-minute slot with no trades before the trigger
  means no setup: it could hide an earlier entry.
- **Entry window.** By default 15 to 120 minutes after the session's first
  full candle, and never after the flat-by time (5 minutes before the
  session ends; Friday morning ends at 12:00). Past it: expired.
- **Statuses.** waiting, triggered, expired, no-setup, closed (weekend,
  holiday, or before today's first session; it says when PSX opens next).

## Steps

1. Get the symbol from the user, or from `trader/scan.json`. Offer
   `/psx-trader-news SYMBOL` first.
2. Run `entry.py check SYMBOL`. Tell the user the status in one line:
   waiting and how far, triggered at what time and price, or expired.
3. To wait for it, run `entry.py watch SYMBOL --every 30` in the background,
   or `check SYMBOL --write` on a `/loop`. `watch` prints one line per
   finished candle, stops on a trigger (writes `trader/entry.json`) or when the
   window ends, and never runs while PSX is closed. Keep the computer awake.
4. When it triggers, say the time and price and that nothing was placed. If
   the trigger is more than one candle old, say so: a late entry is a
   different trade.
5. Hand off to `/psx-trader-exit` to set the stop and target BEFORE anything
   is bought.

## Honest limits

- Candles are built from PSX trades read through the user's PSX Tracker
  server. Unofficial, can lag; say so when a minute matters.
- PSX publishes only the latest session's trades: replays (`--now`) work only
  on that session.
- Special hours, newly announced holidays and halts are not known unless they
  are in `psx.py` or `extra_holidays` in the config. Check PSX notices.

## What it never does

It never places an order, never sizes a position, never sets the stop, never
moves the level after the fact, and never counts a candle that has not
closed. It never runs the broker step from a background watch. Education and
tooling, not financial advice. Long only.
