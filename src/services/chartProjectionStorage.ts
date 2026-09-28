import type { ChartProjection } from '../utils/chartProjection';
import type { OhlcBar } from './psxData';
import { closedTechnicalBars } from '../utils/technicalRatings';

const KEY = 'psx_saved_chart_projections_v1';
export const PROJECTIONS_CHANGED = 'psx-projections-changed';
export const PROJECTIONS_RESTORED = 'psx-projections-restored';
export interface SavedProjection {
  id: string;
  symbol: string;
  savedAt: number;
  model: 'atr-empirical-v1' | 'indicator-tested-v2';
  data: ChartProjection;
}
const positive = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;
const timestamp = (n: unknown): n is number => positive(n) && n < 8.64e15;
function validEvidence(e: any): boolean {
  if (!e || !['indicator-matched-v2', 'historical-baseline'].includes(e.method) || typeof e.reason !== 'string') return false;
  const c = e.context, v = e.validation;
  if (!c || ![c.recent, c.volume, c.trend].every(s => typeof s === 'string') || !Array.isArray(c.patterns) || c.patterns.length > 20 || !c.patterns.every((s: unknown) => typeof s === 'string') || !Array.isArray(c.groups) || c.groups.length !== 7 || !c.groups.every((s: unknown) => typeof s === 'string')) return false;
  if (!Array.isArray(c.readings) || c.readings.length > 40 || !c.readings.every((r: any) => r && typeof r.name === 'string' && (r.value === null || Number.isFinite(r.value)))) return false;
  if (![c.availableFeatures, c.totalFeatures, e.matchedWindows].every(n => Number.isFinite(n) && n >= 0)) return false;
  if (!v || !Number.isInteger(v.cases) || v.cases < 0 || v.cases > 40 || ![1, 3, 5, 8].includes(v.horizon)) return false;
  if (![v.firstTime, v.lastTime].every(t => t === null || timestamp(t))) return false;
  return [v.indicatorMaePct, v.baselineMaePct, v.indicatorCoveragePct, v.baselineCoveragePct, v.indicatorIntervalScorePct, v.baselineIntervalScorePct].every(n => n === null || Number.isFinite(n) && n >= 0);
}
export function normalizeSavedProjections(raw: unknown): SavedProjection[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 100).filter((s): s is SavedProjection => {
    if (!s || typeof s !== 'object' || !['atr-empirical-v1', 'indicator-tested-v2'].includes(s.model) || typeof s.id !== 'string' || !s.id.length || s.id.length > 100 || typeof s.symbol !== 'string' || !/^[A-Z0-9._-]{1,30}$/.test(s.symbol) || !timestamp(s.savedAt)) return false;
    const d = s.data;
    if (!d || !timestamp(d.referenceTime) || d.referenceTime > s.savedAt || !positive(d.referenceClose) || !positive(d.atr) || !Array.isArray(d.points) || ![1, 3, 5, 8].includes(d.points.length)) return false;
    if (d.evidence != null && !validEvidence(d.evidence)) return false;
    if (s.model === 'indicator-tested-v2' && !d.evidence) return false;
    const minimum = d.evidence?.method === 'indicator-matched-v2' ? 60 : 200;
    return d.points.every((p: any, i: number) => p && p.session === i + 1 && Number.isInteger(p.samples) && p.samples >= minimum && p.samples <= 750 && positive(p.firstOrigin) && p.firstOrigin <= d.referenceTime && [p.lower, p.innerLower, p.median, p.innerUpper, p.upper].every(positive) && p.lower <= p.innerLower && p.innerLower <= p.median && p.median <= p.innerUpper && p.innerUpper <= p.upper);
  });
}
export function loadSavedProjections(): SavedProjection[] {
  try { return normalizeSavedProjections(JSON.parse(localStorage.getItem(KEY) || '[]')); }
  catch { return []; }
}
export function makeSavedProjection(symbol: string, data: ChartProjection, savedAt = Date.now()): SavedProjection {
  return { id: crypto.randomUUID(), symbol: symbol.toUpperCase(), savedAt, model: data.evidence ? 'indicator-tested-v2' : 'atr-empirical-v1', data: JSON.parse(JSON.stringify(data)) };
}
export function saveChartProjection(symbol: string, data: ChartProjection): SavedProjection {
  // Never replace unreadable records silently or report success when storage is full.
  const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
  const records = normalizeSavedProjections(raw);
  if (!Array.isArray(raw) || records.length !== raw.length) throw new Error('Saved projections could not be read. Download a backup before changing them.');
  if (records.length >= 100) throw new Error('You have 100 saved projections. Download and remove an older one before saving another.');
  const saved = makeSavedProjection(symbol, data);
  if (!normalizeSavedProjections([saved]).length) throw new Error('This range cannot be saved. Refresh the daily chart first.');
  localStorage.setItem(KEY, JSON.stringify([saved, ...records]));
  window.dispatchEvent(new Event(PROJECTIONS_CHANGED));
  return saved;
}
export function removeSavedProjection(id: string): void {
  localStorage.setItem(KEY, JSON.stringify(loadSavedProjections().filter(s => s.id !== id)));
  window.dispatchEvent(new Event(PROJECTIONS_CHANGED));
}
export function applyCloudProjections(raw: unknown): void {
  const records = normalizeSavedProjections(raw);
  if (!Array.isArray(raw) || records.length !== raw.length) return;
  localStorage.setItem(KEY, JSON.stringify(records));
  window.dispatchEvent(new Event(PROJECTIONS_RESTORED));
}

export function compareSavedProjection(saved: SavedProjection, raw: OhlcBar[], now = Date.now()) {
  const bars = closedTechnicalBars(raw, now);
  const anchor = bars.findIndex(b => b.time === saved.data.referenceTime);
  const changed = anchor >= 0 && Math.abs(bars[anchor].close - saved.data.referenceClose) > Math.max(.0001, saved.data.referenceClose * .00001);
  const reason = anchor < 0 ? 'Load daily history containing the reference candle to compare.' : changed ? 'The reference close has changed in the price feed. Check for corrections or corporate actions before comparing.' : null;
  const rows = saved.data.points.map(point => {
    const actual = reason ? null : bars[anchor + point.session] ?? null;
    // Flag outcomes already completed at save time; they are not forward evaluation.
    const closeTime = actual ? Date.parse(new Date(actual.time + 5 * 3600000).toISOString().slice(0, 10) + 'T13:00:00Z') : 0;
    const beforeSave = !!actual && closeTime <= saved.savedAt;
    return { point, actual, beforeSave,
      insideWide: actual ? actual.close >= point.lower && actual.close <= point.upper : null,
      insideInner: actual ? actual.close >= point.innerLower && actual.close <= point.innerUpper : null,
      medianError: actual ? actual.close - point.median : null };
  });
  return { rows, reason };
}
