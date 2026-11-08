---
name: psx-trader-insiders
description: >-
  PSX Insider Tracker, the Pakistan version of "follow the disclosures".
  Directors, CEOs, executives, their spouses and substantial shareholders of
  PSX-listed companies must publicly disclose when they buy or sell the
  company's shares. This reads those public disclosures: the latest filings
  (who, role, buy or sell, shares, price, rupee value, link), every filing for
  one company with totals bought, sold, net and distinct people, and cluster
  buying where two or more different insiders bought in the same window. Use
  when the user says "who's buying HUBC", "insider buying PSX", "insider
  trades", "director buying", "are directors selling DGKC", "which companies
  have insiders buying", "cluster buying", "substantial shareholder bought",
  "follow the insiders", "disclosure of interest", or "the Pelosi skill for PSX".
argument-hint: "latest|symbol SYMBOL|cluster [--days 30]"
---

# psx-trader-insiders

The US original tracked Congress members' trade reports. Pakistan has no such
filings, but it has something closer to the company: **PSX disclosures of
interest** filed when a director, executive or substantial shareholder trades
the company's shares. This skill reads them quickly. It is fast, not early:
a disclosure is filed days after the trade.

These are **public disclosures, not inside information.** Say that every time.

Commands (run from the pack folder):

```bash
python3 psx-trader-insiders/insiders.py latest --days 30
python3 psx-trader-insiders/insiders.py latest --days 7 --action Buy --min-value 1000000
python3 psx-trader-insiders/insiders.py latest --symbol DGKC
python3 psx-trader-insiders/insiders.py symbol DGKC                 # all filings in the feed
python3 psx-trader-insiders/insiders.py symbol DGKC --days 90
python3 psx-trader-insiders/insiders.py cluster --days 30            # 2+ different insiders bought
python3 psx-trader-insiders/insiders.py --write cluster --days 30   # -> trader/insiders.json
```

`--now "2026-11-06 17:00"` pins the clock (Pakistan time).

## What it reads and writes

| source / file | what |
| --- | --- |
| PSX Tracker insiders feed | records `{symbol, company, date, person, role, action, shares, price, value, sourceUrl}` plus coverage: companies checked, failed, how far back |
| `trader/insiders.json` | written with `--write`: `as_of`, `coverage`, the query, and `records` / `totals` / `people` / `clusters` |

## How it counts

- `action` is normalised: Buy and Sell (any capitalisation) are trades. Gifts,
  bonus and right shares, inheritance, mergers, ESOS and conversions are
  "other": they are listed but never counted as buying or selling.
- Value is the rupee value in the filing (shares x price as disclosed).
- People are matched by name with titles (Mr, Dr, Syed) and punctuation
  ignored; a different spelling counts as a different person.
- A **cluster** is a company where at least `--min-people` (default 2)
  different people filed a Buy within `--days`. One director buying twice is
  not a cluster. Sells in the same window are shown next to it.

## Steps

1. "Who's buying X?" -> `symbol X`. Report the filings, total bought and sold,
   the net, and who (with role). Link the filing (`sourceUrl`).
2. "Any insider buying?" -> `latest --action Buy --days 7` (add
   `--min-value 1000000` to skip small filings). Mention the biggest by value.
3. "Follow the insiders" -> `cluster --days 30`. List the companies with how
   many insiders bought, the rupee total and the dates.
4. Always finish with the coverage line the tool prints: the feed's history is
   partial and some companies could not be read.
5. Before any trade idea comes from this, run the normal chain
   (`/psx-trader-news`, `/psx-trader-analyst`, scanner, risk).

## Reading it honestly

- Insiders buy for many reasons (meeting a holding requirement, a group
  company moving shares, using cash) and sell for more (tax, family, loans).
  A filing says what was done, not why.
- Substantial shareholders are often companies or group holding firms;
  transfers between group companies show up as a sell and a buy.
- The disclosure comes days after the trade; the price may already have moved.

## Honest limits

- Unofficial data: collected from public announcements by the PSX Tracker feed
  and read through the user's server. Coverage is partial (latest few records
  per company plus what earlier daily updates kept) and some companies fail;
  "none found" does not mean none were filed. Check the PSX company page.
- Numbers are as disclosed; filings can be corrected or revoked later.
- Not inside information and not advice. Never present a filing as a reason a
  price will rise or fall.
