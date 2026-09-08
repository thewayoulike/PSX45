import { describe, expect, it } from 'vitest';
import { pivotPointLevels } from './pivotPointLevels';

/** Fixed H/L/C (and O for DM) used across type checks. */
const H = 360;
const L = 300;
const C = 330;
const O = 320;

describe('pivotPointLevels — Traditional', () => {
  it('matches floor-trader Traditional', () => {
    const levels = pivotPointLevels('Traditional', { high: H, low: L, close: C });
    const p = (H + L + C) / 3;
    expect(levels.P).toBeCloseTo(p, 8);
    expect(levels.R1).toBeCloseTo(2 * p - L, 8);
    expect(levels.S1).toBeCloseTo(2 * p - H, 8);
    expect(levels.R2).toBeCloseTo(p + (H - L), 8);
    expect(levels.S2).toBeCloseTo(p - (H - L), 8);
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
  });
});

describe('pivotPointLevels — Woodie', () => {
  it('uses (H+L+2C)/4 pivot', () => {
    const levels = pivotPointLevels('Woodie', { high: H, low: L, close: C });
    const p = (H + L + 2 * C) / 4;
    expect(levels.P).toBeCloseTo(p, 8);
    expect(levels.R1).toBeCloseTo(2 * p - L, 8);
    expect(levels.S1).toBeCloseTo(2 * p - H, 8);
  });
});

describe('pivotPointLevels — Classic', () => {
  it('matches classic R/S extensions', () => {
    const levels = pivotPointLevels('Classic', { high: H, low: L, close: C });
    const p = (H + L + C) / 3;
    expect(levels.P).toBeCloseTo(p, 8);
    expect(levels.R1).toBeCloseTo(2 * p - L, 8);
    expect(levels.S1).toBeCloseTo(2 * p - H, 8);
    expect(levels.R2).toBeCloseTo(p + (H - L), 8);
    expect(levels.S2).toBeCloseTo(p - (H - L), 8);
    expect(levels.R3).toBeCloseTo(H + 2 * (p - L), 8);
    expect(levels.S3).toBeCloseTo(L - 2 * (H - p), 8);
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
  it('uses Camarilla close ± range fractions', () => {
    const levels = pivotPointLevels('Camarilla', { high: H, low: L, close: C });
    const r = H - L;
    expect(levels.R1).toBeCloseTo(C + (r * 1.1) / 12, 8);
    expect(levels.S1).toBeCloseTo(C - (r * 1.1) / 12, 8);
    expect(levels.R4).toBeCloseTo(C + (r * 1.1) / 2, 8);
    expect(levels.S4).toBeCloseTo(C - (r * 1.1) / 2, 8);
  });
});
