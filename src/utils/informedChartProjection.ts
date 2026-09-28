import type { OhlcBar } from '../services/psxData';
import { closedTechnicalBars } from './technicalRatings';
import { computeChartProjection, projectionQuantile, type ProjectionHorizon, type ProjectionPoint, type ProjectionResult, type ProjectionValidation } from './chartProjection';
import { computeProjectionFeatures, projectionFeatureDistance, type ProjectionFeatures } from './projectionFeatures';

const MAX_POOL = 750;
const MIN_POOL = 200;
const WARMUP = 199;
const MAX_REPLAYS = 40;
const MIN_REPLAYS = 30;

/** All training outcomes end at or before `at`; distance sees causal features only. */
export function matchedProjectionPoint(bars: OhlcBar[], features: ProjectionFeatures, at: number, horizon: number, matched: boolean): ProjectionPoint | null {
  if (!(features.atr[at] > 0)) return null;
  const pool: { origin: number; move: number; distance: number }[] = [];
  for (let origin = Math.max(matched ? WARMUP : 13, at - horizon - MAX_POOL + 1); origin <= at - horizon; origin++) {
    if (!(features.atr[origin] > 0)) continue;
    const distance = matched ? projectionFeatureDistance(features.vectors[at], features.vectors[origin]) : 0;
    const move = (bars[origin + horizon].close - bars[origin].close) / features.atr[origin];
    if (Number.isFinite(distance) && Number.isFinite(move)) pool.push({ origin, distance, move });
  }
  if (pool.length < MIN_POOL) return null;
  // Fixed rule: nearest 20%, at least 60 windows. No tuning against replay outcomes.
  const selected = matched ? pool.sort((a, b) => a.distance - b.distance || a.origin - b.origin).slice(0, Math.max(60, Math.floor(pool.length * .2))) : pool;
  const moves = selected.map(p => p.move).sort((a, b) => a - b);
  const prices = [.1, .25, .5, .75, .9].map(p => bars[at].close + features.atr[at] * projectionQuantile(moves, p));
  if (prices.some(p => !Number.isFinite(p) || p <= 0)) return null;
  const [lower, innerLower, median, innerUpper, upper] = prices;
  return { session: horizon, lower, innerLower, median, innerUpper, upper, samples: selected.length, firstOrigin: bars[Math.min(...selected.map(p => p.origin))].time };
}
const intervalScore = (p: ProjectionPoint, actual: number) => p.upper - p.lower + 10 * Math.max(0, p.lower - actual, actual - p.upper);

/** Paired rolling-origin diagnostics. h-spaced origins avoid overlapping outcomes.
 * These cases select the model; they are not an independent post-selection test. */
export function evaluateProjectionModels(bars: OhlcBar[], features: ProjectionFeatures, horizon: number): ProjectionValidation {
  let count = 0, firstTime: number | null = null, lastTime: number | null = null;
  let iError = 0, bError = 0, iCoverage = 0, bCoverage = 0, iScore = 0, bScore = 0;
  for (let at = bars.length - 1 - horizon; at >= WARMUP + MIN_POOL + horizon - 1 && count < MAX_REPLAYS; at -= horizon) {
    const informed = matchedProjectionPoint(bars, features, at, horizon, true), base = matchedProjectionPoint(bars, features, at, horizon, false);
    if (!informed || !base) continue;
    const actual = bars[at + horizon].close, unit = bars[at].close / 100;
    iError += Math.abs(actual - informed.median) / unit; bError += Math.abs(actual - base.median) / unit;
    iCoverage += Number(actual >= informed.lower && actual <= informed.upper); bCoverage += Number(actual >= base.lower && actual <= base.upper);
    iScore += intervalScore(informed, actual) / unit; bScore += intervalScore(base, actual) / unit;
    firstTime = bars[at].time; lastTime ??= bars[at].time; count++;
  }
  return { cases: count, firstTime, lastTime, horizon, indicatorMaePct: count ? iError / count : null, baselineMaePct: count ? bError / count : null, indicatorCoveragePct: count ? iCoverage / count * 100 : null, baselineCoveragePct: count ? bCoverage / count * 100 : null, indicatorIntervalScorePct: count ? iScore / count : null, baselineIntervalScorePct: count ? bScore / count : null };
}

export function computeInformedChartProjection(raw: OhlcBar[], horizon: ProjectionHorizon, now = Date.now()): ProjectionResult {
  const bars = closedTechnicalBars(raw, now);
  const baseline = computeChartProjection(bars, horizon, now);
  if (!baseline.data) return baseline;
  const features = computeProjectionFeatures(bars), at = bars.length - 1;
  const validation = evaluateProjectionModels(bars, features, horizon);
  const matched = Array.from({ length: horizon }, (_, i) => matchedProjectionPoint(bars, features, at, i + 1, true));
  const eligible = validation.cases >= MIN_REPLAYS && matched.every(Boolean);
  // Require both point error and interval score to improve. Wider bands alone do not win.
  const useMatched = eligible && validation.indicatorMaePct! < validation.baselineMaePct! && validation.indicatorIntervalScorePct! < validation.baselineIntervalScorePct!;
  const reason = !matched.every(Boolean) ? 'Not enough comparable historical setups. Historical range retained.'
    : validation.cases < MIN_REPLAYS ? `Only ${validation.cases} usable replays; at least ${MIN_REPLAYS} are needed before choosing the indicator model. Historical range retained.`
    : useMatched ? 'Indicator matching reduced both median error and range error in the recent replay. Provisional choice; future accuracy is unproven.'
    : 'Indicator matching did not improve both error measures in the recent replay. Historical range retained.';
  return { data: { ...baseline.data, points: useMatched ? matched as ProjectionPoint[] : baseline.data.points,
    evidence: { method: useMatched ? 'indicator-matched-v2' : 'historical-baseline', reason, context: features.context, validation, matchedWindows: matched.at(-1)?.samples ?? 0 } } };
}
