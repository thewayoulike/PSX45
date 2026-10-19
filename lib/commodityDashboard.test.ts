import { describe, expect, it } from 'vitest';
import { COMMODITY_INSTRUMENTS, parseCommodityHistory } from './commodityDashboard.js';
const stamp = (date: string) => Date.parse(date) / 1000;
const spec = COMMODITY_INSTRUMENTS[3];
function fixture() { return { chart: { result: [{ meta: { symbol: 'CL=F', currency: 'USD', instrumentType: 'FUTURE', exchangeTimezoneName: 'America/New_York', regularMarketTime: stamp('2026-10-18T21:00:00Z'), regularMarketPrice: 98, fulldayPrice: 98, fulldayChange: -2, chartPreviousClose: 45, regularMarketDayHigh: 102, regularMarketDayLow: 97 }, timestamp: [stamp('2020-04-20T04:00:00Z'), stamp('2026-10-16T04:00:00Z'), stamp('2026-10-18T21:00:00Z')], indicators: { quote: [{ close: [-37, 103, 98] }] } }] } }; }
describe('commodity price/history normalization', () => {
  it('uses the quoted contract previous close, never the range start or old contract bar', () => {
    const quote = parseCommodityHistory(fixture(), spec);
    expect(quote.previousClose).toBe(100); expect(quote.history.at(-1)?.close).toBe(98);
    expect(quote.history[0].close).toBe(-37); expect(quote.date).toBe('2026-10-18');
  });
  it('leaves previous close unavailable when its actual quote fields are missing', () => {
    const raw = fixture(); delete (raw.chart.result[0].meta as any).fulldayChange;
    expect(parseCommodityHistory(raw, spec).previousClose).toBeNull();
  });
  it('rejects an unexpected instrument and missing values rather than fabricating data', () => {
    expect(() => parseCommodityHistory(fixture(), COMMODITY_INSTRUMENTS[0])).toThrow();
    const raw = fixture(); (raw.chart.result[0].indicators.quote[0].close as any) = [null, null, null];
    expect(() => parseCommodityHistory(raw, spec)).toThrow('history unavailable');
  });
  it('drops missing and future points and bounds the visible series at the current quote', () => {
    const raw = fixture(); raw.chart.result[0].timestamp.push(stamp('2026-10-20T04:00:00Z')); raw.chart.result[0].indicators.quote[0].close.push(999);
    expect(parseCommodityHistory(raw, spec).history.some(point => point.close === 999)).toBe(false);
  });
});
