---
name: psx-trader-news
description: >-
  PSX News Monitor. Finds recent headlines about Pakistan Stock Exchange
  companies by whole-word matching of the symbol and the company's name and
  common short forms (OGDC, OGDCL, Oil & Gas Development; HUBC, HUBCO, Hub
  Power), tags likely catalysts (results, dividend/payout, board meeting,
  rights/bonus, merger, IMF/SBP/policy rate, circular debt, oil and gas prices,
  rating, court/default), lists market-wide headlines (KSE-100, PSX, SBP, IMF,
  rupee, inflation, budget) and each company's latest PSX announcements, in
  Pakistan time with the publisher named. Use when the user says "any news on
  OGDC", "what's the news on HUBC", "news on my stocks", "why is OGDC down",
  "what's happening in the market", "KSE-100 news", "SBP news", "IMF news",
  "morning briefing", "any announcements from PPL", "did OGDC announce results",
  "board meeting", "dividend announcement", or after /psx-trader-scanner finds setups.
argument-hint: "[--tickers OGDC,HUBC] [--hours 24] [--market] [--announcements]"
---

# psx-trader-news

A chart can look perfect a day before results, a dividend or a court order.
Before a setup becomes a trade, check what has been published about the
company and the market. This skill lists it; it does not decide what it means.

Commands (run from the pack folder):

```bash
python3 psx-trader-news/news.py --tickers OGDC,HUBC --hours 24
python3 psx-trader-news/news.py --tickers OGDC --announcements --write
python3 psx-trader-news/news.py --market --hours 12
python3 psx-trader-news/news.py --tickers OGDC --market --announcements --hours 48 --write
python3 psx-trader-news/news.py                                  # symbols from scan.json, plan.json, portfolio.json
```

`--now "2026-11-06 17:00"` pins the clock (Pakistan time); headlines after it are ignored.

## What it reads and writes

| source / file | what |
| --- | --- |
| PSX Tracker news feed | publisher RSS (Business Recorder, Dawn, The Express Tribune and others), about 7 days |
| PSX Market Watch | each symbol's company name, today's price and change |
| PSX company page | announcements: Financial Results, Board Meetings, Others (date, title, PDF link) |
| `trader/scan.json`, `plan.json`, `portfolio.json` | symbols when `--tickers` is not given |
| `trader/config.json` | `news_aliases`: extra names, e.g. `{"OGDC": ["Ogdcl"]}` |
| `trader/news.json` | written with `--write`: per symbol the terms searched, headlines (title, url, source, published PKT, tags, matched term), announcements; `market` headlines; feed warnings |

## How matching works

- The symbol matches only in capitals as a whole word: `POL` matches
  "POL announces..." but not "policy"; `OGDC` does not match "OGDCs".
- The company name comes from Market Watch with "Limited", "Company" and
  similar endings removed ("Oil & Gas Development"), plus an "and" spelling.
  One-word names ("Systems") are skipped because they match too much.
- A small built-in alias map adds press short forms (OGDCL, HUBCO, Hub Power,
  Pakistan Petroleum, Sui Northern, K-Electric, Engro Fertilizers...). Add more
  with `news_aliases` in `trader/config.json`.
- Tags are keyword hits in the title, a reading aid only.
- `--market` keeps Pakistan market headlines and drops foreign-market stories
  (Indian rupee, Fed, Nikkei) unless they mention Pakistan, PSX, KSE or SBP.

## Steps

1. Run `news.py` with the user's symbols (or none, to use the scan, plan and
   portfolio). Add `--announcements` before a trade: results and board-meeting
   notices on the PSX company page matter more than press stories.
2. Report per symbol: the headlines newest first with time, publisher and
   link; any announcement in the last few days (results, dividend, board
   meeting, rights/bonus). Say "no matching headlines" plainly when none.
3. If a results or board-meeting date falls inside the planned trade, say so:
   the price can gap. Suggest `/psx-trader-analyst SYMBOL` for the numbers.
4. For "what's happening in the market", use `--market` and summarise the
   headlines in a few lines, quoting titles, not inventing details.
5. `--write` when another skill or the user wants `trader/news.json`.

## Honest limits

- **Headline matching is not causation.** Never say a stock moved because of a
  headline. Say "this was published at 14:37; the stock is down 1.06% today".
- Titles only, not article text. A match can be about something else
  (a person or place with the same name), and stories that use a name we do not
  know are missed. Coverage is the publishers in the feed, not all news.
- The feed is unofficial, through the user's PSX Tracker server, and can be
  late, partial or stale; the tool prints the feed's own warnings.
- PSX announcement pages list only the latest few items per tab.
- Never trade on a headline alone, and never claim inside knowledge.

Education and tooling, not financial advice.
