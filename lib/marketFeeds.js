// A fixed set of public feeds. No credentials, portfolio data, or arbitrary target URLs.
export const MARKET_FEEDS = {
  crypto: { url: 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin,ethereum,solana,binancecoin,ripple,cardano&sparkline=false', ttl: 300 },
  fx: { url: 'https://open.er-api.com/v6/latest/USD', ttl: 3600 },
  metals: { url: 'https://latest.currency-api.pages.dev/v1/currencies/usd.min.json', ttl: 3600 },
};
export async function fetchMarketFeed(name) {
  const feed = MARKET_FEEDS[name];
  if (!feed) throw new Error('Unknown market feed');
  const response = await fetch(feed.url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`Market provider returned ${response.status}`);
  const data = await response.json();
  return { data, retrievedAt: new Date().toISOString(), ttl: feed.ttl };
}
