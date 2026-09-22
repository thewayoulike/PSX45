/**
 * Guides hub clusters (IA only — slugs must exist in guidePages).
 * @typedef {{ href: string, title: string, blurb: string, featured?: boolean }} HubStartCard
 * @typedef {{ slug: string, blurb?: string, featured?: boolean }} HubCard
 * @typedef {{ id: string, heading: string, intro?: string, cards: HubCard[] }} HubCluster
 */

/** Primary = video walkthrough; secondary = illustrated feature encyclopedia (not a second “start”). */
/** @type {HubStartCard[]} */
export const guideHubStartHere = [
  {
    href: '/how-to-use',
    title: 'How to use PSX Tracker (start here)',
    blurb:
      'Primary walkthrough: 6-minute video plus captions — create a portfolio, set up a broker, record your first trades.',
    featured: true,
  },
  {
    href: '/how-it-works',
    title: 'Feature guide with screenshots',
    blurb:
      'Deeper reference after the video: every major screen explained with stills — import, Drive, charts, research, plans.',
  },
];

/** Jump links for long hub scrolls. */
export const guideHubToc = [
  { id: 'start-here', label: 'Start here' },
  { id: 'use-the-app', label: 'Use the app' },
  { id: 'learn-psx', label: 'Learn / pick a tracker' },
];

/** @type {HubCluster[]} */
export const guideHubClusters = [
  {
    id: 'use-the-app',
    heading: 'Use the app',
    intro: 'Shorter how-tos once you are tracking: get data in, understand P&L, research, then backup and plans.',
    cards: [
      { slug: 'importing-broker-trades', blurb: 'Bring CSV, Excel, screenshots, or optional Gmail attachments into a clean trade history.' },
      { slug: 'mutual-fund-nav-tracking', blurb: 'Units, NAV sync, and day-over-day fund performance beside your share book.' },
      { slug: 'understanding-unrealized-vs-realized', blurb: 'Paper gains on open lots versus locked-in results after sells.' },
      { slug: 'psx-portfolio-export-reconcile', blurb: 'Download records and check them against your broker or CDC statement.' },
      { slug: 'psx-charts-in-app', blurb: 'Candlesticks, indicators, and portfolio context on research charts.' },
      { slug: 'watchlists-and-alerts', blurb: 'Follow tickers you do not hold and get notified on moves.' },
      { slug: 'google-drive-backup-restore', blurb: 'Keep portfolio snapshots in Drive and recover when sync fails.' },
      { slug: 'free-vs-paid-trial', blurb: 'What the trial unlocks and how Free and Paid differ.' },
    ],
  },
  {
    id: 'learn-psx',
    heading: 'Learn PSX investing / pick a tracker',
    intro: 'Leave spreadsheets, understand FIFO and dividends, then broader PSX education — without crowning a universal #1 app.',
    cards: [
      { slug: 'best-psx-portfolio-tracker-excel-alternative', blurb: 'Leave fragile spreadsheets with a clear checklist: FIFO, dividends, mutual funds, and honest app options.', featured: true },
      { slug: 'fifo-cost-basis-psx', blurb: 'How first-in, first-out matching shapes cost basis and realized gains (education — not a tax filing).', featured: true },
      { slug: 'tracking-psx-dividends', blurb: 'Record gross dividends, tax withheld, and how income shows in totals.', featured: true },
      { slug: 'multi-portfolio-stocks-vs-funds', blurb: 'Keep share and fund books clear in one login without mixing the story.', featured: true },
      { slug: 'cgt-basics-pakistan-stocks', blurb: 'High-level CGT ideas investors track alongside realized gains — NCCPL/broker records stay authoritative.' },
      { slug: 'start-investing-on-psx', blurb: 'Broker, KYC, funding, first buy — then keep a clean portfolio record.' },
      { slug: 'choosing-a-psx-broker', blurb: 'Practical checklist for apps, fees, funding, and statements.' },
      { slug: 'psx-with-limited-capital', blurb: 'Small accounts, real costs, and habits that compound.' },
      { slug: 'realistic-psx-returns', blurb: 'Dividends, capital gains, risk, and why averages are not promises.' },
      { slug: 'is-psx-investing-halal', blurb: 'How Muslim investors think about screening — not a fatwa.' },
      { slug: 'kmi-and-shariah-screening', blurb: 'What index-style Islamic screens try to do.' },
      { slug: 'stock-factors-investors-watch', blurb: 'Research checklist for quality, risk, and valuation context.' },
      { slug: 'pe-ratio-for-psx-stocks', blurb: 'What price-to-earnings means — and when it misleads.' },
      { slug: 'graham-style-margin-of-safety', blurb: 'Why careful investors want room for error on price.' },
      { slug: 'analyze-cement-stocks-psx', blurb: 'Volumes, energy costs, leverage, and peer valuation.' },
      { slug: 'analyze-pakistani-banks-psx', blurb: 'Deposits, NIM, asset quality, capital, and valuation.' },
    ],
  },
];

export const guideHub = {
  title: 'PSX Tracker guides',
  pageTitle: 'PSX Tracker guides — use the app & learn PSX investing',
  eyebrow: 'Learn the investing workflow',
  description:
    'How-tos for PSX Tracker, plus guides on leaving Excel, FIFO, dividends, mutual funds, and starting on the Pakistan Stock Exchange. Educational only — not investment or tax advice.',
  intro:
    'Practical guides for Pakistan Stock Exchange investors — how to use PSX Tracker day to day, and how to learn PSX investing or choose a tracker when you outgrow spreadsheets. Educational only: not investment, tax, or religious advice. Start with the deep product walkthrough, or jump to leaving Excel, FIFO, dividends, and stocks-plus-funds if you are still deciding how to keep your ledger.',
};
