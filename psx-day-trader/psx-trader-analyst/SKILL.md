---
name: psx-trader-analyst
description: >-
  PSX Earnings Analyst. Reads a Pakistan Stock Exchange company's reported
  numbers from its PSX company page (Annual and Quarterly tables: Sales or
  Total Income, Profit after Taxation, EPS; the Ratios table; the Payouts
  dividend history) with the real years and fiscal quarters PSX shows, and
  says what changed: each year against the year before, each quarter against
  the same quarter a year earlier and the quarter just before. Amounts in Rs
  thousands, EPS in Rs. No percentage from a loss or zero base, no verdicts.
  Use when the user says "how were OGDC's results", "OGDC earnings", "is
  profit growing", "what was EPS last quarter", "compare with last year",
  "check the financials", "show me the ratios", "dividend history", "did
  results come out", or before trading a stock around its results.
argument-hint: "[SYMBOL[,SYMBOL]] [--write]"
---

# psx-trader-analyst

Results move PSX stocks more than anything else on the calendar. This skill
lines up the numbers PSX publishes for a company and says plainly what
changed. For a day trader it answers two questions before a trade: what did
the last results say, and could the next results or board meeting land inside
this trade?

Commands (run from the pack folder):

```bash
python3 psx-trader-analyst/facts.py OGDC
python3 psx-trader-analyst/facts.py OGDC,PPL --write          # -> trader/analyst/OGDC.json, PPL.json
python3 psx-trader-analyst/facts.py OGDC --json
```

## What it reads and writes

| source / file | what |
| --- | --- |
| PSX company page `dps.psx.com.pk/company/SYMBOL` | Financials (Annual, Quarterly), Ratios, Payouts, Financial Results announcements, fiscal year end, sector |
| `trader/analyst/SYMBOL.json` | written with `--write`: `units`, `fiscal_year_end`, `annual`/`quarterly`/`ratios` as `{periods, rows: {label: [values]}}`, `payouts`, `changes` `[{metric, kind, from, to, previous, current, change, change_pct, note}]`, `results_announcements`, `notes` |

## Rules it follows

- **Real period labels only.** Columns keep the labels PSX shows: years
  ("2026") and fiscal quarters ("Q1 2027"). A table whose headers are not real
  years or quarters is not used.
- **Like periods only.** Annual: a year against the year before. Quarterly:
  the same quarter a year earlier (Q1 2027 vs Q1 2026) and the quarter just
  before (Q3 2026 vs Q2 2026). PSX shows no Q4 (it is inside the annual
  figure), so Q1 is never compared with Q3, and quarters are never mixed with
  years.
- **No % from a non-positive base.** From a loss or zero the change is given in
  rupees with a note ("turned from a loss to a profit").
- **Units.** Amounts are Rs thousands (PSX states "All numbers in thousands
  (000's) except EPS"); EPS is Rs per share. If the page does not say
  thousands, units are reported as unknown.
- **Quarter labels are fiscal.** OGDC's year ends in June, so "Q1 2027" is
  July-September 2026. Say this when you quote a quarter.
- **No verdicts.** Never call results "good", "bad", "beat" or "miss" (there
  are no published consensus estimates here). Describe the change.

## Steps

1. Run `facts.py SYMBOL`. Read the "What changed" lines and turn them into two
   or three plain sentences: latest year and latest quarter, sales and profit
   and EPS, up or down by how much.
2. Mention the fiscal year end and that quarters are fiscal quarters.
3. Give the link to the latest results filing (printed at the end) so the user
   can check the source.
4. If a results announcement or board meeting is due soon, say that the price
   can gap on it; `/psx-trader-news SYMBOL --announcements` lists recent ones.
5. `--write` when the user wants the file kept.

## Example

```
EPS 2026 vs 2025: Rs. 56.35 vs Rs. 39.50 (+42.7%).
Profit after tax Q1 2027 vs Q1 2026: Rs. 58,513,345k vs Rs. 38,304,846k (+52.8%).
```

Say: "OGDC's EPS for the year to June 2026 was Rs 56.35, up 42.7% from Rs
39.50. Profit in the first quarter of fiscal 2027 (July-September 2026) was
Rs 58.5 billion, up 52.8% on the same quarter a year earlier."

## Honest limits

- Figures are PSX / Capital Stake standardized data, read through the user's
  PSX Tracker server. They can differ from the company's own report; the
  filing is the source of truth.
- PSX shows only the latest four years and four quarters. Some companies
  (banks, insurers, funds) show different rows, e.g. Total Income instead of
  Sales; the tool keeps whatever rows PSX shows.
- Quarterly figures are as PSX shows them; check the filing if a quarter looks
  cumulative.
- Payouts are listed only when PSX shows them on the company page.
- No forecasts, targets or valuations.

Education and tooling, not financial advice.
