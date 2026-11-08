# PSX Day Trader skills

11 Claude skills for day trading on the **Pakistan Stock Exchange**: scan PSX
charts for setups, track news and insider trades, time every entry and exit,
size every order to PSX charges, and replay the outcome before you risk a rupee.

Adapted for PSX from [day-trader-skill](https://github.com/Jakeschincariol/day-trader-skill)
by Jake Schincariol (MIT). The method is the same; the market, the data, the
clock, the rules and the charges are Pakistan's.

**Nothing here places an order.** Pakistani brokers have no public order
connection, so the last step writes a ticket you enter in your broker's app
yourself, after you have said yes.

## Install

In Claude Code, from this folder:

```bash
cp -r psx-trader-* ~/.claude/skills/
```

Copy **all** the `psx-trader-*` folders, including `psx-trader-common` (the
shared PSX library every skill uses). Or copy them into a project's
`.claude/skills/`. Then:

```bash
mkdir -p trader && cp config.example.json trader/config.json
```

and edit `trader/config.json`: your capital, the most you will lose on one
trade, your broker's commission, your CGT rate.

The tools are plain Python 3.8+ with nothing to install.

## Where the data comes from

PSX does not serve scripts directly, so every tool reads PSX data through your
**PSX Tracker** server (`"server"` in the config, default
`https://www.psx-tracker.com`), the same way the app does:

| data | what you get |
| --- | --- |
| Market Watch | every listed symbol: price, previous close, high, low, volume, sector, indices |
| Daily candles | years of daily open / high / low / close / volume per stock |
| Intraday trades | every trade of the **latest session only** (PSX publishes no older intraday data) |
| Company page | announcements, annual and quarterly results, ratios, payouts |
| News feed | Pakistani business headlines (Business Recorder and others) |
| Insider feed | director, executive and substantial-shareholder trades (who, buy or sell, shares, price) |

The server allows 120 requests a minute. Scans of the whole market take a
while: the scanner paces itself and lets you limit how many stocks it checks.

Because PSX keeps only the latest session's trades, the **Time Machine records
each day's 5-minute candles** (`timemachine.py record`) to build its history.
Run it after every close for the stocks you trade. Until about 20 sessions are
saved, its replays are weak and it says so.

## The eleven

| command | job | what it does |
| --- | --- | --- |
| `/psx-trader-scanner` | Chart Scanner | Scans the PSX market for setups: 15-minute opening-range breakouts, 20-day breakouts, bull flags, oversold bounces. |
| `/psx-trader-news` | News Monitor | Pakistani headlines and PSX announcements for the stocks you watch, tagged by catalyst. |
| `/psx-trader-entry` | Entry Timer | Watches a setup candle by candle and tells you the moment to get in. |
| `/psx-trader-exit` | Exit Planner | Sets your stop and target before you enter, inside PSX's daily price limits. |
| `/psx-trader-timemachine` | Time Machine | Replays the rest of the session 10,000 times from the stock's own recorded candles, plus every past day the setup fired. |
| `/psx-trader-budget` | Budget Manager | Sizes the order to your budget and maximum loss, after PSX charges. |
| `/psx-trader-risk` | Risk Manager | Checks every order against your limits and blocks anything over them. |
| `/psx-trader-broker` | Order Ticket | Shows the order in plain words to enter in your broker's app, and logs what you did. |
| `/psx-trader-alerts` | Price Alerts | PSX clock, quotes, and alerts on your stop, target and flat-by time. |
| `/psx-trader-analyst` | Results Analyst | Reads the company's annual and quarterly results and sums up what changed. |
| `/psx-trader-insiders` | Insider Tracker | Director and shareholder buys and sells filed with PSX; spots several insiders buying together. |

## How a trade flows

Everything lands in a `trader/` folder, and each skill reads what the last one
wrote (see [CONTRACTS.md](CONTRACTS.md)):

```
scanner -> news -> entry -> exit -> timemachine -> budget -> risk -> broker   (one trade)
alerts: stop, target, flat by the close                                       (while it is open)
news / analyst / insiders                                                      (any time)
timemachine record                                                             (after every close)
```

## PSX rules built in

- **Hours (Pakistan time):** Monday to Thursday 09:32-15:30; Friday 09:17-12:00
  and 14:32-16:30 (two separate sessions). Weekends and the fixed national
  holidays are closed. Eid and other moon-dated holidays and special hours are
  announced by PSX shortly before: add them to `extra_holidays`.
- **Opening range:** the first three complete 5-minute candles of a session
  (09:35-09:50 Monday to Thursday, 09:20-09:35 Friday morning, 14:35-14:50
  Friday afternoon).
- **Daily price limits:** previous close plus or minus the larger of 10% or
  Rs. 1 (PSX Regulations 19.3). The tools treat this as an estimate: special
  bands, corporate actions and new listings differ. At a locked limit an order
  may not fill at all.
- **Charges, each side:** broker commission (Rs. 0.03 a share at Rs. 5 or less,
  Rs. 0.05 below Rs. 10, otherwise the larger of Rs. 0.05 or your rate), 15%
  sales tax on commission, Rs. 0.005 a share CDC fee, and PSX, SECP and NCCPL
  fees. Your broker's schedule may differ: set `fee_pct`.
- **CGT:** shown as information on profit (default 15%, set `cgt_pct` for your
  filer status). Not included in R.
- **Long only.** No short selling, margin or futures.

## Fine print

**Not financial advice.** This is software that reads public data and does
arithmetic. It does not know your situation and cannot see the future. Most
people who day trade lose money. Decide for yourself, and talk to a licensed
adviser if you need advice.

**The Time Machine is a simulation, not a prediction.** It is built from the
stock's own recent candles. Results, news, a market halt or a locked limit can
do what those days never did.

**A stop is a plan, not a guarantee.** In a fast market, a gap or a locked
lower limit, a stop can fill far below its price or not at all.

**The data is unofficial.** It comes from PSX's public pages through your PSX
Tracker server and can lag or be missing. Check anything that matters in your
broker's terminal before you act.

**Insider trades are public disclosures,** filed by directors, executives and
large shareholders after they trade. Following them is not inside information
and does not mean the price will move.

## Tests

```bash
python3 -m unittest discover -s tests -v
```

The tests run offline on real PSX data saved from Friday 6 November 2026:
OGDC and HUBC daily candles and trades, the Market Watch table, OGDC's company
page, and the news and insider feeds.

## Files

```
psx-trader-common/      psx.py: PSX data, clock, rules, charges (shared)
psx-trader-scanner/     SKILL.md, scan.py
psx-trader-news/        SKILL.md, news.py
psx-trader-entry/       SKILL.md, entry.py
psx-trader-exit/        SKILL.md, exit.py
psx-trader-timemachine/ SKILL.md, timemachine.py
psx-trader-budget/      SKILL.md, size.py
psx-trader-risk/        SKILL.md, check.py
psx-trader-broker/      SKILL.md, ticket.py
psx-trader-alerts/      SKILL.md, alerts.py
psx-trader-analyst/     SKILL.md, facts.py
psx-trader-insiders/    SKILL.md, insiders.py
config.example.json     copy to trader/config.json
CONTRACTS.md            the trader/ files each skill reads and writes
tests/                  unittest suite + saved PSX data
```

MIT. See [LICENSE](LICENSE) and [LICENSE.upstream](LICENSE.upstream).
