/** Short FAQs for guides that do not already ship their own. Visible text and FAQ schema use the same pairs. */
export const guideFaqExtras = {
  'cgt-basics-pakistan-stocks': [
    ['Does PSX Tracker file my capital gains tax?', 'No. It can estimate realized gains from the trades you enter. NCCPL, your broker, and FBR guidance remain the records that matter for tax.'],
    ['What changes the gain on a PSX share sale?', 'Sale price, the cost of the lots you close, fees, and how long you held the shares. Holding-period rules change, so confirm the current schedule before you rely on a number.'],
    ['Why should I keep my own trade history?', 'Broker screens show today’s book. A personal ledger lets you reconstruct which lots a sale closed and reconcile that against official statements.'],
  ],
  'mutual-fund-nav-tracking': [
    ['Can I track mutual funds in the same book as PSX shares?', 'PSX Tracker keeps stock and fund portfolios separate so units, NAV, and share lots are not mixed. You can still review both from the app.'],
    ['Where do fund prices come from?', 'Open-end funds are marked with published NAVs, commonly from MUFAP. A NAV is not a live stock quote and may update on a different schedule.'],
    ['Does a fund tracker replace my asset-management statement?', 'No. Use the statement for units you actually hold. The tracker is a personal record of what you logged.'],
  ],
  'google-drive-backup-restore': [
    ['Where is my portfolio stored?', 'On this device, and in your own Google Drive when you connect backup. PSX Tracker does not keep the portfolio snapshot as the source of truth in its database.'],
    ['What if a save fails?', 'A pending copy can stay on the device. Use Retry when you are ready, or download the unsynced JSON before you restore an older Drive file over it.'],
    ['Does Drive backup include everything?', 'It includes the portfolio snapshot and settings the app saves. Market-data caches and a very large statement scan stay local so the backup does not swell.'],
  ],
  'psx-charts-in-app': [
    ['Are the charts live broker prices?', 'They are research charts built from the market data the app can fetch. Prices can be delayed or missing. Confirm a trade on your broker.'],
    ['Can I open a chart from a holding?', 'Yes. Open a ticker from research or from a holding to see its history, then return to the portfolio for cost and quantity.'],
    ['Do charts tell me what to buy?', 'No. Indicators describe past prices. They are not a recommendation.'],
  ],
  'free-vs-paid-trial': [
    ['Is the trial a charge?', 'The full trial starts after the owner approves access. The homepage states that the trial does not require a card.'],
    ['What happens when the trial ends?', 'You can stay on the Free plan within its limits or move to a Paid plan. Limits are described in the app and on this guide.'],
    ['Does Google Drive require a Paid plan?', 'Connecting Drive is optional and is tied to the Google account you approve. Plan limits still apply to features the Free plan restricts.'],
  ],
  'importing-broker-trades': [
    ['What can I import?', 'Trades by hand, from a spreadsheet, from a Gemini scan of a statement or image, and optionally from a Gmail attachment you choose.'],
    ['Are scanned rows saved immediately?', 'No. Review ticker, side, date, quantity, and price, then add the rows you accept. A scan can misread a figure.'],
    ['Will an import replace my broker statement?', 'No. Reconcile the ledger against the statement after you import, especially around fees and corporate actions.'],
  ],
  'tracking-psx-dividends': [
    ['Should I record a dividend as cash or as new shares?', 'Cash dividends increase cash. A reinvested or bonus issue changes units or shares. Record the one that actually happened.'],
    ['Where does withholding tax go?', 'Record tax withheld separately from the gross dividend so income and cash both stay explainable.'],
    ['Does the tracker know every PSX dividend automatically?', 'Upcoming dividend research can suggest payouts. Your ledger still needs the dividend you actually received.'],
  ],
  'multi-portfolio-stocks-vs-funds': [
    ['Why are stocks and funds in different portfolios?', 'Shares use lot matching and a market price. Funds use units and NAV. Separate books keep those calculations from colliding.'],
    ['Can I look at both together?', 'Yes. A combined view can sit on top of the separate books. The underlying records stay in their own portfolios.'],
    ['What happens to Drive backup with several portfolios?', 'The snapshot saved to your Drive includes the portfolios in the app, not a second hidden book.'],
  ],
  'watchlists-and-alerts': [
    ['Does an alert place an order?', 'No. An alert is a notification when a price condition you set is met. Trades still go through your broker.'],
    ['Why might an alert not fire?', 'The symbol needs a usable price, the condition has to be on the correct side of the live price, and plan or data limits can apply.'],
    ['Is a watchlist the same as a holding?', 'No. A watchlist is a research list. A holding is shares or units you recorded in a portfolio.'],
  ],
  'psx-portfolio-export-reconcile': [
    ['Why export if the app already shows the book?', 'An export lets you compare holdings, cash, and dividends with a broker or CDC statement line by line.'],
    ['What should I check after an import?', 'Quantities, average cost, cash, and dividends, especially after a bonus, split, or a scan that you edited.'],
    ['Which file is authoritative?', 'Your broker, CDC, and fund statements. The tracker is your working copy of what you entered.'],
  ],
  'understanding-unrealized-vs-realized': [
    ['What is unrealized profit?', 'The gain or loss on shares or units you still hold, using today’s price or NAV against your cost. It changes when the price changes.'],
    ['What is realized profit?', 'The gain or loss on a sale you already made, based on the proceeds and the cost of the lots that sale closed.'],
    ['Why can both numbers be on screen together?', 'They answer different questions: what the open book is worth versus what closed trades have already locked in.'],
  ],
  'start-investing-on-psx': [
    ['What do I need before the first buy?', 'A brokerage account, completed KYC, a funded balance, and a record of the trade. PSX Tracker does not open the account or place the order.'],
    ['Where do I place the order?', 'At a licensed broker. Use the tracker afterwards to record the fill, fees, and cash movement.'],
    ['Is this a recommendation to buy shares?', 'No. The guide describes the steps. Whether a security suits you is your own decision.'],
  ],
  'choosing-a-psx-broker': [
    ['What should I compare?', 'Licensing, how you fund and withdraw, the app you will actually use, costs, and whether you can export statements.'],
    ['Are published fee tables permanent?', 'No. Brokers change schedules. Confirm the current schedule with the broker before you treat a figure as exact.'],
    ['Does PSX Tracker replace a broker?', 'No. It keeps the ledger. The broker holds the account and executes trades.'],
  ],
  'psx-with-limited-capital': [
    ['Can I start on PSX with a small amount?', 'Yes, if you can cover the broker’s minimums and fees. A small book is more sensitive to those costs and to owning only one name.'],
    ['What is the main risk of a tiny portfolio?', 'One position can dominate the result. Fees also take a larger share of a small trade.'],
    ['Does a tracker change how much I should invest?', 'No. It only keeps the record of what you decided to buy, sell, and hold.'],
  ],
  'realistic-psx-returns': [
    ['How do PSX investors get a return?', 'From dividends and from a change in price. Both can be negative. Costs and taxes reduce what you keep.'],
    ['Is a past index return a forecast?', 'No. A historical index move is context, not a promise for the next year.'],
    ['Should I plan on a fixed yearly percentage?', 'No. Returns vary. A tracker shows what your own book did, which can differ from the index.'],
  ],
  'is-psx-investing-halal': [
    ['Does this page rule that PSX investing is halal?', 'No. It is an educational overview. Screening lists and a scholar you trust are the right place for a personal ruling.'],
    ['What do investors usually look at?', 'The company’s business, its debt and interest income against published screening rules, and whether a named index such as KMI includes it.'],
    ['Does a tracker decide Shariah status?', 'No. PSX Tracker can show research context. It does not issue a religious ruling.'],
  ],
  'kmi-and-shariah-screening': [
    ['What is a KMI-style screen?', 'A published set of business and financial tests used to build a Shariah equity list. The list and the rules can change.'],
    ['If a stock is on the list, is it halal for me?', 'Not automatically. Use the published methodology and personal scholarly guidance rather than a ticker’s presence alone.'],
    ['Where should I read the rules?', 'From the index publisher’s own methodology, not from a summary in a portfolio app.'],
  ],
  'stock-factors-investors-watch': [
    ['What is a factor in this guide?', 'A measurable trait investors compare, such as profitability, debt, cash generation, or valuation. None of them is a buy signal by itself.'],
    ['Should I rank stocks on one ratio?', 'No. A single ratio ignores the business, the balance sheet, and whether the accounts are comparable.'],
    ['Does PSX Tracker recommend stocks from these factors?', 'No. Research screens are context for your own work.'],
  ],
  'pe-ratio-for-psx-stocks': [
    ['What does a P/E ratio say?', 'It compares the share price with earnings per share. A low or high number only means something next to peers, growth, and earnings quality.'],
    ['Why can two P/E ratios disagree?', 'They may use different earnings periods, share counts, or exclude one-off items. Check which earnings figure the ratio used.'],
    ['Is a low P/E a bargain?', 'Not by itself. Earnings can be temporary, falling, or not comparable with another company.'],
  ],
  'graham-style-margin-of-safety': [
    ['What is a margin of safety?', 'The gap between what you estimate a business is worth and the price you pay. It is a cushion for being wrong, not a guarantee.'],
    ['Can a model give an exact fair value?', 'No. Inputs are estimates. Treat the result as a range you can defend, then compare it with the market price.'],
    ['Is this Benjamin Graham’s method as a checklist to copy?', 'It is a conceptual introduction. It is not a complete investing system and not advice to buy or sell.'],
  ],
  'analyze-cement-stocks-psx': [
    ['What do cement investors usually read first?', 'Dispatches, capacity, costs, margins, and debt, then the valuation next to that operating picture.'],
    ['Does a strong dispatch month mean the stock is cheap?', 'No. Volume is one input. Price, costs, and the balance sheet still decide whether the business is attractive at today’s quote.'],
    ['Is this a list of cement stocks to buy?', 'No. It is a research checklist. Company accounts and PSX filings are the sources to verify.'],
  ],
  'analyze-pakistani-banks-psx': [
    ['Which figures come up for PSX banks?', 'Deposits, net interest margin, non-performing loans, capital adequacy, and price relative to book value. Each one needs the notes in the accounts.'],
    ['Is a low price-to-book automatically cheap?', 'No. A lower multiple can reflect weaker asset quality or returns. Read the credit book before treating book value as cash you could collect.'],
    ['Does the tracker replace a bank’s financial statements?', 'No. Use the published accounts and regulatory filings. The app can help you keep the portfolio record beside that research.'],
  ],
};
