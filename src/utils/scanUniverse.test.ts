import { describe, expect, it } from 'vitest';
import { buildScanUniverse } from './scanUniverse';

const cands = [
  { symbol: 'OGDC', current: 100, ldcp: 99, changePct: 1, volume: 5000 },
  { symbol: 'PPL', current: 200, ldcp: 190, changePct: 5, volume: 4000 },
  { symbol: 'HBL', current: 150, ldcp: 148, changePct: 1, volume: 3000 },
  { symbol: 'LUCK', current: 800, ldcp: 790, changePct: 1, volume: 2000 },
];

describe('buildScanUniverse', () => {
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
