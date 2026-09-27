import { describe, expect, it } from 'vitest';
import { closedTechnicalBars, computeTechnicalAnalysis, summarizeTechnicalGroup, technicalVerdict, type TechnicalReading } from './technicalRatings';
import { technicalSnapshotStock } from './technicalSnapshot';
import type { OhlcBar } from '../services/psxData';

const now = Date.UTC(2026, 8, 27, 14);
const candles = (closes: number[]): OhlcBar[] => closes.map((close, i) => ({ time: Date.UTC(2025, 8, 1 + i, 4), open: close, high: close + 2, low: close - 2, close, volume: 1000 + i * 10 }));
const prices = Array.from({ length: 260 }, (_, i) => 100 + i * .12 + 7 * Math.sin(i / 9) + 2 * Math.cos(i / 3));
const row = (a: ReturnType<typeof computeTechnicalAnalysis>, prefix: string) => a.rows.find(r => r.name.startsWith(prefix))!;

describe('26-indicator technical analysis', () => {
  it('returns every requested reading with full coverage on valid varied OHLCV', () => {
    const a = computeTechnicalAnalysis(candles(prices), now);
    expect(a.rows).toHaveLength(26); expect(new Set(a.rows.map(r => r.name)).size).toBe(26);
    expect(a.groups.map(g => [g.total, g.available])).toEqual([[15, 15], [11, 11]]);
    expect(a.available).toBe(26);
    expect(a.summary.buys + a.summary.sells + a.summary.neutrals).toBe(26);
    const groupMean = ((a.groups[0].buys - a.groups[0].sells) / 15 + (a.groups[1].buys - a.groups[1].sells) / 11) / 2;
    expect(a.score).toBeCloseTo(groupMean, 12);
  });
  it('agrees with hand-calculated averages, VWMA and Hull on linear prices', () => {
    const linear = Array.from({ length: 220 }, (_, i) => 100 + i);
    const a = computeTechnicalAnalysis(candles(linear), now);
    expect(row(a, 'Simple Moving Average (20)').value).toBe(309.5);
    expect(row(a, 'Exponential Moving Average (20)').value).toBeCloseTo(309.5, 9);
    expect(row(a, 'Simple Moving Average (200)').value).toBe(219.5);
    expect(row(a, 'Hull Moving Average').value).toBeCloseTo(319, 9);
    // Last 20 volumes: 3000..3190; weighted mean uses sum(x*w)/sum(w).
    const w = Array.from({ length: 20 }, (_, i) => 3000 + i * 10);
    expect(row(a, 'Volume Weighted').value).toBeCloseTo(w.reduce((s, v, i) => s + (300 + i) * v, 0) / 61900, 10);
    expect(row(a, 'MACD').value).toBeCloseTo(7, 9);
    expect(row(a, 'Momentum').value).toBe(10);
    expect(row(a, 'Momentum').signal).toBe('NEUTRAL'); // compares momentum to previous, not to zero
    expect(row(a, 'Stochastic %K').value).toBeCloseTo(100 * 15 / 17, 9);
    expect(row(a, 'Williams').value).toBeCloseTo(-100 * 2 / 17, 9);
    expect(row(a, 'Commodity').value).toBeCloseTo(9.5 / (.015 * 5), 9);
    expect(row(a, 'Average Directional').value).toBeCloseTo(100, 9);
    expect(row(a, 'Awesome').value).toBeCloseTo(14.5, 9);
    expect(row(a, 'Ultimate').value).toBeCloseTo(50, 9);
  });
  it('uses Wilder RSI seed on a published-style worked price sequence', () => {
    const close = [44.34,44.09,44.15,43.61,44.33,44.83,45.10,45.42,45.84,46.08,45.89,46.03,45.61,46.28,46.28];
    const a = computeTechnicalAnalysis(candles(close), now);
    // 14 price changes: gains 3.34; losses 1.40 => 100*3.34/4.74.
    expect(row(a, 'Relative Strength').value).toBeCloseTo(100 * 3.34 / 4.74, 9);
    expect(row(a, 'Relative Strength').signal).toBeNull(); // no previous RSI yet
  });
  it('keeps missing readings unavailable and withholds incomplete overall ratings', () => {
    const a = computeTechnicalAnalysis(candles(prices.slice(0, 60)), now);
    expect(a.rows).toHaveLength(26); expect(a.score).toBeNull(); expect(a.rating).toBe('Incomplete');
    expect(row(a, 'Simple Moving Average (200)').value).toBeNull();
    expect(a.summary.enoughData).toBe(false); expect(Number.isNaN(a.summary.score)).toBe(true);
    const noData = computeTechnicalAnalysis([], now);
    expect(noData.available).toBe(0); expect(noData.plan).toBeNull(); expect(noData.candleDate).toBeNull();
  });
  it('does not fabricate a volume reading or divide by zero', () => {
    for (const patch of [{ volume: NaN }, { volume: 0, volumeAvailable: false }]) {
      const bars = candles(prices); bars[bars.length - 1] = { ...bars[bars.length - 1], ...patch };
      const a = computeTechnicalAnalysis(bars, now);
      expect(row(a, 'Volume Weighted').signal).toBeNull(); expect(a.available).toBe(25); expect(a.score).toBeNull();
    }
    const flat = computeTechnicalAnalysis(candles(Array(260).fill(100)).map(b => ({ ...b, high: 100, low: 100, volume: 0 })), now);
    expect(flat.rows.every(r => r.value == null || Number.isFinite(r.value))).toBe(true);
    expect(flat.plan).toBeNull(); expect(flat.score).toBeNull();
  });
  it('normalizes seconds, deduplicates days and excludes malformed and not-yet-closed candles', () => {
    const valid = candles([100, 101]);
    const today = { ...valid[0], time: Date.UTC(2026, 8, 27, 4) };
    const input = [valid[1], { ...valid[0], time: valid[0].time / 1000 }, valid[1], { ...valid[0], high: 90 }, today, { ...today, time: now + 86400000 }];
    const before18 = closedTechnicalBars(input, Date.UTC(2026, 8, 27, 12, 59));
    expect(before18).toEqual(valid);
    expect(closedTechnicalBars(input, now)).toEqual([...valid, today]);
  });
  it('keeps exact category boundaries and the equal-group reference example', () => {
    expect([-1, -.5, -.1, 0, .1, .5, 1].map(technicalVerdict)).toEqual(['STRONG SELL','SELL','NEUTRAL','NEUTRAL','NEUTRAL','BUY','STRONG BUY']);
    const signals = (group: 'averages'|'oscillators', names: string[]): TechnicalReading[] => names.map(signal => ({ group, name: signal, value: 1, signal: signal as TechnicalReading['signal'], rule: '' }));
    const ma = summarizeTechnicalGroup(signals('averages', [...Array(14).fill('SELL'), 'NEUTRAL']), 'averages');
    const osc = summarizeTechnicalGroup(signals('oscillators', ['SELL', 'SELL', ...Array(8).fill('NEUTRAL'), 'BUY']), 'oscillators');
    expect((ma.score! + osc.score!) / 2).toBeCloseTo(-.5121212121, 9);
    expect(technicalVerdict((ma.score! + osc.score!) / 2)).toBe('STRONG SELL');
  });
  it('uses true range and produces consistent 1R, 2R and 3R targets', () => {
    const a = computeTechnicalAnalysis(candles(Array.from({ length: 220 }, (_, i) => 100 + i)), now), p = a.plan!;
    expect(p.atr).toBe(4); expect(p.support).toBe(298); expect(p.resistance).toBe(321);
    expect(p.entryLow).toBe(317); expect(p.entryHigh).toBe(319); expect(p.stop).toBe(298);
    expect(p.targets).toEqual([340, 361, 382]); expect(p.riskPct).toBeCloseTo(21 / 319 * 100, 9);
    expect(p.rewardPct).toEqual([21, 42, 63].map(n => n / 319 * 100));
  });
  it('exports all 26 rows, full methodology, all targets and the disclaimer without portfolio data', () => {
    const technical = computeTechnicalAnalysis(candles(prices), now);
    const snapshot = technicalSnapshotStock({ symbol: 'TEST', current: 500, changePct: 1, volume: 1000, technical });
    expect(snapshot.sections.filter(s => s.kind === 'averages' || s.kind === 'oscillators').flatMap(s => s.rows)).toHaveLength(26);
    expect(snapshot.price).toBe(technical.summary.lastPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    expect(snapshot.sections.flatMap(s => s.rows).filter(r => r.label.startsWith('Take profit'))).toHaveLength(3);
    const notes = snapshot.notes!.flatMap(n => n.paragraphs).join(' ');
    expect(notes).toContain('Do your own research'); expect(notes).toContain('equal weight'); expect(notes).toContain('1R = reference');
    expect(JSON.stringify(snapshot)).not.toMatch(/email|quantity|account|apiKey/);
  });
});
