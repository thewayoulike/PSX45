import { describe, it, expect } from 'vitest';
import { indexPeriod } from './indexChart';
const p = (date: string, price: number) => ({ time: Date.parse(date + 'T12:00:00Z'), price });
describe('index history range boundaries', () => {
  it('uses the previous trading close when the period starts on a holiday', () => {
    const rows = [p('2026-08-31', 100), p('2026-09-15', 110), p('2026-09-17', 120), p('2026-10-16', 132)];
    expect(indexPeriod(rows, 1)).toEqual(rows.slice(1));
    const selected = indexPeriod(rows, 1);
    expect(selected.at(-1)!.price / selected[0].price - 1).toBeCloseTo(.2);
  });
  it('does not include an older session when an exact boundary exists', () => {
    const rows = [p('2026-09-15', 100), p('2026-09-16', 110), p('2026-10-16', 120)];
    expect(indexPeriod(rows, 1)).toEqual(rows.slice(1));
  });
  it('clamps a March month-end to February instead of rolling into March', () => {
    const rows = [p('2026-02-27', 100), p('2026-03-02', 110), p('2026-03-31', 120)];
    expect(indexPeriod(rows, 1)).toEqual(rows);
  });
  it('keeps all available history for long ranges and handles unavailable data', () => {
    const rows = [p('2025-01-02', 100), p('2026-10-16', 120)];
    expect(indexPeriod(rows, 60)).toEqual(rows);
    expect(indexPeriod(rows, null)).toEqual(rows);
    expect(indexPeriod([], 1)).toEqual([]);
  });
});

import { aggregateIndexBars, parseIndexBars } from './indexChart';
describe('genuine index candle data', () => {
  const raw = { bars: [
    {time:Date.parse('2026-10-12T04:00Z'),open:100,high:110,low:99,close:108,volume:10},
    {time:Date.parse('2026-10-13T04:00Z'),open:108,high:112,low:105,close:106,volume:20},
    {time:Date.parse('2026-10-19T04:00Z'),open:106,high:114,low:103,close:113,volume:null},
  ]};
  it('does not create candles from close-only history or invalid values', () => {
    expect(parseIndexBars({data:[[100,120]]})).toEqual([]);
    expect(parseIndexBars({bars:[{time:100,close:120},{time:200,open:100,high:90,low:110,close:99}]})).toEqual([]);
    expect(parseIndexBars(raw).at(-1)?.volumeAvailable).toBe(false);
  });
  it('builds weekly OHLC from the first open, range extremes and last close', () => {
    const bars = aggregateIndexBars(parseIndexBars(raw), '1W');
    expect(bars).toHaveLength(2);
    expect(bars[0]).toMatchObject({open:100,high:112,low:99,close:106,volume:30,volumeAvailable:true});
    expect(bars[1].close).toBe(113);
  });
  it('does not report a complete monthly volume when any session is missing volume', () => {
    const bars = aggregateIndexBars(parseIndexBars(raw), '1M');
    expect(bars).toHaveLength(1);
    expect(bars[0]).toMatchObject({open:100,high:114,low:99,close:113,volumeAvailable:false});
  });
});
