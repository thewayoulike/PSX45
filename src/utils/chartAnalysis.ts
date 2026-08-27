import type { ChartAnalysisPoint, OhlcBar } from '../services/psxData';

function smaAt(values: number[], i: number, period: number): number | undefined {
  if (i < period - 1) return undefined;
  let sum = 0;
  for (let j = i - period + 1; j <= i; j++) sum += values[j];
  return sum / period;
}

function emaAt(values: number[], i: number, period: number, cache: Map<string, number>): number | undefined {
  const key = `${period}-${i}`;
  if (cache.has(key)) return cache.get(key);
  if (i < period - 1) return undefined;
  if (i === period - 1) {
    let seed = 0;
    for (let j = 0; j < period; j++) seed += values[j];
    const v = seed / period;
    cache.set(key, v);
    return v;
  }
  const prev = emaAt(values, i - 1, period, cache);
  if (prev == null) return undefined;
  const k = 2 / (period + 1);
  const v = values[i] * k + prev * (1 - k);
  cache.set(key, v);
  return v;
}

function rsiAt(values: number[], i: number, period: number): number | undefined {
  if (i < period) return undefined;
  let gains = 0;
  let losses = 0;
  for (let j = 1; j <= period; j++) {
    const d = values[j] - values[j - 1];
    if (d >= 0) gains += d;
    else losses -= d;
  }
  let avgG = gains / period;
  let avgL = losses / period;
  for (let j = period + 1; j <= i; j++) {
    const d = values[j] - values[j - 1];
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgG = (avgG * (period - 1) + g) / period;
    avgL = (avgL * (period - 1) + l) / period;
  }
  if (avgL === 0) return 100;
  return 100 - 100 / (1 + avgG / avgL);
}

function periodsForBarCount(n: number, monthly: boolean) {
  if (!monthly) return { bb: 20, rsi: 14, macdFast: 12, macdSlow: 26, macdSig: 9 };
  if (n >= 26) return { bb: 20, rsi: 14, macdFast: 12, macdSlow: 26, macdSig: 9 };
  if (n >= 14) return { bb: 10, rsi: 7, macdFast: 5, macdSlow: 10, macdSig: 4 };
  return { bb: Math.max(3, n - 1), rsi: Math.max(3, n - 1), macdFast: 3, macdSlow: 5, macdSig: 2 };
}

/** BB + RSI + MACD on OHLC bars (used for monthly candle overlays). */
export function computeChartAnalysisFromBars(
  bars: OhlcBar[],
  opts?: { monthly?: boolean }
): ChartAnalysisPoint[] {
  if (bars.length < 3) return [];
  const monthly = opts?.monthly ?? false;
  const closes = bars.map((b) => b.close);
  const { bb, rsi: rsiPeriod, macdFast, macdSlow, macdSig } = periodsForBarCount(closes.length, monthly);
  const emaCache = new Map<string, number>();
  const macdLine: number[] = new Array(closes.length).fill(NaN);

  for (let i = 0; i < closes.length; i++) {
    const eFast = emaAt(closes, i, macdFast, emaCache);
    const eSlow = emaAt(closes, i, macdSlow, emaCache);
    if (eFast != null && eSlow != null) macdLine[i] = eFast - eSlow;
  }

  const signalLine: number[] = new Array(closes.length).fill(NaN);
  for (let i = 0; i < closes.length; i++) {
    if (!Number.isFinite(macdLine[i])) continue;
    const slice: number[] = [];
    for (let j = 0; j <= i; j++) {
      if (Number.isFinite(macdLine[j])) slice.push(macdLine[j]);
    }
    if (slice.length < macdSig) continue;
    let sig = 0;
    for (let j = 0; j < macdSig; j++) sig += slice[j];
    sig /= macdSig;
    const k = 2 / (macdSig + 1);
    for (let j = macdSig; j < slice.length; j++) sig = slice[j] * k + sig * (1 - k);
    signalLine[i] = sig;
  }

  const points: ChartAnalysisPoint[] = [];
  for (let i = 0; i < bars.length; i++) {
    const middle = smaAt(closes, i, bb);
    if (middle == null) continue;

    let std = 0;
    for (let j = i - bb + 1; j <= i; j++) std += (closes[j] - middle) ** 2;
    std = Math.sqrt(std / bb);
    const upper = middle + 2 * std;
    const lower = middle - 2 * std;
    const rsiVal = rsiAt(closes, i, rsiPeriod);
    if (rsiVal == null || !Number.isFinite(rsiVal)) continue;

    const pt: ChartAnalysisPoint = {
      time: bars[i].time,
      close: closes[i],
      upper,
      middle,
      lower,
      rsi: rsiVal,
    };
    if (Number.isFinite(macdLine[i]) && Number.isFinite(signalLine[i])) {
      pt.macd = macdLine[i];
      pt.macdSignal = signalLine[i];
      pt.macdHist = macdLine[i] - signalLine[i];
    }
    points.push(pt);
  }
  return points;
}
