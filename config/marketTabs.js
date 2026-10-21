/** Public Markets tabs that have their own address under /markets/<slug>. The overview stays at /markets. */
export const MARKET_TAB_PAGES = {
  stocks: {
    label: 'Stock Markets',
    title: 'PSX Stock Prices, KSE-100 & Sector Heatmap | PSX Tracker',
    description: 'PSX share prices with KSE-100, KMI-30, KSE-30 and All Share index levels, a sector heatmap and daily movers. Filter by index and sector. No login required.',
    heading: 'Pakistan stock markets',
    intro: 'Explore PSX companies by sector, index and daily change.',
  },
  funds: {
    label: 'Mutual Funds',
    title: 'Pakistan Mutual Fund NAVs by Category | PSX Tracker',
    description: 'Published MUFAP NAVs, offer and repurchase prices for Pakistani mutual funds. Filter by category and fund manager and compare funds side by side.',
    heading: 'Pakistan mutual funds',
    intro: 'Published NAVs, categories and fund managers, so you can compare like with like.',
  },
  crypto: {
    label: 'Cryptocurrencies',
    title: 'Crypto Prices: Bitcoin, Ethereum & More | PSX Tracker',
    description: 'Cryptocurrency prices in US dollars with 24-hour change, market cap and volume for Bitcoin, Ethereum and other major coins. No login required.',
    heading: 'Cryptocurrency prices',
    intro: 'USD quotes with the price change over the last 24 hours.',
  },
  forex: {
    label: 'Forex',
    title: 'PKR Exchange Rates & Currency Converter | PSX Tracker',
    description: 'Daily reference rates for the Pakistani rupee against the US dollar, euro, pound, riyal and dirham, with a currency strength heatmap and converter.',
    heading: 'Pakistani rupee exchange rates',
    intro: 'Currency strength, daily reference rates and a currency converter.',
  },
  commodities: {
    label: 'Commodities',
    title: 'Gold, Silver, Copper & Oil Prices | PSX Tracker',
    description: 'Gold, silver, copper and WTI crude prices with history. Gold and silver per ounce, tola and gram in Pakistani rupees or US dollars.',
    heading: 'Commodity prices',
    intro: 'Gold, silver, copper and WTI, with price history for each.',
  },
  news: {
    label: 'News',
    title: 'Pakistan Business & PSX Market News | PSX Tracker',
    description: 'Pakistan and global business headlines that move the markets, from multiple publishers, in one place. Filter by publisher and section.',
    heading: 'Market news',
    intro: 'Pakistan and global headlines, from multiple publishers.',
  },
};
