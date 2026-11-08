---
name: psx-trader-budget
description: >-
  PSX Budget Manager. Sizes a Pakistan Stock Exchange day trade to your
  capital and your max loss per trade, with PSX charges (commission, sales
  tax, CDC and exchange fees) and slippage counted on both sides. Reads the
  plan from psx-trader-exit (entry, stop, target), finds the whole lots that
  fit inside your limits (risk budget, position cap, cash after your buffer,
  optional maximum order), says which limit decided it, warns about a gap to
  the lower limit, orders near a price limit, low reward/risk and targets
  that do not cover costs, shows the profit after CGT, and writes one limit
  order to trader/orders.json. Nothing is placed. Use when the user says "how
  many shares", "size this trade", "how much should I buy", "I have Rs
  300,000", "I only want to risk Rs 3,000 a trade", "keep 10% in cash", "what
  will charges cost", "position size", "rebalance my portfolio", "split my
  money across these stocks", or after psx-trader-exit or
  psx-trader-timemachine.
argument-hint: "[--capital RUPEES] [--max-loss RUPEES] [--write] | rebalance --targets FILE"
---

# psx-trader-budget

The Budget Manager turns a plan ("buy OGDC at 313.00, stop 305.00, target
330.00") into an exact order ("buy 530 shares"), inside rules the user sets
once in `trader/config.json`. The stop decides the size: the further away the
stop, the fewer shares. It writes a proposal only; psx-trader-risk checks it
next. Sizing to a max loss keeps each loss small; it does not make a trade win.

Run commands from the pack root:

```bash
python3 psx-trader-budget/size.py                         # trader/plan.json + trader/config.json
python3 psx-trader-budget/size.py --write                 # write trader/orders.json
python3 psx-trader-budget/size.py --capital 300000 --max-loss 3000
python3 psx-trader-budget/size.py --json
python3 psx-trader-budget/size.py rebalance --targets targets.json --write
```

## Step 1: set the rules once

If `trader/config.json` is missing, copy `config.example.json` from the pack
root and ask the user, in plain words, for: `capital` (only money they can
afford to lose), `max_loss_per_trade` (Rs lost if the stop fills),
`max_position_pct`, `cash_buffer_pct`, `lot_size` (1 on the regular market;
check the broker), `fee_pct` (their broker's commission %), `slip_pct`,
`one_side_commission` (true if the broker waives the sale commission on a
same-day round trip), `cgt_pct`, and optional `max_order` / `min_order`
(Rs). Keep `paper` true. Never change a limit on your own.

## Step 2: size it

| limit | shares (rounded DOWN to whole lots) |
| --- | --- |
| risk budget | `max_loss_per_trade` / loss a share (cost with charges minus money from selling at the stop) |
| position cap | capital x `max_position_pct` (less what is already held) / cost a share |
| cash buffer | (cash - capital x `cash_buffer_pct`) / cost a share |
| maximum order | `max_order` / cost a share, when set |

Capital is `--capital`, else `trader/portfolio.json` (cash plus holdings at
cost), else the config. The smallest limit decides (`binding`).

It refuses, with no order, when: stop/entry/target are not stop < entry <
target, the plan is a sell (long only), the stop is closer than two price
steps or the round-trip charges, or one lot does not fit.

It warns (and psx-trader-risk may block) when: reward/risk after charges is
below `min_reward_risk`; the target does not cover costs (**Skip - the target
does not cover costs**, `skip: true`); the entry is within two steps of the
upper limit (buys queue there); the stop is at the lower limit (it may not
fill if the stock locks); a fall to the lower limit would lose over twice the
risk budget; the order is under `min_order` (default Rs 5,000); the band is
unknown; the plan is not for today.

## What it reads and writes

| file | what |
| --- | --- |
| `trader/config.json` | the rules |
| `trader/plan.json` | entry, stop, target, flat_by, session_date, band |
| `trader/portfolio.json` | optional: cash and holdings |
| `trader/prices.json` | optional: ldcp for the band when the plan has none |
| `trader/timemachine.json` | optional: its verdict is repeated for the same symbol |
| `trader/orders.json` | with `--write`: one order: id `SYMBOL-YYYYMMDD-HHMM`, type limit at the entry, qty, stop, target, flat_by, est_cost, max_loss_at_stop, profit_at_target, profit_after_cgt, net_rr, binding, gap_loss_at_lower_limit, skip, warnings |

## Step 3: tell the user

Show the limits table and which one decided it, the shares, the cost, the
loss if the stop fills, the profit at the target before and after CGT (CGT
is information only, never in R), the net reward/risk and every warning.
Say plainly: a stop is a plan, not a promise. A gap or a lower-limit lock can
fill it worse or not at all. Then hand over to psx-trader-risk.

## Rebalance mode (upstream weights mode)

`rebalance --targets FILE` with `{"OGDC": 40, "HUBC": 60}` sizes BUY orders
that move the portfolio toward target weights: the cash buffer comes off the
top, weights are normalised, each stock is capped at `max_position_pct`,
prices come from PSX Market Watch, whole lots, charges included, buys under
`min_order` dropped. Long only: an overweight stock is reported, never sold.
These are plain long-term buys with no stop (`kind: "rebalance"`), not day
trades; psx-trader-risk skips the day-trade checks for them.

## Honest limits

- Charges are estimates of a typical schedule; the broker's contract note is
  the truth. Price bands are estimates (prior close +/- max(10%, Rs 1)).
- Proposals only. It never places, approves or schedules an order, never
  raises a limit and never moves a stop to fit more shares.
- No projections: a target is a plan, not a forecast. Not financial advice.
