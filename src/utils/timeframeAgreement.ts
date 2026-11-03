import type { OhlcBar } from '../services/psxData';

export type Timeframe = '1H' | '1D' | '1W';
export type Trend = 'up' | 'down' | 'sideways';

export const TIMEFRAME_LABELS: Record<Timeframe, string> = { '1H': 'Hourly', '1D': 'Daily', '1W': 'Weekly' };

const FAST = 20;
const SLOW = 50;

export interface FrameTrend {
  timeframe: Timeframe;
  /** null when there are too few candles to judge. */
  trend: Trend | null;
  close: number | null;
  emaFast: number | null;
  emaSlow: number | null;
  bars: number;
  /** Time of the last candle used. */
  asOf: number | null;
}

export interface TimeframeAgreement {
  frames: FrameTrend[];
  /** Frames with a trend. */
  judged: number;
  up: number;
  down: number;
  /** All judged frames (at least two) point the same way. */
  aligned: Trend | null;
  /** Short badge text, e.g. "3 of 3 up". */
  label: string;
  /** One sentence for the user. */
  note: string;
}

const PK_OFFSET_MS = 5 * 3600000;
const DAY_MS = 86400000;

const ema = (values: number[], period: number): number | null => {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let out = 0;
  for (let i = 0; i < period; i++) out += values[i];
  out /= period;
  for (let i = period; i < values.length; i++) out = values[i] * k + out * (1 - k);
  return out;
};

/** Up: close above the 20 EMA and the 20 EMA above the 50 EMA. Down: both below. Otherwise sideways. */
export function frameTrend(timeframe: Timeframe, bars: OhlcBar[]): FrameTrend {
  const closes = bars.map((b) => b.close).filter((c) => c > 0);
  const close = closes.length ? closes[closes.length - 1] : null;
  const emaFast = ema(closes, FAST);
  const emaSlow = ema(closes, SLOW);
  let trend: Trend | null = null;
  if (close != null && emaFast != null && emaSlow != null) {
    if (close > emaFast && emaFast > emaSlow) trend = 'up';
    else if (close < emaFast && emaFast < emaSlow) trend = 'down';
    else trend = 'sideways';
  }
  return { timeframe, trend, close, emaFast, emaSlow, bars: closes.length, asOf: bars.length ? bars[bars.length - 1].time : null };
}

/** Groups daily candles into Monday-to-Friday weeks on the Pakistan calendar. */
export function toWeeklyBars(daily: OhlcBar[]): OhlcBar[] {
  const weeks: OhlcBar[] = [];
  let key = NaN;
  for (const b of daily) {
    const day = Math.floor((b.time + PK_OFFSET_MS) / DAY_MS);
    // 1970-01-01 was a Thursday; shift so weeks start on Monday.
    const week = Math.floor((day + 3) / 7);
    const last = weeks[weeks.length - 1];
    if (week !== key || !last) {
      weeks.push({ ...b });
      key = week;
    } else {
      last.high = Math.max(last.high, b.high);
      last.low = Math.min(last.low, b.low);
      last.close = b.close;
      last.time = b.time;
      last.volume = (last.volume || 0) + (b.volume || 0);
    }
  }
  return weeks;
}

const NAMES: Record<Timeframe, string> = { '1H': 'hourly', '1D': 'daily', '1W': 'weekly' };
const list = (names: string[]) => names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

export function summarizeAgreement(frames: FrameTrend[]): TimeframeAgreement {
  const judged = frames.filter((f) => f.trend);
  const up = judged.filter((f) => f.trend === 'up').length;
  const down = judged.filter((f) => f.trend === 'down').length;
  const n = judged.length;
  const aligned = n >= 2 && (up === n || down === n) ? (up === n ? 'up' : 'down') : n >= 2 && judged.every((f) => f.trend === 'sideways') ? 'sideways' : null;
  const label = n === 0 ? 'Not enough data'
    : up > down ? `${up} of ${n} up`
    : down > up ? `${down} of ${n} down`
    : up > 0 ? 'Mixed' : 'Sideways';
  const missing = frames.filter((f) => !f.trend).map((f) => NAMES[f.timeframe]);
  const missingNote = missing.length ? ` Not enough ${list(missing)} candles to judge.` : '';
  let note: string;
  if (n === 0) note = 'Not enough candles on any timeframe to judge the trend.';
  else if (aligned === 'up') note = `Uptrend on the ${list(judged.map((f) => NAMES[f.timeframe]))} chart${n > 1 ? 's' : ''}: the timeframes agree.`;
  else if (aligned === 'down') note = `Downtrend on the ${list(judged.map((f) => NAMES[f.timeframe]))} chart${n > 1 ? 's' : ''}. A buy here goes against every trend checked.`;
  else if (aligned === 'sideways') note = 'No clear trend on any timeframe checked.';
  else {
    const against = judged.filter((f) => f.trend === 'down').map((f) => NAMES[f.timeframe]);
    const longest = judged[judged.length - 1];
    note = longest.trend === 'down'
      ? `The ${NAMES[longest.timeframe]} trend is down, so a buy here goes against the bigger trend.`
      : against.length
        ? `Mixed: the ${list(against)} trend is down while the ${NAMES[longest.timeframe]} trend is ${longest.trend}.`
        : `Mixed: not every timeframe is trending up.`;
  }
  return { frames, judged: n, up, down, aligned, label, note: note + missingNote };
}

/** Daily candles give the daily and weekly frames; hourly candles are optional. */
export function timeframeAgreement(daily: OhlcBar[], hourly?: OhlcBar[] | null): TimeframeAgreement {
  const frames: FrameTrend[] = [];
  if (hourly !== undefined) frames.push(frameTrend('1H', hourly ?? []));
  frames.push(frameTrend('1D', daily), frameTrend('1W', toWeeklyBars(daily)));
  return summarizeAgreement(frames);
}
