import { describe, expect, it } from 'vitest';
import { buildScanUniverse, holdingScanSymbols } from './scanUniverse';

const cands = [
  { symbol: 'OGDC', current: 100, ldcp: 99, changePct: 1, volume: 5000 },
  { symbol: 'PPL', current: 200, ldcp: 190, changePct: 5, volume: 4000 },
  { symbol: 'HBL', current: 150, ldcp: 148, changePct: 1, volume: 3000 },
  { symbol: 'LUCK', current: 800, ldcp: 790, changePct: 1, volume: 2000 },
];

describe('buildScanUniverse', () => {
  it('uses only open stock holdings and deduplicates brokers', () => {
    expect(holdingScanSymbols([
      { ticker: ' ogdc ', quantity: 5 }, { ticker: 'OGDC', quantity: 12 },
      { ticker: 'PPL', quantity: 0 }, { ticker: 'HBL', quantity: -4 },
      { ticker: 'MF:fund', quantity: 99 }, { ticker: 'LUCK', quantity: NaN },
      { ticker: 'SYS', quantity: 0.5 },
    ])).toEqual(['OGDC', 'SYS']);
  });

  it('limits holdings scans and keeps missing quotes available through history', () => {
    const result = buildScanUniverse(cands, 'HOLDINGS', { holdings: [' ppl ', 'SYS', 'ppl'] });
    expect(result.map(r => r.symbol)).toEqual(['PPL', 'SYS']);
    expect(result[0].current).toBe(200);
    expect(result[1].current).toBe(0);
    expect(result[1].changePct).toBeNaN();
    expect(buildScanUniverse(cands, 'HOLDINGS', {})).toEqual([]);
  });
  it('filters watchlist', () => {
    const out = buildScanUniverse(cands, 'WATCHLIST', { watchlist: ['ppl', 'HBL'] });
    expect(out.map((c) => c.symbol)).toEqual(['PPL', 'HBL']);
  });

  it('returns a single symbol when present in candidates', () => {
    const out = buildScanUniverse(cands, 'SYMBOL', { symbol: 'luck' });
    expect(out).toHaveLength(1);
    expect(out[0].symbol).toBe('LUCK');
  });

  it('synthesizes a candidate when symbol missing from market snapshot', () => {
    const out = buildScanUniverse(cands, 'SYMBOL', { symbol: 'SYS' });
    expect(out).toHaveLength(1);
    expect(out[0].symbol).toBe('SYS');
    expect(out[0].current).toBe(0);
  });

  it('returns empty for SYMBOL without a ticker', () => {
    expect(buildScanUniverse(cands, 'SYMBOL', { symbol: '  ' })).toEqual([]);
  });

  it('slices top N by volume order', () => {
    const out = buildScanUniverse(cands, '20');
    expect(out.map((c) => c.symbol)).toEqual(['OGDC', 'PPL', 'HBL', 'LUCK']);
  });
});
