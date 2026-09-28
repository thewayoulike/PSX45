import { describe, expect, it } from 'vitest';
import { appendNewerBars, candlesFromTicks, parseIntradayTicks } from './intradaySession';

/** Pakistan wall time as UTC milliseconds. */
const pkt = (h: number, min: number, sec = 0) => Date.UTC(2026, 8, 28, h - 5, min, sec);

describe('candlesFromTicks', () => {
  it('builds 5-minute candles from trade prints, open first and close last', () => {
    const candles = candlesFromTicks(
      [
        { time: pkt(9, 36), price: 9, volume: 4 },
        { time: pkt(9, 30, 10), price: 10, volume: 1 },
        { time: pkt(9, 32), price: 12, volume: 2 },
        { time: pkt(9, 34), price: 11, volume: 3 },
      ],
      5 * 60 * 1000,
    );
    expect(candles).toEqual([
      { time: pkt(9, 30), open: 10, high: 12, low: 10, close: 11, volume: 6 },
      { time: pkt(9, 35), open: 9, high: 9, low: 9, close: 9, volume: 4 },
    ]);
  });
});

describe('appendNewerBars', () => {
  it('adds the 28 Sep session after history that ends on 25 Sep', () => {
    const older = [{ time: Date.UTC(2026, 8, 25, 11, 25), close: 1 }];
    const today = [{ time: pkt(9, 30), close: 2 }];
    expect(appendNewerBars(older, today)).toEqual([...older, ...today]);
  });

  it('does not repeat a candle the history feed already has', () => {
    const bar = { time: pkt(9, 30), close: 2 };
    expect(appendNewerBars([bar], [bar, { time: pkt(9, 35), close: 3 }])).toEqual([
      bar,
      { time: pkt(9, 35), close: 3 },
    ]);
  });
});

describe('parseIntradayTicks', () => {
  it('reads the exchange tape of time, price and volume', () => {
    const raw = JSON.stringify({ data: [[1790569800, 316.5, 423], [0, 1, 1], [1790569860, 0, 5]] });
    expect(parseIntradayTicks(raw)).toEqual([{ time: 1790569800000, price: 316.5, volume: 423 }]);
  });
});
