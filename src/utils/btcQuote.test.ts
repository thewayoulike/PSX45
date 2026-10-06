import { describe, expect, it } from 'vitest';
import { buildQuoteStrip, parseBtcUsdQuote, parseGoldOunceQuotes } from './btcQuote';

describe('BTC quote on the index strip', () => {
  it('reads the CoinGecko bitcoin price and 24-hour change', () => {
    expect(parseBtcUsdQuote({ bitcoin: { usd: 83608, usd_24h_change: -0.188 } })).toEqual({
      value: 83608,
      changePct: -0.188,
    });
  });

  it('ignores a payload with no dollar price', () => {
    expect(parseBtcUsdQuote(null)).toBeNull();
    expect(parseBtcUsdQuote({})).toBeNull();
    expect(parseBtcUsdQuote({ bitcoin: { usd_24h_change: 1 } })).toBeNull();
  });

  it('turns ounces-per-dollar into gold per troy ounce in USD and PKR', () => {
    expect(parseGoldOunceQuotes({ usd: { xau: 0.00025, pkr: 280 } })).toEqual({
      usd: { value: 4000, changePct: null },
      pkr: { value: 1120000, changePct: null },
    });
    expect(parseGoldOunceQuotes({ usd: { xau: 0.00025 } })).toEqual({
      usd: { value: 4000, changePct: null },
      pkr: null,
    });
    expect(parseGoldOunceQuotes(null)).toEqual({ usd: null, pkr: null });
    expect(parseGoldOunceQuotes({ usd: { xau: 0, pkr: 280 } })).toEqual({ usd: null, pkr: null });
  });

  it('places gold after USD/PKR and before BTC, and drops a missing side', () => {
    const full = buildQuoteStrip({
      kse: { value: 1, changePct: 0 },
      pkr: 280,
      goldUsd: { value: 4000, changePct: null },
      goldPkr: { value: 1120000, changePct: null },
      btc: { value: 80000, changePct: 1 },
    });
    expect(full.map(item => item.label)).toEqual(['KSE-100', 'USD/PKR', 'XAU/USD', 'XAU/PKR', 'BTC']);

    const usdOnly = buildQuoteStrip({
      pkr: 280,
      goldUsd: { value: 4000, changePct: null },
      goldPkr: null,
      btc: { value: 80000, changePct: 1 },
    });
    expect(usdOnly.map(item => item.label)).toEqual(['USD/PKR', 'XAU/USD', 'BTC']);
  });

  it('places BTC after USD/PKR and drops it when the quote is missing', () => {
    const kse = { value: 169969.32, changePct: 0.22 };
    const kmi = { value: 243608.5, changePct: 0.29 };
    const full = buildQuoteStrip({ kse, kmi, pkr: 276.88, btc: { value: 83608, changePct: -0.19 } });
    expect(full.map(item => item.label)).toEqual(['KSE-100', 'KMI-30', 'USD/PKR', 'BTC']);
    expect(full[3]).toMatchObject({ value: 83608, changePct: -0.19 });

    const withoutBtc = buildQuoteStrip({ kse, kmi, pkr: 276.88, btc: null });
    expect(withoutBtc.map(item => item.label)).toEqual(['KSE-100', 'KMI-30', 'USD/PKR']);
  });
});
