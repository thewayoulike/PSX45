import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CHART_EXTRAS,
  applyEmaTrioPreset,
  cloneChartExtras,
  computeVwapLine,
  detectCandlePatterns,
  findConsolidationZones,
  normalizeChartExtras,
} from './chartExtras';
import { DEFAULT_AWAIS_LAYERS } from './awaisIndicators';
import type { OhlcBar } from '../services/psxData';

const day = (n: number) => Date.UTC(2024, 0, n);

function bar(time: number, open: number, high: number, low: number, close: number, volume = 100): OhlcBar {
  return { time, open, high, low, close, volume };
}

describe('chartExtras', () => {
  it('defaults all flags off', () => {
    expect(Object.values(DEFAULT_CHART_EXTRAS).every((v) => v === false)).toBe(true);
  });

  it('normalize fills missing keys from defaults', () => {
    const n = normalizeChartExtras({ volumeSpike: true });
    expect(n.volumeSpike).toBe(true);
    expect(n.swingMarkers).toBe(false);
    expect(n.rsiDivergence).toBe(false);
  });

  it('clone is detached', () => {
    const c = cloneChartExtras(DEFAULT_CHART_EXTRAS);
    c.atrPane = true;
    expect(DEFAULT_CHART_EXTRAS.atrPane).toBe(false);
  });

  it('findConsolidationZones returns tight ranges and skips loose windows', () => {
    const bars = [
      bar(day(1), 20, 20.6, 19.8, 20.2),
      bar(day(2), 20.2, 20.7, 19.9, 20.1),
      bar(day(3), 20.1, 20.5, 19.7, 20.0),
      bar(day(4), 21.5, 24.5, 18.5, 23.8),
    ];

    expect(findConsolidationZones(bars, { minBars: 3, thresholdPct: 0.06 })).toEqual([
      { startIndex: 0, endIndex: 2, high: 20.7, low: 19.7 },
    ]);
  });

  it('computeVwapLine accumulates typical price by volume', () => {
    const bars = [
      bar(day(1), 10, 11, 9, 10, 100),
      bar(day(2), 12, 13, 11, 12, 200),
    ];

    expect(computeVwapLine(bars).map((p) => p.value)).toEqual([10, 11.333333333333334]);
  });

  it('computeVwapLine resets at session boundaries when requested', () => {
    const bars = [
      bar(Date.UTC(2024, 0, 1, 10), 10, 11, 9, 10, 100),
      bar(Date.UTC(2024, 0, 1, 11), 12, 13, 11, 12, 100),
      bar(Date.UTC(2024, 0, 2, 10), 20, 21, 19, 20, 100),
    ];

    expect(computeVwapLine(bars, { resetBySession: true }).map((p) => p.value)).toEqual([10, 11, 20]);
  });

  it('detectCandlePatterns marks doji, hammer, and engulfing candles', () => {
    const bars = [
      bar(day(1), 10, 10.8, 9.2, 10.02),
      bar(day(2), 12, 12.2, 11.6, 11.7),
      bar(day(3), 11.6, 12.5, 11.55, 12.4),
      bar(day(4), 14.9, 15.15, 13, 15),
      bar(day(5), 15.05, 15.2, 13.7, 13.8),
      bar(day(6), 14, 14.2, 13.7, 13.9),
      bar(day(7), 14.1, 14.3, 13.5, 13.6),
    ];

    expect(detectCandlePatterns(bars)).toEqual([
      { index: 0, time: day(1), type: 'doji', direction: 'neutral', price: 10.8 },
      { index: 2, time: day(3), type: 'bullishEngulfing', direction: 'bullish', price: 11.55 },
      { index: 3, time: day(4), type: 'hammer', direction: 'bullish', price: 13 },
      { index: 4, time: day(5), type: 'bearishEngulfing', direction: 'bearish', price: 15.2 },
    ]);
  });

  it('applyEmaTrioPreset enables EMA 20/50/200 in the first three Awais MA slots', () => {
    const base = cloneChartExtras(DEFAULT_CHART_EXTRAS);
    base.emaTrio = true;
    const layers = {
      ...DEFAULT_AWAIS_LAYERS,
      groups: { ...DEFAULT_AWAIS_LAYERS.groups, ema: false },
      maLines: {
        ...DEFAULT_AWAIS_LAYERS.maLines,
        ma1: { ...DEFAULT_AWAIS_LAYERS.maLines.ma1, enabled: false, period: 7, type: 'SMA' as const },
      },
    };

    const next = applyEmaTrioPreset(layers);

    expect(next.groups.ema).toBe(true);
    expect(next.maLines.ma1).toMatchObject({ enabled: true, period: 20, type: 'EMA' });
    expect(next.maLines.ma2).toMatchObject({ enabled: true, period: 50, type: 'EMA' });
    expect(next.maLines.ma3).toMatchObject({ enabled: true, period: 200, type: 'EMA' });
    expect(layers.maLines.ma1.period).toBe(7);
  });
});
