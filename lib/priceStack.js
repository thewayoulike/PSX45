/** Live market-watch wins during the session. OHLC only fills gaps then. */
export function applyPriceStack(marketWatch, ohlc, quotes, marketOpen) {
  const out = {};
  const put = (source, { fillGapsOnly }) => {
    for (const [sym, price] of Object.entries(source || {})) {
      const key = String(sym).toUpperCase();
      if (!(typeof price === 'number' && price > 0)) continue;
      if (fillGapsOnly && out[key] > 0) continue;
      out[key] = price;
    }
  };
  put(marketWatch, { fillGapsOnly: false });
  put(ohlc, { fillGapsOnly: !!marketOpen });
  put(quotes, { fillGapsOnly: false });
  return out;
}
