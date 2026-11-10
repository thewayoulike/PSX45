---
name: psx-trader-timemachine
description: >-
  PSX Time Machine. Replays a planned Pakistan Stock Exchange day trade before
  you risk a rupee: 10,000 simulated runs of the rest of the session from your
  entry to your flat-by time, built from the stock's own recorded 5-minute
  candles at the same time of day (Monday-Thursday, Friday morning and Friday
  afternoon kept apart), plus the same opening-range rule on every earlier
  session you recorded. Prints target first, stop first, still open at
  flat-by, average and median net R after PSX charges, the P10/P50/P90 rupee
  result, the history, and one honest verdict. Also records each day's
  candles (PSX only publishes the latest session). Use when the user says
  "run the time machine", "replay this trade", "simulate this trade", "what
  are the odds", "monte carlo", "backtest this setup", "how often does this
  hit the target", "is this a coin flip", "record today's candles", "save the
  session", "build my history", or after psx-trader-exit writes a plan and
  before psx-trader-budget.
argument-hint: "[record SYMBOL[,SYMBOL] | run [--write] [--daily]]"
---

# psx-trader-timemachine

The Time Machine sits between the plan and the money. psx-trader-exit has set
the entry, the stop and the target. Before anything is sized, this skill asks:
if the rest of today plays out like this stock's own recorded sessions, how
often does the plan hit the target first, the stop first, or neither by
flat-by? It is a simulation, not a prediction. Most people who day trade lose
money, and a good-looking replay does not change that.

Run commands from the pack root (the folder holding `psx-trader-common/`):

```bash
python3 psx-trader-timemachine/timemachine.py record OGDC,HUBC      # after EVERY close: save today's 5-minute candles
python3 psx-trader-timemachine/timemachine.py record --all          # every symbol that traded (about 5-10 minutes)
python3 psx-trader-timemachine/timemachine.py record --all --min-volume 100000 --index KSE100   # liquid KSE-100 only
python3 psx-trader-timemachine/timemachine.py run                    # trader/plan.json, 10,000 paths, seed 19
python3 psx-trader-timemachine/timemachine.py run --write            # also save trader/timemachine.json
python3 psx-trader-timemachine/timemachine.py run --paths 20000 --seed 7 --jitter 1 --min-sessions 10
python3 psx-trader-timemachine/timemachine.py run --entry-time 10:15 --flat-by 15:25
python3 psx-trader-timemachine/timemachine.py run --daily --days 5   # swing-trade view from daily candles
python3 psx-trader-timemachine/timemachine.py run --json
```

## Why it needs recording first

PSX publishes intraday trades only for the LATEST session. Past 5-minute
candles exist only if the user saved them. `record` saves the latest
session's finished candles to `trader/bars/SYMBOL/DATE.json` and says how many
complete sessions of each kind are stored. Tell the user to run it after every
close for each stock they trade or watch: Monday-Thursday after 15:30, Friday
after 16:30 (one run saves both Friday sessions). A daily task at 16:45 PKT,
Monday to Friday, works (Task Scheduler on Windows, cron elsewhere). Offer to
set that up with them; do not set it up silently.

The replay runs with 3 comparable sessions, and warns below 20 (the upstream
default). With too few, it refuses in plain words and says how many more
sessions (and roughly how many weeks) to record. Friday sessions come once a
week, so they fill slowly. Until then, `run --daily` gives a swing-trade
view from daily candles: clearly not an intraday answer.

## What it reads and writes

| file | what |
| --- | --- |
| `trader/plan.json` | from psx-trader-exit: symbol, session_date, entry, stop, target, target_r, stop_rule, flat_by, band (optional entry_time) |
| `trader/entry.json` | optional: its trigger time gives the entry slot when the plan has none |
| `trader/orders.json` | optional: the order's qty turns the rupee range into the whole position |
| `trader/bars/SYMBOL/*.json` | the recorded sessions (written by `record`) |
| PSX Tracker server | the latest session's trades, daily candles for `--daily` |
| `trader/timemachine.json` | with `--write`: plan, mc (odds, R, rupee percentiles), history, verdict, warnings |

## How it works

1. **Sessions.** Recorded candles plus the latest session's trades, grouped
   by PSX session. Only COMPLETE sessions count. The plan's own day is never
   in the pool.
2. **The pool.** Earlier complete sessions of the SAME kind as the entry
   (Monday-Thursday, Friday morning or Friday afternoon). Each candle becomes
   ratios to the candle before it (open, high, low, close over the previous
   close).
3. **One replay.** Start at the entry price after the entry candle (the
   plan's entry_time, the entry.json trigger, or the end of the 15-minute
   opening range). For each candle up to flat-by, pick a slot at the same time
   of day plus or minus `--jitter` slots, one past candle from it at random,
   and scale it. Prices stay inside the day's price band.
4. **PSX fill rules** (same as the PSX Trading Lab): the stop is checked
   before the target on a candle that touches both; a gap below the stop
   fills at the worse open; while the stock is locked at the lower limit a
   stop cannot fill ("locked" outcome). Still open at flat-by: sold at the
   last close.
5. **Net R** = rupees per share after commission, sales tax, CDC and exchange
   fees and slippage on both sides, divided by (entry - stop). CGT is not in R.
6. **History.** The opening-range rule (first completed close above the
   15-minute high inside your entry window, filled at the next candle's open,
   the plan's stop rule and target R) on every earlier recorded session, plus
   the same-kind sessions alone. That is what really happened.
7. **Verdict.** Among replays that hit a side, how often the target came
   first, against what breaks even after charges. Within 5 points: "Close to
   a coin flip" (or "break-even"). 5 to 15: "Leans toward". 15+: "Strongly
   toward". Lines under it flag many open trades or a negative average.

Same plan, same recorded data and same `--seed`: the same numbers.

## Steps

1. Check `trader/plan.json` is today's plan. If not, run psx-trader-exit.
2. Run `timemachine.py run --write`. If it refuses for lack of history, say
   so plainly, give the record command and the count needed, and offer
   `run --daily` as a clearly labelled swing view.
3. Tell the user, in order: the odds (target / stop / open at flat-by /
   locked), average and median net R, the P10/P50/P90 rupee range, the
   history line, then the verdict and the lines under it exactly as printed.
   Say the seed and how many sessions the pool had.
4. If it is a coin flip or leans to the stop, say so. Do not dress it up. If
   history and replays disagree, say that too.
5. Say once: built from recorded sessions, not a prediction. Results, news,
   halts and limit locks can do what those sessions never did.
6. If the user still wants the trade, hand off to psx-trader-budget.

## Honest limits

- A simulation from the stock's own recent candles. It never predicts.
- History is only what the user recorded. Thin stocks have quiet slots that
  are filled flat; the output says how many.
- Price bands are estimates (prior close +/- max(10%, Rs 1)); special bands,
  corporate actions and halts differ. Charges are estimates of a typical
  broker schedule.
- 5-minute candles, checked candle by candle, never tick by tick.
- Long only. Education and tooling, not financial advice. It never places,
  sizes or changes an order, and never calls a result a sure thing.
