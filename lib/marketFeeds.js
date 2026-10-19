import { fetchCommodityBenchmarks } from './commodityFeeds.js';
import { fetchPublicReport } from './publicMarketReports.js';
import { fetchForexHeatmap } from './forexHeatmap.js';
import { fetchCommodityDashboard } from './commodityDashboard.js';
import { fetchMarketNews } from './marketNews.js';
// A fixed set of public feeds. No credentials, portfolio data, or arbitrary target URLs.
export const MARKET_FEEDS = {
  crypto: { url: 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin,ethereum,solana,binancecoin,ripple,cardano&sparkline=false', ttl: 300 },
  fx: { url: 'https://open.er-api.com/v6/latest/USD', ttl: 3600 },
  'fx-heatmap': { load: fetchForexHeatmap, ttl: 3600 },
  metals: { url: 'https://latest.currency-api.pages.dev/v1/currencies/usd.min.json', ttl: 3600 },
  commodities: { load: fetchCommodityBenchmarks, ttl: 3600 },
  'commodity-dashboard': { load: fetchCommodityDashboard, ttl: 120 },
  news: { load: fetchMarketNews, ttl: 900 },
  flows: { load: () => fetchPublicReport('flows'), ttl: 1800 },
  insiders: { load: () => fetchPublicReport('insiders'), ttl: 1800 },
};
export async function fetchMarketFeed(name) {
  const feed = Object.hasOwn(MARKET_FEEDS, name) ? MARKET_FEEDS[name] : null;
  if (!feed) throw new Error('Unknown market feed');
  if (feed.load) return { data: await feed.load(), retrievedAt: new Date().toISOString(), ttl: feed.ttl };
  const response = await fetch(feed.url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`Market provider returned ${response.status}`);
  const data = await response.json();
  return { data, retrievedAt: new Date().toISOString(), ttl: feed.ttl };
}
