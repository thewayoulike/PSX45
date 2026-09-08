import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MOMENTUM_CONFIG,
  computeMomentumSeries,
  cloneMomentumConfig,
} from './momentumIndicators';
import type { OhlcBar } from '../services/psxData';

function bar(i: number, o: number, h: number, l: number, c: number): OhlcBar {
  return { time: Date.UTC(2024, 0, 1) + i * 86400000, open: o, high: h, low: l, close: c, volume: 1000 };
}

/** Synthetic trending series long enough for DI/ADX warmup. */
function trendingBars(n = 80): OhlcBar[] {
  const out: OhlcBar[] = [];
  let c = 100;
  for (let i = 0; i < n; i++) {
    const o = c;
    c = c + (i % 3 === 0 ? -0.5 : 1.2);
    const h = Math.max(o, c) + 1;
    const l = Math.min(o, c) - 1;
    out.push(bar(i, o, h, l, c));
  }
  return out;
}

describe('ADX +DI / −DI (Momentum Panel Selector parity)', () => {
  it('exposes plusDi and minusDi alongside adx on MomentumBar', () => {
    const cfg = cloneMomentumConfig(DEFAULT_MOMENTUM_CONFIG);
    cfg.enabled.ADX = true;
    const series = computeMomentumSeries(trendingBars(), cfg);
    const last = series[series.length - 1];
    expect(last.adx).not.toBeNull();
    expect(last.plusDi).not.toBeNull();
    expect(last.minusDi).not.toBeNull();
    expect(typeof last.plusDi).toBe('number');
    expect(typeof last.minusDi).toBe('number');
  });

  it('defaults include +DI/−DI colors', () => {
    expect(DEFAULT_MOMENTUM_CONFIG.adx.plusDiColor).toBeTruthy();
    expect(DEFAULT_MOMENTUM_CONFIG.adx.minusDiColor).toBeTruthy();
  });

  it('on a strong uptrend, last +DI is greater than −DI', () => {
    const cfg = cloneMomentumConfig(DEFAULT_MOMENTUM_CONFIG);
    const series = computeMomentumSeries(trendingBars(100), cfg);
    const last = [...series].reverse().find((p) => p.plusDi != null && p.minusDi != null)!;
    expect(last.plusDi!).toBeGreaterThan(last.minusDi!);
  });
});
