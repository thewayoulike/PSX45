import { describe, it, expect } from 'vitest';
import {
  quoteToPrice,
  quotesPayloadToPriceMap,
  mergePriceOverlays,
  pypsxIndexName,
} from './priceOverlay';

describe('quoteToPrice', () => {
  it('reads last / price aliases', () => {
    expect(quoteToPrice({ last: 100.5 })).toBe(100.5);
    expect(quoteToPrice({ price: 90 })).toBe(90);
    expect(quoteToPrice({ last_price: '88.25' })).toBe(88.25);
  });

  it('rejects missing or non-positive', () => {
    expect(quoteToPrice(null)).toBeNull();
    expect(quoteToPrice({})).toBeNull();
    expect(quoteToPrice({ price: 0 })).toBeNull();
    expect(quoteToPrice({ price: -1 })).toBeNull();
  });
});

describe('quotesPayloadToPriceMap', () => {
  it('maps quotes object by symbol', () => {
    expect(
      quotesPayloadToPriceMap({
        quotes: { ogdc: { last: 320 }, HBL: { price: 200 } },
      })
    ).toEqual({ OGDC: 320, HBL: 200 });
  });

  it('maps quotes array', () => {
    expect(
      quotesPayloadToPriceMap({
        quotes: [
          { symbol: 'ppl', last: 150 },
          { Symbol: 'PSO', price: 400 },
        ],
      })
    ).toEqual({ PPL: 150, PSO: 400 });
  });
});

describe('mergePriceOverlays', () => {
  it('keeps baseline and lets later overlays win', () => {
    const base = { OGDC: 100, HBL: 50 };
    const ohlc = { OGDC: 110 };
    const quote = { OGDC: 115, PPL: 200 };
    expect(mergePriceOverlays(base, ohlc, quote)).toEqual({
      OGDC: 115,
      HBL: 50,
      PPL: 200,
    });
  });

  it('ignores non-positive overlay prices', () => {
    expect(mergePriceOverlays({ OGDC: 100 }, { OGDC: 0, HBL: -1 })).toEqual({ OGDC: 100 });
  });
});

describe('pypsxIndexName', () => {
  it('maps KSE100 / KMI30', () => {
    expect(pypsxIndexName('KMI30')).toBe('KMI-30');
    expect(pypsxIndexName('KSE-100')).toBe('KSE-100');
    expect(pypsxIndexName('foo')).toBeNull();
  });
});
