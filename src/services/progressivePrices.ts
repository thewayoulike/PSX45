import { mergePriceOverlays } from '../utils/priceOverlay';
type Prices = Record<string, number>;
export async function progressivePrices<T>(sources: {
  baseline: () => Promise<T>;
  pricesFromBaseline: (data: T) => Prices;
  closes: () => Promise<Prices>;
  quotes: () => Promise<Prices>;
  publish: (prices: Prices, baseline?: T) => void;
  current: () => boolean;
}) {
  let base: Prices = {}, closes: Prices = {}, quotes: Prices = {};
  const publish = (data?: T) => { if (sources.current()) sources.publish(mergePriceOverlays(base, closes, quotes), data); };
  await Promise.allSettled([
    sources.baseline().then(data => { base = sources.pricesFromBaseline(data); publish(data); }),
    sources.closes().then(data => { closes = data; publish(); }),
    sources.quotes().then(data => { quotes = data; publish(); }),
  ]);
  return mergePriceOverlays(base, closes, quotes);
}

// A deliberately broad Pakistan weekday daytime window; manual/focus refresh
// remains available at any time, including special exchange sessions.
export function marketPollDelay(now = new Date()) {
  const pakistan = new Date(now.getTime() + 5 * 3600000);
  const day = pakistan.getUTCDay(), hour = pakistan.getUTCHours();
  return day > 0 && day < 6 && hour >= 9 && hour < 18 ? 60000 : 30 * 60000;
}
