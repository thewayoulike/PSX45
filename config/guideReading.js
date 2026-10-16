// Authored reading paths sit beside the subject they explain.
const link = (href, label, note) => ({ href, label, ...(note ? { note } : {}) });
const guide = (slug, label, note) => link(`/guides/${slug}`, label, note);
const tool = (slug, label, note) => link(`/tools/${slug}`, label, note);
const stock = (symbol, note) => link(`/markets/shares/${symbol.toLowerCase()}`, `${symbol} research notes`, note);
const fund = (slug, label) => link(`/markets/funds/${slug}`, label);
const investorSource = {
  href: 'https://www.psx.com.pk/psx/resources-and-tools/investors/guide-to-investors',
  label: 'PSX guide to investors', external: true,
  note: 'Investor education and definitions; use the company notice for an actual distribution.',
};
const navSource = {
  href: 'https://www.mufap.com.pk/Industry/IndustryStatDaily?tab=3',
  label: 'MUFAP NAVs and sale loads', external: true,
  note: 'Match the full fund name and NAV validity date to the manager’s statement.',
};
const taxSources = { links: [
  { href: 'https://www.nccpl.com.pk/cgt', label: 'NCCPL capital gains tax information', external: true,
    note: 'Start with the official computation, applicable rules and your tax certificate.' },
  { href: 'https://www.nccpl.com.pk/storage/notices/downloads/01KAGHRNNTV2SZ88GTTMZ80C1C.pdf',
    label: 'NCCPL circular: Finance Act 2025 schedule (PDF)', external: true,
    note: 'Historical schedule effective 1 July 2025, labelled Tax Year 2026; not evidence of the rules for every later sale.' },
] };

const paths = {
  'fifo-cost-basis-psx': ['FIFO vs average / weighted cost', [tool('fifo-vs-average', 'Compare FIFO and average cost with your own two lots')]],
  'cgt-basics-pakistan-stocks': ['A labeled illustration, not a filing', [tool('capital-gains', 'Calculate a share-sale gain after fees'), guide('fifo-cost-basis-psx', 'Identify which purchase lots a sale closes')]],
  'tracking-psx-dividends': ['What to record on a dividend', [tool('dividend-yield', 'Calculate dividend yield from cash per share and a dated price')]],
  'choosing-a-psx-broker': ['Costs you should verify on today’s schedule', [tool('trade-costs', 'Estimate commission, tax on commission and CDC charges'), guide('importing-broker-trades', 'Check the trade fields needed for broker imports')]],
  'importing-broker-trades': ['After every import', [tool('trade-costs', 'Cross-check the charges on a contract note'), link('/how-it-works#guide-2-set-up-your-broker', 'See the broker setup walkthrough')]],
  'psx-with-limited-capital': ['Build the funding habit first', [tool('sip', 'Explore a monthly investment scenario'), tool('trade-costs', 'Check how much a small trade costs')]],
  'realistic-psx-returns': ['Two engines: income and price change', [tool('dividend-yield', 'Measure the cash-income part of return'), tool('sip', 'Compare monthly contribution assumptions')]],
  'is-psx-investing-halal': ['Your next step', [tool('zakat', 'Estimate zakat using the assets and method you choose', 'A calculation aid, not a ruling on eligibility or timing.')]],
  'mutual-fund-nav-tracking': ['Categories change the question you are asking', [
    fund('meezan-islamic-fund', 'Meezan Islamic Fund: units and distributions'),
    fund('al-meezan-mutual-fund', 'Al Meezan Mutual Fund: mandate and records'),
    fund('ubl-stock-advantage-fund', 'UBL Stock Advantage Fund: statements and charges'),
    tool('sip', 'Model regular fund contributions'), navSource,
  ]],
  'analyze-cement-stocks-psx': ['Valuation inside the peer set', [stock('LUCK', 'Apply the cement checklist to Lucky Cement’s filings.')]],
  'analyze-pakistani-banks-psx': ['Returns and valuation', [stock('MCB', 'Funding, earnings and capital questions.'), stock('MEBL', 'Keep the Islamic banking model and share valuation distinct.')]],
  'stock-factors-investors-watch': ['Balance sheet and cash flow', [stock('OGDC', 'Receivables and cash collection.'), stock('PPL', 'Production and collections.'), stock('POL', 'Read the group and its cash flows.'), stock('HUBC', 'Receivables, projects and distributions.')]],
  'pe-ratio-for-psx-stocks': ['Compare like with like', [stock('FFC', 'Read the fertilizer business before comparing earnings.'), stock('SYS', 'Check the earnings period and currency effects you are comparing.')]],
};

const screenshot = (file, alt, caption) => ({ figure: { file, alt, caption } });
const examples = {
  'understanding-unrealized-vs-realized': ['Worked example: selling some of your shares',
    'Illustration only: buy 100 shares at Rs 100, for a cost of Rs 10,000. This example excludes fees, taxes, dividends and corporate actions so the difference between open and closed gains is clear.',
    { table: { headers: ['What happens?', 'Realized P&L', 'Unrealized P&L'], rows: [
      ['Price rises to Rs 120; all 100 shares are still held', 'Rs 0 — no sale', '100 × (120 − 100) = Rs 2,000'],
      ['Sell 40 shares at Rs 120; keep 60 shares', '40 × (120 − 100) = Rs 800', '60 × (120 − 100) = Rs 1,200'],
      ['Later, the remaining shares fall to Rs 110', 'Still Rs 800 from the completed sale', '60 × (110 − 100) = Rs 600'],
    ] } },
    'The sale brings in Rs 4,800 of cash, but only Rs 800 is profit: Rs 4,000 is the cost of the 40 shares sold. The 60 remaining shares have a cost of Rs 6,000. Do not count the entire sale proceeds as a gain.',
    'Immediately after the partial sale, the Rs 800 realized gain plus Rs 1,200 unrealized gain equals the original Rs 2,000 price gain. At Rs 110, that combined gain is Rs 1,400. The later fall affects the shares still held, not the price at which the completed sale occurred.',
    'For a loss example, selling 40 of those Rs 100 shares at Rs 90 would realize a Rs 400 loss before charges. With multiple purchase lots, the matched cost depends on your cost-basis method; include purchase charges in cost and deduct relevant selling charges without counting them twice.',
    screenshot('realized', 'PSX Tracker realized profit and loss report for a demo portfolio', 'The Realized P&L report shows closed trades. This is a separate demo portfolio; its amounts are not the worked example above.'),
    { links: [tool('fifo-vs-average', 'Compare matched costs when you bought at different prices'), tool('trade-costs', 'Estimate the charges on a buy or sell'), guide('psx-portfolio-export-reconcile', 'Reconcile the results to broker records')] },
  ],
  'fifo-cost-basis-psx': ['Follow a partial sale from note to report',
    'Illustrative records only: the following dates and prices are invented. Assume no fees or corporate actions so the lot-matching difference is visible.',
    { table: { headers: ['Contract note', 'Transaction to record', 'Quantity × price'], rows: [
      ['2 September 2026', 'Buy — first lot', '100 × Rs 200 = Rs 20,000'],
      ['9 September 2026', 'Buy — second lot', '100 × Rs 170 = Rs 17,000'],
      ['16 September 2026', 'Sell — partial disposal', '50 × Rs 225 = Rs 11,250'],
    ] } },
    'In Reports → Transactions, check that there are exactly two buys and one sell, with the dates and quantities above. The sale consumes 50 shares from the first lot. Its FIFO cost is Rs 10,000 and its realized gain before fees and tax is Rs 1,250.',
    'The remaining holdings are 50 shares at Rs 200 plus 100 at Rs 170: 150 shares with Rs 27,000 of remaining cost. A weighted-average method uses Rs 185 per share and reports Rs 2,000 on the same sale. The Rs 750 difference is a timing difference in allocated cost, not extra cash received.',
    screenshot('history', 'PSX Tracker transaction history with sample buys and sells', 'Transaction history — a separate demo account. Use this screen to check the source rows; its amounts are not the worked example above.'),
    screenshot('realized', 'PSX Tracker realized profit and loss report', 'Realized P&L — a separate demo account. Reconcile the sale and matched cost before relying on the total.'),
    { links: [tool('fifo-vs-average', 'Reproduce the 100 / 100 / 50-share example'), guide('psx-portfolio-export-reconcile', 'Reconcile a portfolio against broker records')] },
  ],
  'tracking-psx-dividends': ['Worked example: announcement to cash received',
    'This is an invented cash-dividend example, not an actual company announcement or a current withholding-tax rate. Suppose a notice declares 50% on a face value of Rs 10, and your eligible holding is 200 shares.',
    { table: { headers: ['Step', 'Calculation', 'Result'], rows: [
      ['Cash dividend per share', '50% × Rs 10 face value', 'Rs 5'],
      ['Gross dividend', '200 eligible shares × Rs 5', 'Rs 1,000'],
      ['Illustrative withholding only', 'Rs 1,000 × an assumed 15%', 'Rs 150'],
      ['Net cash received', 'Rs 1,000 − Rs 150', 'Rs 850'],
    ] } },
    'Use the actual company notice and dividend advice for eligibility, face value, gross amount and tax. In Add Transaction, record the Dividend for the correct symbol and payment date. Review the dividend and withholding fields against the advice, then reconcile the net cash with the broker or bank credit. Do not add a second Deposit for the same dividend.',
    'If Rs 5 is the total cash dividend per share for the entire year and the chosen price is Rs 100, gross annual yield is 5%. If Rs 5 is only one interim payout, it is a 5% payout-to-price ratio, not an established annual yield. The example’s net cash yield would be 4.25%; a future dividend is not guaranteed.',
    screenshot('dividends', 'PSX Tracker dividend scanner dialog in a demo portfolio', 'Optional dividend scanner — review any proposed records against the actual dividend advice before saving.'),
    { links: [tool('dividend-yield', 'Calculate cash dividend yield for a stated period'), investorSource] },
  ],
  'cgt-basics-pakistan-stocks': ['Which tax source and date should you use?',
    'The Rs 14,550 example above explains a fee-inclusive gain. It does not establish the tax payable. Keep the acquisition date of each closed lot, the disposal date, the relevant tax year, taxpayer status and the official computation together.',
    'The linked NCCPL circular describes the Finance Act 2025 schedule effective from 1 July 2025 and labels its table Tax Year 2026. A tax-year label is not the same as every trade made during the calendar year 2026. Check later legislation and NCCPL notices for the period of your disposal.',
    'Source scope noted 16 October 2026: the public calculator implements the Finance Act 2025 schedule. Later amendments have not been verified on this page. Use its tax output as a schedule illustration and reconcile to NCCPL before filing; personal fees, loss offsets and other adjustments can differ from the official computation.',
    taxSources,
  ],
};

export function addGuideReading(slug, page) {
  const route = paths[slug];
  const sections = page.sections.map(section => route && section[0] === route[0]
    ? [...section, { links: route[1] }] : section);
  if (examples[slug]) sections.push(examples[slug]);
  const image = ['fifo-cost-basis-psx', 'understanding-unrealized-vs-realized'].includes(slug) ? '/media/features/realized-preview.webp'
    : slug === 'tracking-psx-dividends' ? '/media/features/dividends-preview.webp' : undefined;
  return { ...page, ...(image ? { image } : {}), sections };
}

const toolReading = {
  'capital-gains': [guide('cgt-basics-pakistan-stocks', 'Read the capital-gains record-keeping guide'), guide('fifo-cost-basis-psx', 'Understand partial sales and purchase lots')],
  'fifo-vs-average': [guide('fifo-cost-basis-psx', 'Follow the worked FIFO example from note to report'), guide('understanding-unrealized-vs-realized', 'Separate open gains from realized gains')],
  'dividend-yield': [guide('tracking-psx-dividends', 'Convert a dividend percentage into gross and net cash'), investorSource],
  'trade-costs': [guide('choosing-a-psx-broker', 'Read a broker fee schedule'), guide('importing-broker-trades', 'Import and check a contract note')],
  sip: [guide('psx-with-limited-capital', 'Plan a manageable contribution habit'), guide('mutual-fund-nav-tracking', 'Track actual fund units and NAV after subscribing')],
  zakat: [guide('is-psx-investing-halal', 'Separate investing screens from personal religious rulings'), guide('psx-portfolio-export-reconcile', 'Reconcile holdings before choosing zakatable amounts')],
};
const stockReading = {
  LUCK: [guide('analyze-cement-stocks-psx', 'Apply the cement-company research checklist')],
  MCB: [guide('analyze-pakistani-banks-psx', 'Compare bank funding, credit quality and capital')],
  MEBL: [guide('analyze-pakistani-banks-psx', 'Read bank accounts in context'), guide('kmi-and-shariah-screening', 'Understand dated Shariah screening lists')],
  SYS: [guide('pe-ratio-for-psx-stocks', 'Compare P/E ratios using matching earnings periods')],
};

export function addResourceReading(path, page) {
  const sections = [...page.sections];
  if (page.form) {
    if (page.form === 'capital-gains') sections.push(['Schedule reference and limits',
      'This calculator uses the Finance Act 2025 schedule. As of this content update on 16 October 2026, later amendments have not been verified here. A displayed tax rate is not confirmation of the law applicable to your sale. Use the official computation for filing.', taxSources]);
    sections.push(['Understand the inputs before using the result', { links: toolReading[page.form] }]);
  } else if (page.kind === 'share') {
    sections.push(['Read the filings, then apply the checklist',
      `Open the PSX profile for ${page.symbol}, then check the reporting period and whether the accounts are consolidated. Company announcements are the source for distributions and corporate actions; this research note is not a live quote.`,
      { links: [
        { href: `https://dps.psx.com.pk/company/${page.symbol}`, label: `${page.symbol}: official PSX profile, reports and announcements`, external: true },
        ...(stockReading[page.symbol] || [guide('stock-factors-investors-watch', 'Review cash flow, leverage and business risks')]),
        guide('tracking-psx-dividends', 'Record a declared dividend without confusing it with a deposit'),
      ] },
    ]);
  } else if (page.kind === 'fund') {
    sections.push(['Verify the fund and record your allocation',
      'Use the manager’s allocation statement for your units and charges. For a published NAV, match the exact fund name, share class or plan where relevant, and validity date. A fund with a similar name is not interchangeable.',
      { links: [navSource, guide('mutual-fund-nav-tracking', 'Track units, NAV and distributions'), tool('sip', 'Explore a monthly contribution scenario')] },
    ]);
  }
  return { ...page, sections };
}
