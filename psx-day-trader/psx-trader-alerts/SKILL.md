---
name: psx-trader-alerts
description: >-
  PSX clock, quotes and price alerts. Says whether the Pakistan Stock Exchange
  is open in plain words (Monday-Thursday 09:32-15:30, Friday 09:17-12:00 and
  14:32-16:30 with the Friday break, weekends and holidays), fetches the latest
  Market Watch prices for your stocks and writes trader/prices.json, and rings
  alerts once each: the plan's stop, target and flat-by time, any above/below
  level, plus reminders at each session open, flat-by, the Friday break and the
  close. Use when the user says "is the market open", "is PSX open", "when does
  PSX open", "what time is the Friday break", "get me a price", "quote OGDC",
  "price of my holdings", "set an alert", "alert me when OGDC hits 320", "tell
  me if it drops below", "watch my stop", "watch my trade", "remind me to close
  by flat-by", "check my alerts", or right after /psx-trader-exit writes a plan.
argument-hint: "[symbol] [--above|--below price]"
---

# psx-trader-alerts

Watches the numbers so the user does not have to stare at a screen. An alert
is information, never an order: when the stop rings, nothing is sold. The user
sells in their own broker app.

Commands (run from the pack folder):

```bash
python3 psx-trader-alerts/alerts.py clock                       # open or closed, today's sessions, next open
python3 psx-trader-alerts/alerts.py quote OGDC,PPL --write      # -> trader/prices.json
python3 psx-trader-alerts/alerts.py quote --holdings --write    # portfolio + orders + plan symbols
python3 psx-trader-alerts/alerts.py add --from-plan             # stop, target, flat-by from trader/plan.json
python3 psx-trader-alerts/alerts.py add OGDC --below 305.50
python3 psx-trader-alerts/alerts.py add OGDC --above 320 --label "breakout level"
python3 psx-trader-alerts/alerts.py list
python3 psx-trader-alerts/alerts.py remove ogdc-below-305.5     # or: remove --rang, remove --all
python3 psx-trader-alerts/alerts.py check                       # one look; rings what hit
```

`--now "2026-11-06 11:56"` (before the command) pins the clock, Pakistan time.

## What it reads and writes

| file | what |
| --- | --- |
| `trader/plan.json` | the trade from psx-trader-exit, for `add --from-plan` |
| `trader/portfolio.json`, `trader/orders.json` | symbols for `quote --holdings` |
| `trader/alerts.json` | the alert rules, when each rang, and today's session reminders |
| `trader/prices.json` | latest quotes, merged in: `{SYMBOL: {price, ldcp, change_pct, high, low, volume, time}}`, read by psx-trader-risk |

## Alert types

| type | rings when | rings again |
| --- | --- | --- |
| `stop` / `below` | last traded price at or below the level | never; add it again to re-arm |
| `target` / `above` | last traded price at or above the level | never |
| plan `time` (flat-by) | the plan's date, once the clock passes the time | never |
| session reminders | each session open, flat-by (config `flat_by_minutes` before each session ends), Friday break, close | once per trading day each |

Plan alerts carry the plan's `session_date`, so yesterday's stop never rings
today. Session reminders only ring within 30 minutes of their time; a check
made later skips them quietly instead of ringing old news. On Friday there are
two flat-by reminders: before 12:00 (the break) and before 16:30.

When the price is not at the level now but today's high or low crossed it,
`check` prints a note instead of ringing (the touch may have come before the
alert existed).

## Steps

1. "Is the market open?" -> `clock`, and say it in one or two sentences.
2. After a plan is written -> `add --from-plan`, then `list` to show what is
   watched.
3. To watch: run `check` once and report what rang in plain words. To repeat
   it, the user can run `/loop 1m python3 psx-trader-alerts/alerts.py check`
   in Claude Code, or set a scheduled task that runs `check` every few minutes
   during PSX hours. Do not poll faster than once a minute: Market Watch is one
   request and the PSX Tracker server allows 120 requests a minute.
4. When a stop or flat-by rings, tell the user to act in their broker app, then
   record the sale with `/psx-trader-broker` (`result ... --exit`).
5. For sizing and the risk check, `quote --holdings --write` refreshes
   `trader/prices.json`.

## Quotes

Prices come from PSX Market Watch (dps.psx.com.pk/market-watch), read through
the user's PSX Tracker server: one request for every symbol. Market Watch shows
the **latest traded price**, which can lag the market by a minute or more, and
for a thinly traded stock it can be an old trade. A stock with no volume today
shows the previous close. After the close the prices are the last session's.
Every `quote` and `check` prints these warnings; repeat them to the user.

## Honest limits

- Unofficial data through the PSX Tracker server, not an exchange feed.
- Standard hours only. Special hours (Ramadan is built in for 2026), Eid and
  other moon-dependent holidays must be added to `extra_holidays` in
  `trader/config.json`; check PSX notices.
- A check only sees the price at that moment. Between checks the price can
  touch a level and come back.
- Alerts never place, change or cancel orders.

Education and tooling, not financial advice.
