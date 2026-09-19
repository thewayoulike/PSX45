import { TRIAL_DAYS } from './product.js';

const disclaimer =
  'This guide is educational and describes how PSX Tracker works. It is not investment, tax or legal advice. Confirm rules and figures with your broker, FBR guidance and professional advisors.';

/** @typedef {{ title: string, description: string, intro: string, blurb: string, sections: [string, string][], related?: string[] }} GuidePage */

/** @type {Record<string, GuidePage>} */
export const guidePages = {
  'fifo-cost-basis-psx': {
    title: 'FIFO cost basis on the Pakistan Stock Exchange',
    blurb: 'How first-in, first-out matching shapes average cost and realized gains.',
    description: 'Learn how FIFO lot matching works for PSX share sales, why day trades matter, and how PSX Tracker applies it to your holdings.',
    intro: 'When you sell shares, which lots did you sell? Pakistan Stock Exchange investors often use first-in, first-out (FIFO) thinking for cost basis. Here is how that shows up in a portfolio tracker.',
    sections: [
      ['What FIFO means', 'FIFO matches each sale against your oldest remaining buy lots first. That keeps a clear trail from purchases to sells and avoids mixing newer high-cost buys into an earlier sale.'],
      ['Why it changes your numbers', 'Average cost, unrealized gain and realized profit all depend on which lots are closed. Selling older cheap lots can realize more gain than selling recent expensive lots — even at the same sale price.'],
      ['Same-day trades', 'Buys and sells on the same day are often squared off before they distort long-term average cost. PSX Tracker models day-trade squaring so intraday churn does not quietly ruin your basis.'],
      ['Fees in the cost', 'Broker commission, sales tax and CDC charges belong in what you paid per share. Including fees in cost basis keeps break-even and P&L closer to what you actually spent.'],
      ['How PSX Tracker helps', 'Enter buys, sells and fees once. The app applies FIFO lot matching and shows open holdings, realized trades and totals you can export and check against broker statements.'],
      ['Important limits', disclaimer],
    ],
    related: ['cgt-basics-pakistan-stocks', 'understanding-unrealized-vs-realized', 'importing-broker-trades'],
  },
  'cgt-basics-pakistan-stocks': {
    title: 'Capital gains tax basics for Pakistani stocks',
    blurb: 'High-level CGT ideas investors track alongside realized gains.',
    description: 'A plain-language overview of capital gains concepts for PSX share sales, and how portfolio records support your own tax review.',
    intro: 'Capital gains tax (CGT) on listed shares depends on rules that change over time. This page explains the ideas investors usually track — not a filing guide.',
    sections: [
      ['Gain vs cash in your pocket', 'A realized gain is sale proceeds minus the cost of the lots you sold (and related costs). Cash withdrawn from a broker is not the same as taxable gain.'],
      ['Holding period and rates', 'Pakistan has used different treatments for short-term and longer holdings. Always check the current FBR / ordinance rates for the tax year you care about.'],
      ['Why lot matching matters', 'Which buys a sale closes changes the gain. FIFO-style records make it easier to reconstruct what happened when you review statements later.'],
      ['What a tracker can and cannot do', 'PSX Tracker can show realized P&L with fees and CGT-oriented fields as informational tools. It does not file returns or replace a tax advisor.'],
      ['Good habits', 'Keep broker contract notes, export your ledger, and reconcile big sells before year-end. Fix import errors early so lots stay trustworthy.'],
      ['Disclaimer', disclaimer],
    ],
    related: ['fifo-cost-basis-psx', 'understanding-unrealized-vs-realized', 'tracking-psx-dividends'],
  },
  'mutual-fund-nav-tracking': {
    title: 'Tracking mutual fund NAV and daily P&L',
    blurb: 'Units, NAV sync and day-over-day fund performance in one place.',
    description: 'How to track open-end mutual funds in PSX Tracker with units, average cost, NAV updates and daily P&L.',
    intro: 'Mutual funds do not trade like shares on the PSX board, but you still need units, cost and an up-to-date NAV. Here is the workflow inside PSX Tracker.',
    sections: [
      ['Fund portfolios', 'Create or switch to a mutual fund portfolio so fund holdings stay separate from stock positions while still using the same account.'],
      ['Units and average cost', 'Record purchases, redemptions and transfers in units. Average cost and market value follow from units × NAV, similar in spirit to share cost basis.'],
      ['NAV sync', 'PSX Tracker can pull recent fund NAVs from the catalog/sync path so daily P&L reflects day-over-day NAV moves when data is available.'],
      ['Daily P&L for funds', 'Day change uses the latest NAV versus the prior mark. If a fund is missing or stale, refresh sync and check the fund catalog before trusting the move.'],
      ['Disclaimer', disclaimer],
    ],
    related: ['multi-portfolio-stocks-vs-funds', 'tracking-psx-dividends', 'free-vs-paid-trial'],
  },
  'google-drive-backup-restore': {
    title: 'Google Drive backup and restore',
    blurb: 'Keep portfolio snapshots in your Drive and recover when sync fails.',
    description: 'How PSX Tracker syncs portfolio data to Google Drive, what pending changes mean, and how to restore safely.',
    intro: 'Connecting Google Drive lets your portfolio follow you across devices. Knowing retry, download and restore options prevents panic when a save fails.',
    sections: [
      ['What gets saved', 'Drive sync stores a portfolio snapshot and settings in files your Google account owns. Sheets export is a derived transaction sheet, not the only backup.'],
      ['Pending local changes', 'If a save fails, PSX Tracker keeps a pending local copy. The sidebar sync footer shows status, a short error, Retry and Restore.'],
      ['Retry vs Restore', 'Retry sends your pending local snapshot again. Restore keeps a recovery copy of unsynced changes, then reloads the cloud version — confirm before you do it.'],
      ['Keep pending / download', 'Download my changes (Keep pending) saves the unsynced JSON so you still have a file if you choose to load cloud data.'],
      ['Disclaimer', disclaimer],
    ],
    related: ['free-vs-paid-trial', 'importing-broker-trades'],
  },
  'psx-charts-in-app': {
    title: 'Using PSX charts in the app',
    blurb: 'Candlesticks, indicators and portfolio context on research charts.',
    description: 'Get started with PSX Tracker charts: ranges, indicators and how holdings context appears while you research.',
    intro: 'Charts are for research. They do not place orders. Here is how to use them productively inside PSX Tracker.',
    sections: [
      ['Open a chart', 'From Charts explorer or a stock profile, pick a ticker and timeframe. Candlesticks and volume help you see structure, not tips.'],
      ['Indicators and drawings', 'Moving averages, RSI, Bollinger and drawing tools are available depending on your plan limits. Use them as framing, not as automated advice.'],
      ['Portfolio on the chart', 'When you hold a name, open and realized context can appear so research stays tied to your own lots — still verify prices against the exchange.'],
      ['Data delays', 'Quotes and bars can be delayed or incomplete. Refresh when something looks stale, and treat gaps as data issues, not signals.'],
      ['Disclaimer', disclaimer],
    ],
    related: ['watchlists-and-alerts', 'fifo-cost-basis-psx', 'free-vs-paid-trial'],
  },
  'free-vs-paid-trial': {
    title: `Free vs Paid after your ${TRIAL_DAYS}-day trial`,
    blurb: 'What the trial unlocks and how Free and Paid differ.',
    description: `Understand the ${TRIAL_DAYS}-day full trial, Free plan limits and Paid access for PSX Tracker.`,
    intro: `New approved accounts get a ${TRIAL_DAYS}-day full trial. After that you can stay on Free with limits or unlock Paid features.`,
    sections: [
      ['Trial', `During the trial you can explore the full toolset. No card is required to start. Approval from the owner may be required before the trial begins.`],
      ['Free forever option', 'When the trial ends, Free access continues within published limits (for example alerts, scans or tool quotas shown on the homepage).'],
      ['Paid access', 'Paid removes key limits and is activated after you confirm payment with support using the methods listed on the site.'],
      ['Drive is separate', 'Google Drive sync is a permission you grant for backups. Plan tier and Drive connection are related to features, but Drive files stay in your Google account.'],
      ['Disclaimer', disclaimer],
    ],
    related: ['google-drive-backup-restore', 'psx-charts-in-app'],
  },
  'importing-broker-trades': {
    title: 'Importing broker trades into PSX Tracker',
    blurb: 'CSV, Excel, screenshots and optional Gmail attachments.',
    description: 'Ways to import PSX trades into PSX Tracker: manual entry, spreadsheets, OCR and optional Gmail import.',
    intro: 'Accurate imports keep FIFO lots clean. Prefer structured files when you can; review every AI or OCR suggestion before saving.',
    sections: [
      ['Manual and spreadsheet', 'Add trades by hand or upload CSV/Excel mapped to buy, sell, dividend and cash events. Fix ticker symbols and dates before confirming.'],
      ['Screenshots and OCR', 'Optional OCR can read a statement image. Always check quantities, prices and fees — optical reads miss rows and misread digits.'],
      ['Gmail attachments', 'Gmail read access is requested only when you choose that import path. Search, pick one attachment, and review the parse before it hits your ledger.'],
      ['After import', 'Scan for duplicates, confirm broker names, then run a quick holdings check against your broker app. Export a backup once the ledger looks right.'],
      ['Disclaimer', disclaimer],
    ],
    related: ['fifo-cost-basis-psx', 'psx-portfolio-export-reconcile', 'google-drive-backup-restore'],
  },
  'tracking-psx-dividends': {
    title: 'Tracking PSX dividends and cash income',
    blurb: 'Record dividends, tax withheld and how income shows in totals.',
    description: 'How to log PSX share and fund dividends in PSX Tracker, including cash vs reinvested payouts and income totals.',
    intro: 'Dividends are income, not the same as selling shares. Recording them cleanly keeps Total Return and cash movements honest.',
    sections: [
      ['Dividend events', 'Add a dividend (or fund payout) with the ex/payment date, gross or net amount, and any withholding you want to track. Tie it to the ticker you hold.'],
      ['Cash vs reinvested', 'Cash dividends increase available cash. Reinvested dividends buy more units or shares — the income still counts, but cash may not stay in the account.'],
      ['Tax withheld', 'If your broker deducts tax at source, record it so net income and informational CGT-style totals stay closer to your statement.'],
      ['Where it shows up', 'Portfolio totals include dividend income separately from unrealized and realized share gains. Check history and summary cards after each payout season.'],
      ['Important limits', disclaimer],
    ],
    related: ['understanding-unrealized-vs-realized', 'cgt-basics-pakistan-stocks', 'mutual-fund-nav-tracking'],
  },
  'multi-portfolio-stocks-vs-funds': {
    title: 'Stock vs mutual fund portfolios',
    blurb: 'Keep share and fund books separate without losing one login.',
    description: 'Why PSX Tracker uses separate portfolios for stocks and mutual funds, and how to switch between them.',
    intro: 'Shares and open-end funds use different units and price sources. Separate portfolios keep NAV tracking and FIFO lots from colliding.',
    sections: [
      ['Why separate books', 'Stock lots use share quantities and exchange prices. Funds use units and NAV. Mixing them in one ledger makes average cost and daily P&L harder to trust.'],
      ['Create or switch', 'Use the portfolio switcher to open a stock book or a mutual fund book under the same account. Each has its own holdings and history.'],
      ['What syncs', 'Drive backup can cover the portfolios you use. After switching devices, confirm you opened the same portfolio name before editing trades.'],
      ['Practical tip', 'Name portfolios clearly (for example “PSX shares” and “Open-end funds”) so imports and restores land in the right book.'],
      ['Disclaimer', disclaimer],
    ],
    related: ['mutual-fund-nav-tracking', 'google-drive-backup-restore', 'importing-broker-trades'],
  },
  'watchlists-and-alerts': {
    title: 'Watchlists and price alerts',
    blurb: 'Follow tickers you do not hold and get notified on moves.',
    description: 'How watchlists and alerts work in PSX Tracker for PSX symbols you want to follow without owning them yet.',
    intro: 'A watchlist is for research candidates. Alerts nudge you when a price level hits — they do not place orders.',
    sections: [
      ['Build a watchlist', 'Add tickers from search or a stock profile. Watchlist symbols can refresh with market data even when you do not hold them.'],
      ['Open charts from the list', 'Jump into charts or a profile from a watched name to review structure before you decide to buy.'],
      ['Set an alert', 'Create a price alert for a level you care about. Delivery depends on your plan limits and notification setup on the device or browser.'],
      ['Limits and delays', 'Quotes can be delayed. Alerts are helpers, not guaranteed fills or investment advice. Free and Paid plans may cap how many alerts you keep.'],
      ['Disclaimer', disclaimer],
    ],
    related: ['psx-charts-in-app', 'free-vs-paid-trial'],
  },
  'psx-portfolio-export-reconcile': {
    title: 'Export and reconcile your PSX portfolio',
    blurb: 'Download records and check them against your broker.',
    description: 'How to export PSX Tracker data and reconcile holdings, trades and cash with your broker statement.',
    intro: 'A tracker is only useful if it matches reality. Export regularly and reconcile after big imports or corporate actions.',
    sections: [
      ['What to export', 'Use in-app export or Sheets-related flows when available so you have a dated copy of transactions and holdings outside the browser.'],
      ['Reconcile holdings', 'Compare quantity and average cost per ticker with your broker app. Investigate mismatches before the next sell so FIFO lots stay clean.'],
      ['Reconcile cash and income', 'Check deposits, withdrawals and dividends against bank or CDC/broker cash reports for the same dates.'],
      ['After a fix', 'Correct the ledger, export again, and optionally confirm Drive sync so every device sees the cleaned book.'],
      ['Disclaimer', disclaimer],
    ],
    related: ['importing-broker-trades', 'google-drive-backup-restore', 'tracking-psx-dividends'],
  },
  'understanding-unrealized-vs-realized': {
    title: 'Unrealized vs realized P&L explained',
    blurb: 'Paper gains on open lots versus locked-in results after sells.',
    description: 'The difference between unrealized and realized profit and loss for PSX portfolios, and how PSX Tracker shows both.',
    intro: 'Unrealized P&L moves with the market on shares you still hold. Realized P&L locks in when you sell. Confusing the two leads to bad decisions.',
    sections: [
      ['Unrealized (open positions)', 'Market value minus cost of lots you still hold. It changes every day with prices and is not cash until you sell.'],
      ['Realized (closed trades)', 'Profit or loss from sells after cost basis and fees. It stays in history even if you later buy the name again.'],
      ['Why both matter', 'Total return mixes open marks, closed trades and income. Looking only at today’s green unrealized number can hide weak realized results — or the reverse.'],
      ['How the app helps', 'PSX Tracker shows holdings P&L for open lots and a realized view for closed trades so you can review each lens separately.'],
      ['Important limits', disclaimer],
    ],
    related: ['fifo-cost-basis-psx', 'cgt-basics-pakistan-stocks', 'tracking-psx-dividends'],
  },
};

export const guideHub = {
  title: 'PSX Tracker guides',
  eyebrow: 'Learn the investing workflow',
  description: 'Practical guides on FIFO, CGT, dividends, unrealized vs realized P&L, mutual funds, portfolios, Drive backup, charts, watchlists, plans and trade imports for PSX Tracker.',
  intro: 'Short, practical explainers for Pakistan Stock Exchange investors who use PSX Tracker. Start free when you are ready to track your own portfolio.',
};
