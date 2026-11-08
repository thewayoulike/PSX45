---
name: psx-trader-broker
description: >-
  Order Ticket for the Pakistan Stock Exchange. Pakistani brokers have no
  public order connection, so this never sends an order: it turns each
  approved order in trader/orders.json into a plain ticket (buy, symbol,
  quantity, limit price, stop, target, flat-by time, estimated cost with
  commission, sales tax, CDC and exchange fees, and the max loss at the stop)
  that you type into your own broker's app. A ticket is READY only when
  psx-trader-risk passed that exact order today. Records your yes, then what
  happened (placed, filled, cancelled, denied) in an append-only log, with the
  realized profit or loss after PSX charges. Use when the user says "place the
  order", "buy it", "execute", "show me the ticket", "what do I type in my
  broker app", "I bought it", "it filled at", "I sold at", "record the fill",
  "cancel that", "what did I trade today", or after /psx-trader-risk passes.
argument-hint: "[ticket number]"
---

# psx-trader-broker

The last step before money moves, and the strictest one. In Pakistan there is
no broker API a script may use, so this skill **never places an order**. It
prints a ticket; the user enters it in their own broker's app or terminal and
presses buy themselves. Two things must be true before a ticket is worth
entering:

1. **psx-trader-risk passed this exact order today** (matched by order id, and
   the risk check is dated today). Otherwise the ticket says NOT READY and why.
2. **The user typed an explicit yes for this one order in the chat.**

No PASS, no READY. No yes, nothing recorded.

Commands (run from the pack folder):

```bash
python3 psx-trader-broker/ticket.py show                       # every ticket, READY or NOT READY
python3 psx-trader-broker/ticket.py show --index 1
python3 psx-trader-broker/ticket.py confirm --index 1 --reply "yes"
python3 psx-trader-broker/ticket.py result --index 1 --status placed
python3 psx-trader-broker/ticket.py result --index 1 --status filled --fill 312.50
python3 psx-trader-broker/ticket.py result --index 1 --status filled --fill 312.50 --exit 318.00
python3 psx-trader-broker/ticket.py result --index 1 --status cancelled --note "price ran away"
python3 psx-trader-broker/ticket.py log                        # today's decisions
```

`--now "2026-11-06 10:15"` (before the command) pins the clock, in Pakistan time.

## What it reads and writes

| file | what |
| --- | --- |
| `trader/orders.json` | proposed orders from psx-trader-budget (read only) |
| `trader/risk.json` | psx-trader-risk verdicts; only a PASS dated today makes a ticket READY |
| `trader/state/broker.json` | append only: every yes, placed, filled, cancelled and denied, with each entry's max loss and realized result; psx-trader-risk reads it for today's trades and losses |
| `trader/config.json` | `fee_pct` and `one_side_commission` for the charges |

## Steps

1. Run `ticket.py show`. If a ticket is NOT READY, read the reasons to the user
   and send them back to `/psx-trader-risk` (or `/psx-trader-budget`). Never
   present a NOT READY ticket as something to enter.
2. Show ONE READY ticket and ask: "Enter this order in your broker app? Reply
   yes or no." One order per question. Never offer "yes to all".
3. Only when the user replies with a clear yes for that order, run
   `ticket.py confirm --index N --reply "<their reply, word for word>"`. If it
   prints "Not recorded" (for example "sure", "ok", "yes to all", or a yes that
   names another stock or another quantity), ask again. Never turn a reply into
   a yes yourself.
4. Tell the user exactly what to type in their app, from the ticket:
   Buy, symbol, quantity, order type Limit, price, Day. They review and submit
   it there. You cannot see their broker account.
5. When they tell you what happened, record it with `result`:
   `--status placed` (order sent, not filled yet), `--status filled --fill P`
   (bought at P), and when they sell, `--status filled --fill P --exit X` for
   the round trip. `--qty Q` if only part filled. `cancelled` and `denied`
   take no prices. Each call adds a new line; nothing earlier is changed.
6. While the trade is open, `/psx-trader-alerts add --from-plan` watches the
   stop, the target and the flat-by time.

## The ticket

```
TICKET 1 of 1  (OGDC-20261106-1010)
  BUY 100 shares of OGDC, LIMIT Rs. 312.50, good for the day
  stop-loss   Rs. 309.00   (exit if it trades here)
  target      Rs. 318.00
  flat by     16:25 PKT on 2026-11-06 (sell anything still open)
  est. cost   Rs. 31,306.05 including commission, sales tax, CDC and exchange fees
  max loss    Rs. 412.00 if the stop fills at Rs. 309.00
  READY: psx-trader-risk PASS today. Waiting for your yes for this one order.
  In your broker's app: Buy > OGDC > Quantity 100 > Order type Limit > Price 312.50 > Day.
```

A ticket is NOT READY when: risk said BLOCK, the risk check is missing or from
another day, the order is for an earlier session, it is already past the
flat-by time, the limit is off the Rs 0.01 price step, the stop is not below
the limit, or the side is not buy (this pack is long only).

## Realized result

`result ... --fill P --exit X` stores `realized` = quantity x (sale price minus
sell-side charges, minus purchase price plus buy-side charges), using the PSX
charges in `psx-trader-common/psx.py` (commission with 15% Sindh sales tax, CDC
fee, PSX/SECP/NCCPL fees). It is before capital gains tax. Your broker's
contract note is the real number: if it differs, record theirs in `--note`.

## Honest limits

- It never places, changes or cancels an order. It cannot see the user's
  broker account, cash, fills or holdings; it only knows what the user says.
- Most PSX broker apps have no linked stop-loss order. The stop on the ticket
  is a level to act on, watched by psx-trader-alerts; it is not sitting at the
  exchange.
- A limit order can fill partly or not at all; a stop can fill worse in a fast
  market or not at all when the price locks at the daily limit.
- Charges are estimates from the config; brokers' schedules differ.
- Paper mode (`"paper": true`) is the default: use the tickets to practise
  before entering real orders.

## What it never does

- Never sends anything anywhere, never asks for broker logins, passwords or PINs.
- Never records a yes the user did not type, and never two orders on one yes.
- Never runs from a scheduled or background task: nobody is there to say yes.
- Never edits or deletes lines in `trader/state/broker.json`.

Education and tooling, not financial advice. A PASS is a rules check, not a
recommendation.
