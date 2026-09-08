import { describe, expect, it } from 'vitest';
import { traditionalPivotsFromHLC, monthlyPivotSupportResistance } from './pivotLevels';
import type { OhlcBar } from '../services/psxData';

describe('traditionalPivotsFromHLC', () => {
  it('matches classic floor-trader S1/R1', () => {
    // H=360, L=300, C=330 → P=330; R1=360; S1=300
    const levels = traditionalPivotsFromHLC(360, 300, 330);
    expect(levels.p).toBeCloseTo(330, 5);
    expect(levels.r1).toBeCloseTo(360, 5);
    expect(levels.s1).toBeCloseTo(300, 5);
  });
});

describe('monthlyPivotSupportResistance', () => {
  it('uses last completed month H/L/C', () => {
    const bars: OhlcBar[] = [];
    // July completed month
    for (let d = 1; d <= 31; d++) {
      bars.push({
        time: Date.UTC(2026, 6, d),
        open: 100,
        high: 110 + d * 0.1,
        low: 90 - d * 0.05,
        close: 100 + d,
        volume: 1000,
      });
    }
    // August current (partial) — should be ignored as source
    for (let d = 1; d <= 7; d++) {
      bars.push({
        time: Date.UTC(2026, 7, d),
        open: 200,
        high: 250,
        low: 180,
        close: 220,
        volume: 1000,
      });
    }
    const julyHigh = Math.max(...bars.filter((b) => new Date(b.time).getUTCMonth() === 6).map((b) => b.high));
    const julyLow = Math.min(...bars.filter((b) => new Date(b.time).getUTCMonth() === 6).map((b) => b.low));
    const julyClose = bars.filter((b) => new Date(b.time).getUTCMonth() === 6).at(-1)!.close;
    const expected = traditionalPivotsFromHLC(julyHigh, julyLow, julyClose);
    const out = monthlyPivotSupportResistance(bars);
    expect(out).not.toBeNull();
    expect(out!.support).toBeCloseTo(expected.s1, 5);
    expect(out!.resistance).toBeCloseTo(expected.r1, 5);
    expect(out!.pivot).toBeCloseTo(expected.p, 5);
  });
});
