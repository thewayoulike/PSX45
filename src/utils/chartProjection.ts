import type { OhlcBar } from '../services/psxData';
import { computeChartAtr } from './chartAtr';
import { closedTechnicalBars } from './technicalRatings';
import type { ProjectionContext } from './projectionFeatures';

export const PROJECTION_HORIZONS = [1, 3, 5, 8] as const;
export type ProjectionHorizon = typeof PROJECTION_HORIZONS[number];
const MIN_WINDOWS = 200;
const MAX_WINDOWS = 750;

export interface ProjectionPoint {
  session: number;
  lower: number;
  innerLower: number;
  median: number;
  innerUpper: number;
  upper: number;
  samples: number;
  firstOrigin: number;
}
export interface ChartProjection {
  referenceTime: number;
  referenceClose: number;
  atr: number;
  points: ProjectionPoint[];
  evidence?: {
    method: 'indicator-matched-v2' | 'historical-baseline';
    reason: string;
    context: ProjectionContext;
    validation: ProjectionValidation;
    matchedWindows: number;
  };
}
export interface ProjectionValidation {
  cases: number;
  firstTime: number | null;
  lastTime: number | null;
  horizon: number;
  indicatorMaePct: number | null;
  baselineMaePct: number | null;
  indicatorCoveragePct: number | null;
  baselineCoveragePct: number | null;
  indicatorIntervalScorePct: number | null;
  baselineIntervalScorePct: number | null;
}
export type ProjectionResult = { data: ChartProjection; reason?: never } | { data: null; reason: string };

/** Linear interpolation between adjacent ordered observations (type-7 quantile). */
export function projectionQuantile(sorted: number[], p: number): number {
  const index = (sorted.length - 1) * p, lo = Math.floor(index), weight = index - lo;
  return sorted[lo] * (1 - weight) + sorted[Math.ceil(index)] * weight;
}

/**
 * Descriptive, pointwise closing-price ranges, NOT calibrated forecast probabilities.
 * Each historical h-session move is scaled by ATR known at its own origin.
 * Only outcomes ending on/before the latest completed candle enter the sample.
 * No regime multipliers, pooled stock samples, or claimed backtest accuracy.
 */
export function computeChartProjection(raw: OhlcBar[], horizon: ProjectionHorizon, now = Date.now()): ProjectionResult {
  if (!PROJECTION_HORIZONS.includes(horizon)) return { data: null, reason: 'Choose 1, 3, 5 or 8 sessions.' };
  const bars = closedTechnicalBars(raw, now);
  const last = bars.length - 1;
  if (bars.length < 13 + MIN_WINDOWS + horizon) {
    return { data: null, reason: `More daily history is needed: at least ${13 + MIN_WINDOWS + horizon} completed candles for this range (${bars.length} available).` };
  }
  const atr = computeChartAtr(bars, 14), currentAtr = atr[last], reference = bars[last];
  if (!(currentAtr > 0) || !Number.isFinite(currentAtr)) return { data: null, reason: 'A usable daily trading range is not available for this stock.' };
  const points: ProjectionPoint[] = [];
  for (let session = 1; session <= horizon; session++) {
    const moves: number[] = [];
    let firstOrigin = 0;
    const start = Math.max(13, last - session - MAX_WINDOWS + 1);
    for (let origin = start; origin <= last - session; origin++) {
      if (!(atr[origin] > 0)) continue;
      const move = (bars[origin + session].close - bars[origin].close) / atr[origin];
      if (Number.isFinite(move)) { if (!moves.length) firstOrigin = bars[origin].time; moves.push(move); }
    }
    if (moves.length < MIN_WINDOWS) return { data: null, reason: `Not enough usable historical windows for ${session} sessions (${moves.length} of ${MIN_WINDOWS} required).` };
    moves.sort((a, b) => a - b);
    const prices = [.1, .25, .5, .75, .9].map(p => reference.close + currentAtr * projectionQuantile(moves, p));
    // Do not silently clamp impossible negative prices into a misleading interval.
    if (prices.some(p => !Number.isFinite(p) || p <= 0)) return { data: null, reason: 'Historical price changes produce an unreliable range. Check for stock splits, price adjustments or missing history.' };
    const [lower, innerLower, median, innerUpper, upper] = prices;
    points.push({ session, lower, innerLower, median, innerUpper, upper, samples: moves.length, firstOrigin });
  }
  return { data: { referenceTime: reference.time, referenceClose: reference.close, atr: currentAtr, points } };
}
