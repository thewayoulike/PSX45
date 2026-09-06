import { describe, expect, it } from 'vitest';
import {
  stocksPathForTicker,
  tickerFromStocksPath,
  normalizeStockDeepLink,
} from './stocksPath';

describe('stocksPathForTicker', () => {
  it('returns /stocks when no ticker', () => {
    expect(stocksPathForTicker(null)).toBe('/stocks');
    expect(stocksPathForTicker('')).toBe('/stocks');
    expect(stocksPathForTicker('  ')).toBe('/stocks');
  });

  it('returns /stocks/TICKER uppercased', () => {
    expect(stocksPathForTicker('efert')).toBe('/stocks/EFERT');
    expect(stocksPathForTicker('OGDC')).toBe('/stocks/OGDC');
  });
});

describe('tickerFromStocksPath', () => {
  it('parses /stocks/TICKER', () => {
    expect(tickerFromStocksPath('/stocks/EFERT')).toBe('EFERT');
    expect(tickerFromStocksPath('/stocks/efert/')).toBe('EFERT');
  });

  it('returns null for bare /stocks', () => {
    expect(tickerFromStocksPath('/stocks')).toBe(null);
    expect(tickerFromStocksPath('/stocks/')).toBe(null);
  });

  it('returns null for unrelated paths', () => {
    expect(tickerFromStocksPath('/holdings')).toBe(null);
    expect(tickerFromStocksPath('/')).toBe(null);
  });
});

describe('normalizeStockDeepLink', () => {
  it('maps legacy /stock/TICKER to /stocks/TICKER', () => {
    expect(normalizeStockDeepLink('/stock/OGDC')).toEqual({
      ticker: 'OGDC',
      canonicalPath: '/stocks/OGDC',
    });
  });

  it('keeps /stocks/TICKER as-is', () => {
    expect(normalizeStockDeepLink('/stocks/EFERT')).toEqual({
      ticker: 'EFERT',
      canonicalPath: '/stocks/EFERT',
    });
  });

  it('returns null for non-stock paths', () => {
    expect(normalizeStockDeepLink('/stocks')).toBe(null);
    expect(normalizeStockDeepLink('/holdings')).toBe(null);
  });
});
