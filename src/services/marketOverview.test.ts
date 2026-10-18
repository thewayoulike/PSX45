import { describe, expect, it } from 'vitest';
import { convertMarketCurrency, marketBreadth, marketNumber, marketTableMarkup, metalUnitValue, parseCryptoQuotes, parseFx, parseMarketHistory, parseMetals, stockWeight, type MarketStock } from './marketOverview';
const stock = (change: number | null, cap: number | null = 100): MarketStock => ({ symbol: 'TEST', name: 'Test', sector: 'Bank', price: 10, change, marketCap: cap, freeFloatCap: cap == null ? null : cap * .4, volume: 0, high: 10, low: 10, previous: null, indices: ['KSE100'] });
describe('public market calculations preserve source meaning', () => {
  it('keeps report data while removing upstream executable and resource attributes before DOM parsing', () => {
    const markup = marketTableMarkup(`<a onclick="outside()">Outside</a><table style="display:none"><thead><tr><th data-name="close" onclick='handler()'>Price</th></tr></thead><tbody><tr><td data-order='1,234.5' OnMouseOver=handler()><a href="javascript:run()" data-title='Quoted "Company" &amp; Co' data-code="FFC">FFC</a><img src="/fetch-me" onerror="run()"><script>run()</script></td></tr></tbody></table>`);
    expect(markup).toContain('data-order="1,234.5"');
    expect(markup).toContain('data-title="Quoted &quot;Company&quot; &amp; Co"');
    expect(markup).toContain('data-code="FFC"');
    expect(markup).not.toMatch(/onclick|onmouseover|onerror|javascript:|<script|<img|href=|style=|outside|run\(\)/i);
    expect(marketTableMarkup('<html>no report</html>')).toBe('');
  });
  it('does not turn unavailable values into zero changes', () => {
    for (const value of [null, undefined, '', ' ', '—', 'N/A', 'bad']) expect(marketNumber(value)).toBeNull();
    expect(marketNumber('0')).toBe(0);
    expect(marketNumber('1,234.50%')).toBe(1234.5);
    expect(marketBreadth([stock(0), stock(null), stock(2), stock(-1)])).toEqual({ up: 1, down: 1, flat: 1, unknown: 1 });
  });
  it('uses correct cross rates and does not accept missing or invalid input', () => {
    const rates = { USD: 1, PKR: 280, GBP: .8 };
    expect(convertMarketCurrency(2, 'GBP', 'PKR', rates)).toBe(700);
    expect(convertMarketCurrency(700, 'PKR', 'GBP', rates)).toBe(2);
    expect(convertMarketCurrency(0, 'GBP', 'PKR', rates)).toBe(0);
    expect(convertMarketCurrency(-2, 'GBP', 'PKR', rates)).toBeNull();
    expect(convertMarketCurrency(2, 'EUR', 'PKR', rates)).toBeNull();
    expect(() => parseFx({ result: 'error', rates })).toThrow();
  });
  it('inverts the metal currency rates and uses troy weights for tola/grams', () => {
    const metals = parseMetals({ date: '2026-10-17', usd: { xau: .00025, xag: .02 } });
    expect(metals.gold).toBe(4000); expect(metals.silver).toBe(50);
    expect(metalUnitValue(4000, 'tola', 'USD')).toBeCloseTo(1500, 5);
    expect(metalUnitValue(4000, 'ounce', 'PKR', 280)).toBe(1120000);
    expect(metalUnitValue(4000, 'gram', 'USD')).toBeCloseTo(4000 / 31.1034768, 5);
    expect(metalUnitValue(4000, 'tola', 'PKR')).toBeNull();
    expect(parseMetals({ usd: { xag: .02 } }).gold).toBeNull();
  });
  it('excludes missing market caps only for weighted sizing', () => {
    expect(stockWeight(stock(1), 'float')).toBe(40);
    expect(stockWeight(stock(1), 'cap')).toBe(100);
    expect(stockWeight(stock(1, null), 'cap')).toBe(0);
    expect(stockWeight(stock(1, null), 'equal')).toBe(1);
  });
  it('uses the closing field of OHLC, sorts time and rejects invalid prices', () => {
    expect(parseMarketHistory({ data: [[200, 3], [100, 8, 12, 6, 10], [200, 4], [300, null]] })).toEqual([{ time: 100000, price: 10 }, { time: 200000, price: 4 }]);
  });
  it('keeps missing cryptocurrency change unavailable and real zero unchanged', () => {
    const quotes = parseCryptoQuotes([{ id: 'a', symbol: 'a', current_price: 2, price_change_percentage_24h: null }, { id: 'b', symbol: 'b', current_price: 3, price_change_percentage_24h: 0 }, { id: 'c', symbol: 'c', current_price: -1 }]);
    expect(quotes).toHaveLength(2); expect(quotes[0].change).toBeNull(); expect(quotes[1].change).toBe(0);
  });
});
