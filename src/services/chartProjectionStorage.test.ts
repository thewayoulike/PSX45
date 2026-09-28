import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computeChartProjection } from '../utils/chartProjection';
import { makeSavedProjection, compareSavedProjection, loadSavedProjections, saveChartProjection, normalizeSavedProjections, applyCloudProjections, removeSavedProjection, PROJECTIONS_CHANGED, PROJECTIONS_RESTORED } from './chartProjectionStorage';
import { preparePortfolioAccount } from '../utils/localAccount';

const bars = Array.from({ length: 308 }, (_, i) => ({ time: Date.UTC(2025, 0, i + 1, 4), open: 100 + i, high: 102 + i, low: 98 + i, close: 100 + i, volume: 1000 }));
const data = () => computeChartProjection(bars.slice(0, 300), 8, bars[299].time + 10 * 3600000).data!;
const savedAt = bars[299].time + 11 * 3600000;
let values: Map<string, string>, events: string[];
beforeEach(() => {
  values = new Map(); events = [];
  vi.stubGlobal('localStorage', { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v), removeItem: (k: string) => values.delete(k), key: (i: number) => [...values.keys()][i], get length() { return values.size; } });
  vi.stubGlobal('window', { dispatchEvent: (e: Event) => events.push(e.type) });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('saved projection records and comparison', () => {
  it('captures a deep copy and compares only subsequent completed closes', () => {
    const original = data(), saved = makeSavedProjection('OGDC', original, savedAt), frozen = JSON.stringify(saved);
    original.points[0].median = 9999;
    const result = compareSavedProjection(saved, bars, bars[302].time + 10 * 3600000);
    expect(result.rows.filter(r => r.actual)).toHaveLength(3);
    expect(result.rows[0].actual!.close).toBe(bars[300].close);
    expect(result.rows[0].insideWide).toBe(true);
    expect(result.rows[0].medianError).toBeCloseTo(0);
    expect(result.rows[7].actual).toBeNull();
    expect(JSON.stringify(saved)).toBe(frozen);
  });
  it('reports outside-band closes and excludes already known outcomes from forward evaluation', () => {
    const saved = makeSavedProjection('OGDC', data(), bars[301].time + 10 * 3600000);
    const changed = bars.map((b, i) => i === 302 ? { ...b, close: 700, high: 705 } : b);
    const result = compareSavedProjection(saved, changed, bars[307].time + 10 * 3600000);
    expect(result.rows.slice(0, 2).every(r => r.beforeSave)).toBe(true);
    expect(result.rows[2].beforeSave).toBe(false);
    expect(result.rows[2].insideWide).toBe(false);
  });
  it('withholds comparison if the original reference disappears or gets adjusted', () => {
    const saved = makeSavedProjection('OGDC', data(), savedAt);
    expect(compareSavedProjection(saved, bars.slice(300)).reason).toContain('reference candle');
    const changed = bars.map((b, i) => i === 299 ? { ...b, close: b.close + 1 } : b);
    expect(compareSavedProjection(saved, changed).reason).toContain('changed');
  });
  it('restores exactly through the Drive payload and emits restore rather than save events', () => {
    const saved = saveChartProjection('OGDC', data());
    const backup = JSON.parse(JSON.stringify(loadSavedProjections()));
    expect(events).toEqual([PROJECTIONS_CHANGED]);
    removeSavedProjection(saved.id); applyCloudProjections(backup);
    expect(loadSavedProjections()).toEqual([saved]);
    expect(events.at(-1)).toBe(PROJECTIONS_RESTORED);
  });
  it('does not claim success or change stored records on quota failure', () => {
    const saved = saveChartProjection('OGDC', data()); events.length = 0;
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    expect(() => saveChartProjection('FFC', data())).toThrow('quota');
    expect(loadSavedProjections()).toEqual([saved]); expect(events).toEqual([]);
  });
  it('rejects malformed and non-finite saved ranges and preserves them on failed save', () => {
    const saved = makeSavedProjection('OGDC', data(), savedAt); saved.data.points[0].lower = Infinity;
    expect(normalizeSavedProjections([null, saved])).toEqual([]);
    values.set('psx_saved_chart_projections_v1', '[null]');
    expect(() => saveChartProjection('OGDC', data())).toThrow('could not be read');
    expect(values.get('psx_saved_chart_projections_v1')).toBe('[null]');
  });
  it('archives records on account switch without exposing them to the new account', () => {
    preparePortfolioAccount('one@example.com'); const saved = saveChartProjection('OGDC', data());
    expect(preparePortfolioAccount('two@example.com')).toBe(true);
    expect(loadSavedProjections()).toEqual([]);
    expect([...values].find(([key]) => key.startsWith('psx_cloud_recovery:'))![1]).toContain(saved.id);
  });
});
