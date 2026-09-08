import { describe, expect, it } from 'vitest';
import { pivotPointLevels } from './pivotPointLevels';

/** Fixed H/L/C (and O for DM) used across type checks. */
const H = 360;
const L = 300;
const C = 330;
const O = 320;

describe('pivotPointLevels — Traditional', () => {
  it('matches floor-trader Traditional including R4/R5/S4/S5', () => {
    const levels = pivotPointLevels('Traditional', { high: H, low: L, close: C });
    const p = (H + L + C) / 3;
    expect(levels.P).toBeCloseTo(p, 8);
    expect(levels.R1).toBeCloseTo(2 * p - L, 8);
    expect(levels.S1).toBeCloseTo(2 * p - H, 8);
    expect(levels.R2).toBeCloseTo(p + (H - L), 8);
    expect(levels.S2).toBeCloseTo(p - (H - L), 8);
    expect(levels.R3).toBeCloseTo(2 * p + (H - 2 * L), 8);
    expect(levels.S3).toBeCloseTo(2 * p - (2 * H - L), 8);
    expect(levels.R4).toBeCloseTo(3 * p + (H - 3 * L), 8);
    expect(levels.S4).toBeCloseTo(3 * p - (3 * H - L), 8);
    expect(levels.R5).toBeCloseTo(4 * p + (H - 4 * L), 8);
    expect(levels.S5).toBeCloseTo(4 * p - (4 * H - L), 8);
  });

  /** TradingView Awais panel on OGDC (Monthly Traditional from Aug 2026 HLC). */
  it('matches TradingView Traditional golden levels (OGDC Aug 2026)', () => {
    const levels = pivotPointLevels('Traditional', {
      high: 335,
      low: 313.07,
      close: 328.7,
    });
    expect(levels.P).toBeCloseTo(325.59, 2);
    expect(levels.R1).toBeCloseTo(338.11, 2);
    expect(levels.S1).toBeCloseTo(316.18, 2);
    expect(levels.R2).toBeCloseTo(347.52, 2);
    expect(levels.S2).toBeCloseTo(303.66, 2);
    expect(levels.R3).toBeCloseTo(360.04, 2);
    expect(levels.S3).toBeCloseTo(294.25, 2);
    expect(levels.R4).toBeCloseTo(372.56, 2);
    expect(levels.S4).toBeCloseTo(284.84, 2);
    expect(levels.R5).toBeCloseTo(385.08, 2);
    expect(levels.S5).toBeCloseTo(275.43, 2);
  });
});

describe('pivotPointLevels — Fibonacci', () => {
  it('uses 0.382 / 0.618 / 1.0 range multiples', () => {
    const levels = pivotPointLevels('Fibonacci', { high: H, low: L, close: C });
    const p = (H + L + C) / 3;
    const r = H - L;
    expect(levels.P).toBeCloseTo(p, 8);
    expect(levels.R1).toBeCloseTo(p + 0.382 * r, 8);
    expect(levels.S1).toBeCloseTo(p - 0.382 * r, 8);
    expect(levels.R2).toBeCloseTo(p + 0.618 * r, 8);
    expect(levels.S2).toBeCloseTo(p - 0.618 * r, 8);
    expect(levels.R3).toBeCloseTo(p + r, 8);
    expect(levels.S3).toBeCloseTo(p - r, 8);
    expect(levels.R4).toBeUndefined();
    expect(levels.S5).toBeUndefined();
  });
});

describe('pivotPointLevels — Woodie', () => {
  it('uses (prevH+prevL+2*currOpen)/4 and R4/S4 (TradingView)', () => {
    const currOpen = 340;
    const levels = pivotPointLevels('Woodie', {
      high: H,
      low: L,
      close: C,
      currentOpen: currOpen,
    });
    const p = (H + L + 2 * currOpen) / 4;
    const r = H - L;
    const r3 = H + 2 * (p - L);
    const s3 = L - 2 * (H - p);
    expect(levels.P).toBeCloseTo(p, 8);
    expect(levels.R1).toBeCloseTo(2 * p - L, 8);
    expect(levels.S1).toBeCloseTo(2 * p - H, 8);
    expect(levels.R2).toBeCloseTo(p + r, 8);
    expect(levels.S2).toBeCloseTo(p - r, 8);
    expect(levels.R3).toBeCloseTo(r3, 8);
    expect(levels.S3).toBeCloseTo(s3, 8);
    expect(levels.R4).toBeCloseTo(r3 + r, 8);
    expect(levels.S4).toBeCloseTo(s3 - r, 8);
    expect(levels.R5).toBeUndefined();
  });
});

describe('pivotPointLevels — Classic', () => {
  it('matches TradingView Classic range multiples through R4/S4', () => {
    const levels = pivotPointLevels('Classic', { high: H, low: L, close: C });
    const p = (H + L + C) / 3;
    const r = H - L;
    expect(levels.P).toBeCloseTo(p, 8);
    expect(levels.R1).toBeCloseTo(2 * p - L, 8);
    expect(levels.S1).toBeCloseTo(2 * p - H, 8);
    expect(levels.R2).toBeCloseTo(p + r, 8);
    expect(levels.S2).toBeCloseTo(p - r, 8);
    expect(levels.R3).toBeCloseTo(p + 2 * r, 8);
    expect(levels.S3).toBeCloseTo(p - 2 * r, 8);
    expect(levels.R4).toBeCloseTo(p + 3 * r, 8);
    expect(levels.S4).toBeCloseTo(p - 3 * r, 8);
    expect(levels.R5).toBeUndefined();
  });
});

describe('pivotPointLevels — DM', () => {
  it('uses DeMark X from open vs close', () => {
    const levels = pivotPointLevels('DM', { high: H, low: L, close: C, open: O });
    // C > O → X = 2H + L + C
    const x = 2 * H + L + C;
    expect(levels.P).toBeCloseTo(x / 4, 8);
    expect(levels.R1).toBeCloseTo(x / 2 - L, 8);
    expect(levels.S1).toBeCloseTo(x / 2 - H, 8);
    expect(levels.R2).toBeUndefined();
    expect(levels.S2).toBeUndefined();
  });
});

describe('pivotPointLevels — Camarilla', () => {
  it('uses Camarilla close ± range fractions through R5/S5', () => {
    const levels = pivotPointLevels('Camarilla', { high: H, low: L, close: C });
    const r = H - L;
    const r5 = (H / L) * C;
    expect(levels.R1).toBeCloseTo(C + (r * 1.1) / 12, 8);
    expect(levels.S1).toBeCloseTo(C - (r * 1.1) / 12, 8);
    expect(levels.R4).toBeCloseTo(C + (r * 1.1) / 2, 8);
    expect(levels.S4).toBeCloseTo(C - (r * 1.1) / 2, 8);
    expect(levels.R5).toBeCloseTo(r5, 8);
    expect(levels.S5).toBeCloseTo(C - (r5 - C), 8);
  });
});
