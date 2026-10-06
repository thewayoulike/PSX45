import { describe, expect, it } from 'vitest';
import { jointCandleSides, mixTopMovers, rotateOnScreen } from './heroMovers';
import type { MoverRow } from './topMovers';

const row = (ticker: string, listedIn: string, change: number): MoverRow => ({
  ticker, listedIn, change, price: 100, volume: 1, high: 0, low: 0,
});

describe('landing hero movers', () => {
  it('mixes the KSE-100 top 10 gainers and top 10 losers', () => {
    const rows = [
      row('FLAT', 'KSE100', 0),
      row('OUT', 'ALLSHR', 20),
      ...Array.from({ length: 12 }, (_, i) => row(`G${i}`, 'KSE100', 12 - i)),
      ...Array.from({ length: 12 }, (_, i) => row(`L${i}`, 'KSE100', -(i + 1))),
    ];
    const mixed = mixTopMovers(rows);
    expect(mixed).toHaveLength(20);
    expect(mixed.filter(item => item.up).map(item => item.ticker)).toEqual(
      ['G0', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9'],
    );
    expect(mixed.filter(item => !item.up).map(item => item.ticker)).toEqual(
      ['L11', 'L10', 'L9', 'L8', 'L7', 'L6', 'L5', 'L4', 'L3', 'L2'],
    );
    expect(mixed[0].ticker).toBe('G0');
    expect(mixed[1].ticker).toBe('L11');
  });

  it('keeps 10 names on a phone and brings in the next one when one leaves', () => {
    const queue = Array.from({ length: 20 }, (_, i) => i);
    const next = rotateOnScreen(queue, 3, 10);
    expect(next).toHaveLength(20);
    expect(new Set(next).size).toBe(20);
    expect(next.slice(0, 10)).toEqual([0, 1, 2, 4, 5, 6, 7, 8, 9, 10]);
    expect(next[19]).toBe(3);
    expect(rotateOnScreen(queue, 15, 10)).toEqual(queue);
  });

  it('puts one candle on a same-direction joint and both colors on a mixed joint', () => {
    expect(jointCandleSides(true, true)).toEqual(['up']);
    expect(jointCandleSides(false, false)).toEqual(['down']);
    expect(jointCandleSides(true, false)).toEqual(['up', 'down']);
  });
});
