import type { OhlcBar } from '../services/psxData';
import { detectCandlePatterns, type CandlePatternDirection, type CandlePatternMarker, type CandlePatternType } from './chartExtras';

export const CANDLE_PATTERN_LABELS: Record<CandlePatternType, string> = {
  bullishEngulfing: 'Bullish engulfing',
  hammer: 'Hammer',
  doji: 'Doji',
  bearishEngulfing: 'Bearish engulfing',
};

export type CandlePatternFilter = 'bullish' | 'bearish' | 'any' | CandlePatternType;

export const CANDLE_PATTERN_FILTERS: { value: CandlePatternFilter; label: string }[] = [
  { value: 'bullish', label: 'Any bullish pattern' },
  { value: 'bullishEngulfing', label: 'Bullish engulfing' },
  { value: 'hammer', label: 'Hammer' },
  { value: 'doji', label: 'Doji' },
  { value: 'bearishEngulfing', label: 'Bearish engulfing' },
  { value: 'bearish', label: 'Any bearish pattern' },
  { value: 'any', label: 'Any pattern' },
];

/** Sessions after the pattern used to judge whether price rose. */
export const PATTERN_HORIZON_SESSIONS = 5;
/** About one year of PSX sessions. */
export const PATTERN_LOOKBACK_SESSIONS = 250;
/** Fewer past occurrences than this are shown but not judged. */
export const MIN_PATTERN_SAMPLES = 5;

export interface RiseRecord {
  /** Past cases with a full forward window. */
  samples: number;
  rose: number;
  /** Share of cases where the close was higher after the horizon; null without samples. */
  risePct: number | null;
  /** Average close-to-close change over the horizon, before costs; null without samples. */
  avgMovePct: number | null;
}

export interface CandleScanHit {
  type: CandlePatternType;
  direction: CandlePatternDirection;
  time: number;
  /** 0 = the latest candle. */
  sessionsAgo: number;
  /** How this pattern played out on this stock over the lookback. */
  record: RiseRecord;
}

export interface CandleScanResult {
  hits: CandleScanHit[];
  /** How often any session on this stock was followed by a rise: the bar to beat. */
  baseline: RiseRecord;
  candleTime: number | null;
}

export const matchesPatternFilter = (m: { type: CandlePatternType; direction: CandlePatternDirection }, filter: CandlePatternFilter) =>
  filter === 'any' || filter === m.direction || filter === m.type;

function riseRecord(bars: OhlcBar[], indexes: number[], horizon: number): RiseRecord {
  let samples = 0, rose = 0, sum = 0;
  for (const i of indexes) {
    const from = bars[i]?.close, to = bars[i + horizon]?.close;
    if (!(from > 0) || !(to > 0)) continue;
    const move = (to / from - 1) * 100;
    samples++;
    sum += move;
    if (move > 0) rose++;
  }
  return {
    samples,
    rose,
    risePct: samples ? (rose / samples) * 100 : null,
    avgMovePct: samples ? sum / samples : null,
  };
}

/** Indexes in the lookback that have a full forward window. */
function judgedRange(n: number, lookback: number, horizon: number) {
  return { from: Math.max(0, n - 1 - lookback), to: n - 1 - horizon };
}

export function patternRiseRecord(
  bars: OhlcBar[],
  markers: CandlePatternMarker[],
  type: CandlePatternType,
  { lookback = PATTERN_LOOKBACK_SESSIONS, horizon = PATTERN_HORIZON_SESSIONS } = {},
): RiseRecord {
  const { from, to } = judgedRange(bars.length, lookback, horizon);
  return riseRecord(bars, markers.filter((m) => m.type === type && m.index >= from && m.index <= to).map((m) => m.index), horizon);
}

/** Finds patterns on the latest candles and scores each against this stock's past year. */
export function scanCandlePatterns(
  bars: OhlcBar[],
  {
    within = 1,
    filter = 'any' as CandlePatternFilter,
    lookback = PATTERN_LOOKBACK_SESSIONS,
    horizon = PATTERN_HORIZON_SESSIONS,
  } = {},
): CandleScanResult {
  const n = bars.length;
  const markers = detectCandlePatterns(bars);
  const { from, to } = judgedRange(n, lookback, horizon);
  const all: number[] = [];
  for (let i = from; i <= to; i++) all.push(i);
  const hits = markers
    .filter((m) => m.index >= n - within && matchesPatternFilter(m, filter))
    .map((m) => ({
      type: m.type,
      direction: m.direction,
      time: m.time,
      sessionsAgo: n - 1 - m.index,
      record: patternRiseRecord(bars, markers, m.type, { lookback, horizon }),
    }));
  return { hits, baseline: riseRecord(bars, all, horizon), candleTime: n ? bars[n - 1].time : null };
}
