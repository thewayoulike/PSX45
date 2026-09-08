import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AWAIS_LAYERS,
  DEFAULT_GROUPS,
  DEFAULT_MA_LINES,
  MA_SLOTS,
  computeAwaisOverlays,
  normalizeAwaisLayers,
} from './awaisIndicators';
import type { OhlcBar } from '../services/psxData';

function bars(n = 120): OhlcBar[] {
  const out: OhlcBar[] = [];
  let c = 100;
  for (let i = 0; i < n; i++) {
    const month = Math.floor(i / 22);
    const day = (i % 22) + 1;
    c += (i % 5) - 2;
    out.push({
      time: Date.UTC(2025, month, day),
      open: c,
      high: c + 2,
      low: c - 2,
      close: c + 0.5,
      volume: 1000,
    });
  }
  return out;
}

describe('Awais MA6 Pine parity', () => {
  it('has six MA slots ma1–ma6', () => {
    expect(MA_SLOTS).toEqual(['ma1', 'ma2', 'ma3', 'ma4', 'ma5', 'ma6']);
  });

  it('defaults match Awais Pine (EMA 5/13/20/50/200/200; 20 off)', () => {
    expect(DEFAULT_MA_LINES.ma1.period).toBe(5);
    expect(DEFAULT_MA_LINES.ma1.type).toBe('EMA');
    expect(DEFAULT_MA_LINES.ma2.period).toBe(13);
    expect(DEFAULT_MA_LINES.ma2.type).toBe('EMA');
    expect(DEFAULT_MA_LINES.ma3.period).toBe(20);
    expect(DEFAULT_MA_LINES.ma3.enabled).toBe(false);
    expect(DEFAULT_MA_LINES.ma4.period).toBe(50);
    expect(DEFAULT_MA_LINES.ma5.period).toBe(200);
    expect(DEFAULT_MA_LINES.ma6.period).toBe(200);
    expect(DEFAULT_MA_LINES.ma6.enabled).toBe(true);
  });
});

describe('Awais BB / Supertrend / Ichimoku config', () => {
  it('exposes configurable BB length, mult, offset on layers', () => {
    const layers = normalizeAwaisLayers(DEFAULT_AWAIS_LAYERS);
    expect(layers.bbConfig.length).toBe(20);
    expect(layers.bbConfig.mult).toBe(2);
    expect(layers.bbConfig.offset).toBe(0);
  });

  it('exposes Supertrend ATR period, mult, and changeAtrMethod', () => {
    const layers = normalizeAwaisLayers(DEFAULT_AWAIS_LAYERS);
    expect(layers.supertrendConfig.atrPeriod).toBe(10);
    expect(layers.supertrendConfig.multiplier).toBe(3);
    expect(layers.supertrendConfig.changeAtrMethod).toBe(true);
  });

  it('defaults Ichimoku group ON with editable lengths', () => {
    expect(DEFAULT_GROUPS.ichimoku).toBe(true);
    const layers = normalizeAwaisLayers(DEFAULT_AWAIS_LAYERS);
    expect(layers.ichimokuConfig.conversion).toBe(9);
    expect(layers.ichimokuConfig.base).toBe(26);
    expect(layers.ichimokuConfig.spanB).toBe(52);
    expect(layers.ichimokuConfig.displacement).toBe(26);
  });

  it('computes lagging span (close series) for Ichimoku', () => {
    const data = computeAwaisOverlays(bars(), DEFAULT_AWAIS_LAYERS);
    expect(data?.ichimoku.laggingSpan).toBeDefined();
    expect(data!.ichimoku.laggingSpan!.length).toBe(bars().length);
  });

  it('emits Supertrend flip markers', () => {
    const data = computeAwaisOverlays(bars(200), DEFAULT_AWAIS_LAYERS);
    expect(data?.supertrendMarkers).toBeDefined();
    expect(Array.isArray(data!.supertrendMarkers)).toBe(true);
  });
});

describe('Awais pivot type / history settings', () => {
  it('defaults Traditional, Auto, maxHistoricalPivots >= 1', () => {
    const layers = normalizeAwaisLayers({});
    expect(layers.pivotType).toBe('Traditional');
    expect(layers.pivotAnchor).toBe('Auto');
    expect(layers.maxHistoricalPivots).toBeGreaterThanOrEqual(1);
    expect(layers.showPivotLabels).toBe(true);
    expect(layers.showPivotPrices).toBe(true);
    expect(layers.pivotLabelPosition).toBe('Left');
    expect(layers.pivotLineWidth).toBeGreaterThanOrEqual(1);
  });

  it('returns multiple pivot period sets when maxHistoricalPivots > 1', () => {
    // ~22 trading days/month × 8 months → enough completed Monthly periods
    const monthlyEnough = bars(22 * 8);
    const layers = normalizeAwaisLayers({
      ...DEFAULT_AWAIS_LAYERS,
      pivotAnchor: 'Monthly',
      maxHistoricalPivots: 2,
    });
    const data = computeAwaisOverlays(monthlyEnough, layers, { timeframe: 'day' });
    expect(data?.pivotsByPeriod).toBeDefined();
    expect(data!.pivotsByPeriod!.length).toBeGreaterThanOrEqual(2);
    const [a, b] = data!.pivotsByPeriod!;
    expect(a.levels.length).toBeGreaterThan(0);
    expect(b.levels.length).toBeGreaterThan(0);
    expect(a.startTime).toBeLessThan(a.endTime);
    expect(b.startTime).toBeLessThan(b.endTime);
    // Distinct drawing windows (TradingView: each set spans its active period)
    expect(a.startTime).not.toBe(b.startTime);
    // Legacy pivots mirrors the newest (last) period's levels
    expect(data!.pivots.map((p) => p.value)).toEqual(
      data!.pivotsByPeriod![data!.pivotsByPeriod!.length - 1].levels.map((p) => p.value)
    );
  });
});

describe('Awais BB source', () => {
  it('uses bbConfig.source when computing bands', () => {
    const sample = bars(60);
    const closeLayers = normalizeAwaisLayers({
      ...DEFAULT_AWAIS_LAYERS,
      bbConfig: { length: 20, mult: 2, offset: 0, source: 'close' },
    });
    const hl2Layers = normalizeAwaisLayers({
      ...DEFAULT_AWAIS_LAYERS,
      bbConfig: { length: 20, mult: 2, offset: 0, source: 'hl2' },
    });
    const closeBb = computeAwaisOverlays(sample, closeLayers)!;
    const hl2Bb = computeAwaisOverlays(sample, hl2Layers)!;
    const midClose = closeBb.bb.middle.find((v) => v != null);
    const midHl2 = hl2Bb.bb.middle.find((v) => v != null);
    expect(midClose).toBeDefined();
    expect(midHl2).toBeDefined();
    expect(midClose).not.toBe(midHl2);
  });
});
