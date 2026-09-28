import { describe, expect, it } from 'vitest';
import { computeInformedChartProjection, evaluateProjectionModels, matchedProjectionPoint } from './informedChartProjection';
import { computeProjectionFeatures, projectionFeatureDistance, projectionPatterns } from './projectionFeatures';
import { computeTechnicalAnalysis } from './technicalRatings';
import { makeSavedProjection, normalizeSavedProjections } from '../services/chartProjectionStorage';
import type { OhlcBar } from '../services/psxData';

const now = Date.UTC(2026, 8, 28, 14);
function history(n = 900): OhlcBar[] {
  return Array.from({ length: n }, (_, i) => { const close = 150 + 15 * Math.sin(i / 8) + 2 * Math.cos(i / 3); const open = 150 + 15 * Math.sin((i - 1) / 8) + 2 * Math.cos((i - 1) / 3); return { time: Date.UTC(2023, 0, i + 1, 4), open, close, high: Math.max(open, close) + 1.2, low: Math.min(open, close) - 1.3, volume: 10000 + i % 7 * 500 }; });
}
describe('indicator-informed projections', () => {
  it('builds causal features: appending future bars changes no historical vector', () => {
    const bars = history(850), old = computeProjectionFeatures(bars.slice(0, 800)), full = computeProjectionFeatures(bars);
    expect(full.vectors.slice(0, 800)).toEqual(old.vectors);
    expect(matchedProjectionPoint(bars, full, 799, 8, true)).toEqual(matchedProjectionPoint(bars.slice(0, 800), old, 799, 8, true));
  });
  it('matches all 26 current indicator values to the existing technical engine', () => {
    const bars = history(), features = computeProjectionFeatures(bars), technical = computeTechnicalAnalysis(bars, now);
    const expected = new Map(technical.rows.map(r => [r.name, r.value]));
    const pairs = [
      ['EMA (10)', 'Exponential Moving Average (10)'], ['SMA (10)', 'Simple Moving Average (10)'], ['EMA (20)', 'Exponential Moving Average (20)'], ['SMA (20)', 'Simple Moving Average (20)'],
      ['EMA (30)', 'Exponential Moving Average (30)'], ['SMA (30)', 'Simple Moving Average (30)'], ['EMA (50)', 'Exponential Moving Average (50)'], ['SMA (50)', 'Simple Moving Average (50)'],
      ['EMA (100)', 'Exponential Moving Average (100)'], ['SMA (100)', 'Simple Moving Average (100)'], ['EMA (200)', 'Exponential Moving Average (200)'], ['SMA (200)', 'Simple Moving Average (200)'],
      ['Hull MA (9)', 'Hull Moving Average (9)'], ['VWMA (20)', 'Volume Weighted Moving Average (20)'], ['Ichimoku base (26)', 'Ichimoku Base Line (9, 26, 52, 26)'],
      ['RSI (14)', 'Relative Strength Index (14)'], ['Stochastic %K (14,3,3)', 'Stochastic %K (14, 3, 3)'], ['CCI (20)', 'Commodity Channel Index (20)'], ['ADX (14)', 'Average Directional Index (14)'],
      ['Awesome Oscillator', 'Awesome Oscillator (5, 34)'], ['Momentum (10)', 'Momentum (10)'], ['MACD (12,26)', 'MACD Level (12, 26, 9)'], ['Stochastic RSI', 'Stochastic RSI Fast (3, 3, 14, 14)'], ['Williams %R', 'Williams Percent Range (14)'], ['Bull Bear Power', 'Bull Bear Power (13)'], ['Ultimate Oscillator', 'Ultimate Oscillator (7, 14, 28)'],
    ];
    expect(features.context.readings).toHaveLength(26);
    for (const [name, reference] of pairs) expect(features.context.readings.find(r => r.name === name)?.value, name).toBeCloseTo(expected.get(reference)!, 8);
  });
  it('uses body/wicks and multi-candle patterns, treating doji as indecision', () => {
    const bars = history(10), i = 9;
    const doji = [...bars.slice(0, i), { ...bars[i], open: 100, close: 100.05, high: 103, low: 97 }];
    expect(projectionPatterns(doji, i)).toContain('Doji');
    const engulf = [...bars.slice(0, 8), { ...bars[8], open: 105, close: 100, high: 106, low: 99 }, { ...bars[9], open: 99, close: 106, high: 107, low: 98 }];
    expect(projectionPatterns(engulf, 9)).toContain('Bullish engulfing');
    const bear = engulf.map(b => ({ ...b, open: b.close, close: b.open }));
    expect(projectionPatterns(bear, 9)).toContain('Bearish engulfing');
  });
  it('changes similarity when volume confirmation or RSI/momentum changes', () => {
    const features = computeProjectionFeatures(history()), current = features.vectors.at(-1)!;
    const changedVolume = current.map(g => [...g]); changedVolume[6] = changedVolume[6].map(v => v >= 0 ? -1 : 1);
    const changedMomentum = current.map(g => [...g]); changedMomentum[3][0] = current[3][0] >= 0 ? -1 : 1;
    expect(projectionFeatureDistance(current, current)).toBe(0);
    expect(projectionFeatureDistance(current, changedVolume)).toBeGreaterThan(0);
    expect(projectionFeatureDistance(current, changedMomentum)).toBeGreaterThan(0);
  });
  it('handles absent volume explicitly and retains other valid inputs', () => {
    const features = computeProjectionFeatures(history().map(b => ({ ...b, volumeAvailable: false, volume: 0 })));
    expect(features.context.volume).toContain('unavailable');
    expect(features.context.readings.find(r => r.name === 'VWMA (20)')?.value).toBeNull();
    expect(features.vectors.at(-1)![6].every(Number.isNaN)).toBe(true);
    expect(Number.isFinite(projectionFeatureDistance(features.vectors[800], features.vectors[790]))).toBe(true);
  });
  it('uses paired h-spaced replays and can select better matching on a predictable synthetic cycle', () => {
    const result = computeInformedChartProjection(history(), 8, now);
    const evidence = result.data!.evidence!;
    expect(evidence.validation.cases).toBe(40);
    expect(evidence.validation.lastTime! - evidence.validation.firstTime!).toBe(39 * 8 * 86400000);
    expect(evidence.method).toBe('indicator-matched-v2');
    expect(evidence.validation.indicatorMaePct!).toBeLessThan(evidence.validation.baselineMaePct!);
    expect(evidence.validation.indicatorIntervalScorePct!).toBeLessThan(evidence.validation.baselineIntervalScorePct!);
    expect(result.data!.points.every(p => p.samples >= 60 && p.samples <= 150)).toBe(true);
  });
  it('keeps the baseline when replay evidence is insufficient and never manufactures confidence', () => {
    const result = computeInformedChartProjection(history(410), 8, now);
    expect(result.data!.evidence!.method).toBe('historical-baseline');
    expect(result.data!.evidence!.validation.cases).toBeLessThan(30);
    expect(result.data!.points.every(p => p.samples >= 200)).toBe(true);
  });
  it('evaluation excludes future candles through the same as-of cutoff as the live range', () => {
    const bars = history(), cutoff = bars[850].time + 10 * 3600000;
    expect(computeInformedChartProjection(bars, 5, cutoff)).toEqual(computeInformedChartProjection(bars.slice(0, 851), 5, cutoff));
  });
  it('saves original indicators, model decision and replay results while accepting old records', () => {
    const result = computeInformedChartProjection(history(), 8, now);
    const saved = makeSavedProjection('AIRLINK', result.data!, now);
    expect(saved.model).toBe('indicator-tested-v2');
    expect(normalizeSavedProjections(JSON.parse(JSON.stringify([saved])))).toEqual([saved]);
    result.data!.evidence!.context.readings[0].value = 99999;
    expect(saved.data.evidence!.context.readings[0].value).not.toBe(99999);
  });
});
