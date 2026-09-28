import type { OhlcBar } from '../services/psxData';
import { computeChartAtr } from './chartAtr';
import { technicalMean as mean, technicalRolling as rolling, technicalSmooth as smooth, technicalWma as wma } from './technicalRatings';

export const FEATURE_GROUPS = ['Candle formation', 'Recent price action', 'Moving averages & cloud', 'Momentum & oscillators', 'Trend strength', 'Volatility & price levels', 'Volume confirmation'] as const;
export interface ProjectionContext {
  patterns: string[];
  recent: string;
  volume: string;
  trend: string;
  readings: { name: string; value: number | null }[];
  groups: string[];
  availableFeatures: number;
  totalFeatures: number;
}
export interface ProjectionFeatures {
  atr: number[];
  /** Index-aligned, grouped features. Each group has equal influence on distance. */
  vectors: number[][][];
  context: ProjectionContext;
}
const clip = (n: number) => Number.isFinite(n) ? Math.max(-1, Math.min(1, n)) : NaN;
const number = (n: number) => Number.isFinite(n) ? n.toFixed(2) : 'unavailable';

/** Rules use the candle and preceding bars only; doji is explicitly non-directional. */
export function projectionPatterns(bars: OhlcBar[], i: number): string[] {
  const b = bars[i], p = bars[i - 1], p2 = bars[i - 2];
  if (!b || !(b.high > b.low)) return [];
  const range = b.high - b.low, body = Math.abs(b.close - b.open), upper = b.high - Math.max(b.open, b.close), lower = Math.min(b.open, b.close) - b.low;
  const up = b.close > b.open, down = b.close < b.open;
  const prior = i >= 4 ? bars[i - 1].close - bars[i - 4].close : 0;
  const result: string[] = [];
  if (body / range <= .1) result.push('Doji');
  if (body / range > .1 && body / range <= .35 && lower >= 2 * body && upper <= .18 * range) result.push(prior < 0 ? 'Hammer' : 'Long lower wick');
  if (body / range > .1 && body / range <= .35 && upper >= 2 * body && lower <= .18 * range) result.push(prior > 0 ? 'Shooting star' : 'Long upper wick');
  if (p) {
    if (up && p.close < p.open && b.open <= p.close && b.close >= p.open) result.push('Bullish engulfing');
    if (down && p.close > p.open && b.open >= p.close && b.close <= p.open) result.push('Bearish engulfing');
    if (up && p.close < p.open && b.open > p.close && b.close < p.open) result.push('Bullish harami');
    if (down && p.close > p.open && b.open < p.close && b.close > p.open) result.push('Bearish harami');
    if (b.high < p.high && b.low > p.low) result.push('Inside bar');
    if (b.high > p.high && b.low < p.low) result.push('Outside bar');
  }
  if (p && p2) {
    const smallMiddle = Math.abs(p.close - p.open) < Math.abs(p2.close - p2.open) * .35;
    if (prior < 0 && p2.close < p2.open && smallMiddle && up && b.close > (p2.open + p2.close) / 2) result.push('Morning-star shape');
    if (prior > 0 && p2.close > p2.open && smallMiddle && down && b.close < (p2.open + p2.close) / 2) result.push('Evening-star shape');
    if ([b, p, p2].every(c => c.close > c.open) && b.close > p.close && p.close > p2.close) result.push('Three rising bullish candles');
    if ([b, p, p2].every(c => c.close < c.open) && b.close < p.close && p.close < p2.close) result.push('Three falling bearish candles');
  }
  return result;
}
const patternNames = ['Doji', 'Hammer', 'Long lower wick', 'Shooting star', 'Long upper wick', 'Bullish engulfing', 'Bearish engulfing', 'Bullish harami', 'Bearish harami', 'Inside bar', 'Outside bar', 'Morning-star shape', 'Evening-star shape', 'Three rising bullish candles', 'Three falling bearish candles'];

/** Full causal series: fixed scales use no future/full-sample fitted statistics. */
export function computeProjectionFeatures(bars: OhlcBar[]): ProjectionFeatures {
  const c = bars.map(b => b.close), h = bars.map(b => b.high), l = bars.map(b => b.low), atr = computeChartAtr(bars), n = bars.length;
  const ma = [10, 20, 30, 50, 100, 200].flatMap(p => [{ name: `EMA (${p})`, s: smooth(c, p) }, { name: `SMA (${p})`, s: rolling(c, p) }]);
  const extrema = (s: number[], p: number, high: boolean) => rolling(s, p, w => high ? Math.max(...w) : Math.min(...w));
  const mid = (p: number) => { const hi = extrema(h, p, true), lo = extrema(l, p, false); return hi.map((v, i) => (v + lo[i]) / 2); };
  const conversion = mid(9), base = mid(26), cloudB = mid(52), cloudA = base.map((v, i) => (v + conversion[i]) / 2);
  const half = wma(c, 4), full = wma(c, 9), hull = wma(c.map((_, i) => 2 * half[i] - full[i]), 3);
  const volumes = bars.map(b => b.volumeAvailable !== false && Number.isFinite(b.volume) && b.volume >= 0 ? b.volume : NaN);
  const v20 = rolling(volumes, 20), pv20 = rolling(c.map((v, i) => v * volumes[i]), 20), vwma = v20.map((v, i) => v > 0 ? pv20[i] / v : NaN);
  const changes = c.map((v, i) => i ? v - c[i - 1] : NaN);
  const gain = smooth(changes.map(v => Math.max(0, v)), 14, 1 / 14), loss = smooth(changes.map(v => Math.max(0, -v)), 14, 1 / 14);
  const rsi = c.map((_, i) => !Number.isFinite(gain[i] + loss[i]) ? NaN : loss[i] === 0 ? gain[i] === 0 ? 50 : 100 : 100 - 100 / (1 + gain[i] / loss[i]));
  const stochastic = (values: number[], highs: number[], lows: number[], p: number) => { const hi = extrema(highs, p, true), lo = extrema(lows, p, false); return values.map((v, i) => hi[i] > lo[i] ? 100 * (v - lo[i]) / (hi[i] - lo[i]) : NaN); };
  const rawK = stochastic(c, h, l, 14), stK = rolling(rawK, 3), stD = rolling(stK, 3), srK = rolling(stochastic(rsi, rsi, rsi, 14), 3);
  const typical = c.map((v, i) => (v + h[i] + l[i]) / 3);
  const cci = rolling(typical, 20, w => { const m = mean(w), dev = mean(w.map(v => Math.abs(v - m))); return dev > 0 ? (w[w.length - 1] - m) / (.015 * dev) : NaN; });
  const tr = c.map((_, i) => i ? Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])) : NaN), dmiAtr = smooth(tr, 14, 1 / 14);
  const plus = smooth(h.map((v, i) => !i ? NaN : v - h[i - 1] > l[i - 1] - l[i] ? Math.max(0, v - h[i - 1]) : 0), 14, 1 / 14);
  const minus = smooth(l.map((v, i) => !i ? NaN : l[i - 1] - v > h[i] - h[i - 1] ? Math.max(0, l[i - 1] - v) : 0), 14, 1 / 14);
  const pdi = plus.map((v, i) => dmiAtr[i] > 0 ? 100 * v / dmiAtr[i] : NaN), mdi = minus.map((v, i) => dmiAtr[i] > 0 ? 100 * v / dmiAtr[i] : NaN);
  const adx = smooth(pdi.map((v, i) => Number.isFinite(v + mdi[i]) ? v + mdi[i] > 0 ? 100 * Math.abs(v - mdi[i]) / (v + mdi[i]) : 0 : NaN), 14, 1 / 14);
  const median = h.map((v, i) => (v + l[i]) / 2), a5 = rolling(median, 5), a34 = rolling(median, 34), ao = a5.map((v, i) => v - a34[i]);
  const e12 = smooth(c, 12), e26 = smooth(c, 26), macd = c.map((_, i) => e12[i] - e26[i]), signal = smooth(macd, 9), e13 = smooth(c, 13);
  const momentum = c.map((v, i) => v - c[i - 10]), power = c.map((_, i) => h[i] + l[i] - 2 * e13[i]);
  const bp = c.map((v, i) => i ? v - Math.min(l[i], c[i - 1]) : NaN);
  const uRatio = [7, 14, 28].map(p => { const num = rolling(bp, p), den = rolling(tr, p); return num.map((v, i) => den[i] > 0 ? v / den[i] : NaN); });
  const uo = c.map((_, i) => 100 * (4 * uRatio[0][i] + 2 * uRatio[1][i] + uRatio[2][i]) / 7);
  const sma20 = rolling(c, 20), sma50 = rolling(c, 50), std = rolling(c, 20, w => { const m = mean(w); return Math.sqrt(mean(w.map(v => (v - m) ** 2))); });
  const hi20 = extrema(h, 20, true), lo20 = extrema(l, 20, false);
  const volumeFlow = rolling(c.map((_, i) => Math.sign(changes[i]) * volumes[i]), 5), v5 = rolling(volumes, 5), v3 = rolling(volumes, 3);
  const patterns = bars.map((_, i) => projectionPatterns(bars, i));
  const vectors = bars.map((b, i) => {
    const a = atr[i], spread = b.high - b.low, ratio = volumes[i] / v20[i - 1];
    const norm = (v: number, scale = 4) => a > 0 ? clip(v / a / scale) : NaN;
    return [
      [spread > 0 ? (b.close - b.open) / spread : NaN, spread > 0 ? (b.high - Math.max(b.open, b.close)) / spread : NaN, spread > 0 ? (Math.min(b.open, b.close) - b.low) / spread : NaN, ...patternNames.map(name => patterns[i].includes(name) ? 1 : 0)],
      [norm(changes[i]), norm(changes[i - 1]), norm(changes[i - 2]), norm(b.close - c[i - 3]), norm(b.close - c[i - 5]), norm(b.open - c[i - 1])],
      [...ma.map(m => norm(b.close - m.s[i])), norm(b.close - hull[i]), norm(b.close - vwma[i]), norm(b.close - base[i]), norm(conversion[i] - base[i]), norm(b.close - cloudA[i - 26]), norm(b.close - cloudB[i - 26])],
      [clip((rsi[i] - 50) / 50), clip((rsi[i] - rsi[i - 3]) / 25), norm(macd[i]), norm(macd[i] - signal[i], 1), clip((stK[i] - 50) / 50), clip((stD[i] - 50) / 50), clip((srK[i] - 50) / 50), clip(cci[i] / 200), norm(ao[i]), norm(momentum[i]), clip((rawK[i] - 50) / 50), norm(power[i]), clip((uo[i] - 50) / 50)],
      [clip(adx[i] / 50), clip((pdi[i] - mdi[i]) / 50), norm(sma20[i] - sma50[i]), norm(sma20[i] - sma20[i - 5])],
      [clip(a / b.close / .05), std[i] > 0 ? clip((b.close - sma20[i]) / (2 * std[i])) : NaN, clip(4 * std[i] / b.close / .2), norm(hi20[i] - b.close), norm(b.close - lo20[i]), norm(b.close - hi20[i - 1]), norm(b.close - lo20[i - 1])],
      [Number.isFinite(ratio) ? clip((ratio - 1) / 2) : NaN, Number.isFinite(ratio) ? clip(Math.sign(changes[i]) * ratio / 3) : NaN, v5[i] > 0 ? clip(volumeFlow[i] / v5[i]) : NaN, v20[i - 1] > 0 ? clip((v3[i] / v20[i - 1] - 1) / 2) : NaN],
    ];
  });
  const i = n - 1, ratio = volumes[i] / v20[i - 1], delta3 = i >= 3 ? (c[i] / c[i - 3] - 1) * 100 : NaN;
  const readings = [...ma, { name: 'Hull MA (9)', s: hull }, { name: 'VWMA (20)', s: vwma }, { name: 'Ichimoku base (26)', s: base }, { name: 'RSI (14)', s: rsi }, { name: 'Stochastic %K (14,3,3)', s: stK }, { name: 'CCI (20)', s: cci }, { name: 'ADX (14)', s: adx }, { name: 'Awesome Oscillator', s: ao }, { name: 'Momentum (10)', s: momentum }, { name: 'MACD (12,26)', s: macd }, { name: 'Stochastic RSI', s: srK }, { name: 'Williams %R', s: rawK.map(v => v - 100) }, { name: 'Bull Bear Power', s: power }, { name: 'Ultimate Oscillator', s: uo }].map(r => ({ name: r.name, value: Number.isFinite(r.s[i]) ? r.s[i] : null }));
  return { atr, vectors, context: { patterns: patterns[i] ?? [], recent: `${delta3 >= 0 ? '+' : ''}${number(delta3)}% over the last 3 sessions · RSI ${number(rsi[i])}${Number.isFinite(rsi[i - 1]) ? rsi[i] > rsi[i - 1] ? ' rising' : rsi[i] < rsi[i - 1] ? ' falling' : ' flat' : ''}`, volume: Number.isFinite(ratio) && v20[i - 1] > 0 ? `${number(ratio)}× prior 20-session average · ${ratio > 1 ? 'higher-volume' : 'lower-volume'} ${changes[i] > 0 ? 'advance' : changes[i] < 0 ? 'decline' : 'unchanged close'}` : 'Volume confirmation unavailable', trend: c[i] > sma20[i] && sma20[i] > sma50[i] ? 'Close above SMA20 above SMA50' : c[i] < sma20[i] && sma20[i] < sma50[i] ? 'Close below SMA20 below SMA50' : 'Mixed moving-average alignment', readings, groups: [...FEATURE_GROUPS], availableFeatures: (vectors[i] ?? []).flat().filter(Number.isFinite).length, totalFeatures: (vectors[i] ?? []).flat().length } };
}

export function projectionFeatureDistance(current: number[][], past: number[][]): number {
  let total = 0, groups = 0;
  for (let g = 0; g < current.length; g++) {
    let sum = 0, count = 0, expected = 0;
    for (let j = 0; j < current[g].length; j++) {
      if (!Number.isFinite(current[g][j])) continue;
      expected++;
      if (!Number.isFinite(past[g]?.[j])) continue;
      sum += (current[g][j] - past[g][j]) ** 2; count++;
    }
    if (!expected) continue;
    if (count < expected * .8) return Infinity;
    total += sum / count; groups++;
  }
  return groups >= 5 ? total / groups : Infinity;
}
