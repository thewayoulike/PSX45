export const MAX_QUOTE_BATCH = 20;
export function validateMarketQuery(query) {
  for (const key of ['symbol','ohlc','company','analysis','intraday','quote']) {
    if (query[key] !== undefined && !/^[A-Z0-9][A-Z0-9.-]{0,19}$/i.test(String(query[key]))) return 'Invalid stock symbol';
  }
  if (query.symbols !== undefined) {
    const list = String(query.symbols).split(',');
    if (list.length > MAX_QUOTE_BATCH || list.some(s => !/^[A-Z0-9][A-Z0-9.-]{0,19}$/i.test(s))) return 'Use at most 20 valid stock symbols';
  }
  if (query.period && !['1d','5d','1w','1mo','3mo','6mo','1y','2y','5y','all','max'].includes(query.period)) return 'Invalid period';
  if (query.interval && !['1m','5m','15m','30m','1h','1d'].includes(query.interval)) return 'Invalid interval';
  return null;
}
