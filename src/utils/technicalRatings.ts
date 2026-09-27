import type { OhlcBar } from '../services/psxData';
import type { Signal, SignalSummary, TradePlan, Verdict } from './indicators';

export const SCAN_DISCLAIMER = 'Not investment advice. Do your own research and assess your risk before investing.';
export type TechnicalGroupKey = 'averages' | 'oscillators';
export interface TechnicalReading {
  name: string; value: number | null; signal: Signal | null; group: TechnicalGroupKey; rule: string;
}
export interface TechnicalGroup {
  label: string; key: TechnicalGroupKey; total: number; available: number;
  buys: number; sells: number; neutrals: number; score: number | null; rating: Verdict | 'Incomplete';
}
export interface TechnicalAnalysis {
  summary: SignalSummary; rows: TechnicalReading[]; groups: TechnicalGroup[];
  score: number | null; rating: Verdict | 'Incomplete'; available: number;
  candleDate: string | null; bars: number; plan: TradePlan | null;
}
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const last = (s: number[], offset = 0) => s[s.length - 1 - offset] ?? NaN;
const mean = (s: number[]) => s.every(finite) && s.length ? s.reduce((a, b) => a + b, 0) / s.length : NaN;
const rolling = (s: number[], p: number, fn: (w: number[]) => number = mean) => s.map((_, i) => i < p - 1 ? NaN : fn(s.slice(i - p + 1, i + 1)));
// Seed EMA and Wilder smoothing with the first complete period, retaining alignment.
const smooth = (s: number[], p: number, alpha = 2 / (p + 1)) => {
  let previous = NaN;
  return s.map((v, i) => {
    if (!finite(v)) return previous = NaN;
    if (!finite(previous)) previous = i >= p - 1 ? mean(s.slice(i - p + 1, i + 1)) : NaN;
    else previous += alpha * (v - previous);
    return previous;
  });
};
const wma = (s: number[], p: number) => rolling(s, p, w => w.every(finite) ? w.reduce((n, v, i) => n + v * (i + 1), 0) / (p * (p + 1) / 2) : NaN);
const compare = (a: number, b: number): Signal => Math.abs(a - b) < 1e-10 ? 'NEUTRAL' : a > b ? 'BUY' : 'SELL';
const choose = (buy: boolean, sell: boolean): Signal => buy ? 'BUY' : sell ? 'SELL' : 'NEUTRAL';
export const technicalVerdict = (score: number): Verdict => score < -.5 ? 'STRONG SELL' : score < -.1 ? 'SELL' : score <= .1 ? 'NEUTRAL' : score <= .5 ? 'BUY' : 'STRONG BUY';
const pkDate = (ms: number) => new Date(ms + 5 * 3600000).toISOString().slice(0, 10);

/** Use only daily bars; today's bar is held until 18:00 Pakistan time as an EOD safeguard. */
export function closedTechnicalBars(raw: OhlcBar[], now = Date.now()): OhlcBar[] {
  const today = pkDate(now), pkHour = new Date(now + 5 * 3600000).getUTCHours();
  const days = new Map<string, OhlcBar>();
  for (const input of raw) {
    const time = input.time < 1e12 ? input.time * 1000 : input.time;
    if (!finite(time) || time <= 0 || time > now) continue;
    if (![input.open, input.high, input.low, input.close].every(v => finite(v) && v > 0)) continue;
    if (input.high < Math.max(input.open, input.close, input.low) || input.low > Math.min(input.open, input.close)) continue;
    const day = pkDate(time);
    if (day > today || (day === today && pkHour < 18)) continue;
    days.set(day, { ...input, time });
  }
  return [...days.values()].sort((a, b) => a.time - b.time);
}

export function summarizeTechnicalGroup(rows: TechnicalReading[], key: TechnicalGroupKey): TechnicalGroup {
  const selected = rows.filter(r => r.group === key), valid = selected.filter(r => r.signal != null);
  const buys = valid.filter(r => r.signal === 'BUY').length, sells = valid.filter(r => r.signal === 'SELL').length;
  const total = key === 'averages' ? 15 : 11;
  const score = valid.length === total ? (buys - sells) / total : null;
  return { key, label: key === 'averages' ? 'Moving averages' : 'Oscillators', total, available: valid.length, buys, sells, neutrals: valid.length - buys - sells, score, rating: score == null ? 'Incomplete' : technicalVerdict(score) };
}

/** PSX Tracker's documented 26-reading model. Signals follow the public technical-ratings
 * conditions; seeds, trend definition and cloud alignment are explicit below, not a claim
 * of identical broker/TradingView values. https://www.tradingview.com/support/solutions/43000614331/ */
export function computeTechnicalAnalysis(raw: OhlcBar[], now = Date.now()): TechnicalAnalysis {
  const bars = closedTechnicalBars(raw, now), n = bars.length;
  const c = bars.map(b => b.close), h = bars.map(b => b.high), l = bars.map(b => b.low);
  const price = last(c), rows: TechnicalReading[] = [];
  const add = (name: string, value: number, group: TechnicalGroupKey, signal: Signal, required: number[], rule: string) => {
    const valid = finite(value) && required.every(finite);
    rows.push({ name, value: finite(value) ? value : null, signal: valid ? signal : null, group, rule });
  };
  for (const p of [10, 20, 30, 50, 100, 200]) {
    for (const [kind, values] of [['Exponential', smooth(c, p)], ['Simple', rolling(c, p)]] as const) {
      const v = last(values);
      add(`${kind} Moving Average (${p})`, v, 'averages', compare(price, v), [price], 'Close above the average: Buy; below: Sell; equal: Neutral.');
    }
  }
  const mid = (p: number) => h.map((_, i) => i < p - 1 ? NaN : (Math.max(...h.slice(i - p + 1, i + 1)) + Math.min(...l.slice(i - p + 1, i + 1))) / 2);
  const conversion = mid(9), base = mid(26), spanB = mid(52);
  const a = (last(conversion, 26) + last(base, 26)) / 2, b = last(spanB, 26), t = last(conversion), k = last(base);
  add('Ichimoku Base Line (9, 26, 52, 26)', k, 'averages', choose(a > b && k > a && t > k && price > t, a < b && k < a && t < k && price < t), [a, b, t, price], 'Uses the cloud aligned 26 sessions back. Buy needs bullish cloud, base above span A, conversion above base and close above conversion; reverse for Sell.');
  const volumeBars = bars.slice(-20), volume = volumeBars.reduce((s, bar) => s + bar.volume, 0);
  const vwma = volumeBars.length === 20 && volume > 0 && volumeBars.every(bar => finite(bar.volume) && bar.volume >= 0 && bar.volumeAvailable !== false) ? volumeBars.reduce((s, bar) => s + bar.close * bar.volume, 0) / volume : NaN;
  add('Volume Weighted Moving Average (20)', vwma, 'averages', compare(price, vwma), [price], 'Close compared with the volume-weighted average of 20 sessions. Missing volume or zero total volume leaves this unavailable.');
  const half = wma(c, 4), full = wma(c, 9), hull = last(wma(c.map((_, i) => 2 * half[i] - full[i]), 3));
  add('Hull Moving Average (9)', hull, 'averages', compare(price, hull), [price], 'Close compared with WMA(3) of 2 × WMA(4) − WMA(9).');

  const changes = c.map((v, i) => i ? v - c[i - 1] : NaN);
  const gain = smooth(changes.map(v => finite(v) ? Math.max(0, v) : NaN), 14, 1 / 14);
  const loss = smooth(changes.map(v => finite(v) ? Math.max(0, -v) : NaN), 14, 1 / 14);
  const rsi = c.map((_, i) => !finite(gain[i]) || !finite(loss[i]) ? NaN : loss[i] === 0 ? gain[i] === 0 ? 50 : 100 : 100 - 100 / (1 + gain[i] / loss[i]));
  add('Relative Strength Index (14)', last(rsi), 'oscillators', choose(last(rsi) < 30 && last(rsi) > last(rsi, 1), last(rsi) > 70 && last(rsi) < last(rsi, 1)), [last(rsi, 1)], 'Buy below 30 while rising; Sell above 70 while falling.');
  const stochastic = (values: number[], highs: number[], lows: number[], p: number) => values.map((v, i) => {
    if (i < p - 1) return NaN;
    const hi = Math.max(...highs.slice(i - p + 1, i + 1)), lo = Math.min(...lows.slice(i - p + 1, i + 1));
    return hi > lo ? 100 * (v - lo) / (hi - lo) : NaN;
  });
  const rawK = stochastic(c, h, l, 14), stK = rolling(rawK, 3), stD = rolling(stK, 3);
  add('Stochastic %K (14, 3, 3)', last(stK), 'oscillators', choose(last(stK) < 20 && last(stD) < 20 && last(stK) > last(stD), last(stK) > 80 && last(stD) > 80 && last(stK) < last(stD)), [last(stD)], 'Buy when both K and D are below 20 and K exceeds D; Sell above 80 with K below D.');
  const typical = c.map((v, i) => (v + h[i] + l[i]) / 3);
  const cci = rolling(typical, 20, w => { const m = mean(w), dev = mean(w.map(v => Math.abs(v - m))); return dev > 0 ? (last(w) - m) / (.015 * dev) : NaN; });
  add('Commodity Channel Index (20)', last(cci), 'oscillators', choose(last(cci) < -100 && last(cci) > last(cci, 1), last(cci) > 100 && last(cci) < last(cci, 1)), [last(cci, 1)], 'Buy below −100 while rising; Sell above 100 while falling.');
  const tr = c.map((_, i) => i ? Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])) : NaN);
  const atr = smooth(tr, 14, 1 / 14);
  const plus = smooth(h.map((v, i) => !i ? NaN : v - h[i - 1] > l[i - 1] - l[i] ? Math.max(0, v - h[i - 1]) : 0), 14, 1 / 14);
  const minus = smooth(l.map((v, i) => !i ? NaN : l[i - 1] - v > h[i] - h[i - 1] ? Math.max(0, l[i - 1] - v) : 0), 14, 1 / 14);
  const pdi = plus.map((v, i) => atr[i] > 0 ? 100 * v / atr[i] : NaN), mdi = minus.map((v, i) => atr[i] > 0 ? 100 * v / atr[i] : NaN);
  const adx = smooth(pdi.map((v, i) => finite(v) && finite(mdi[i]) ? v + mdi[i] > 0 ? 100 * Math.abs(v - mdi[i]) / (v + mdi[i]) : 0 : NaN), 14, 1 / 14);
  add('Average Directional Index (14)', last(adx), 'oscillators', choose(last(pdi) > last(mdi) && last(adx) > 20 && last(adx) > last(adx, 1), last(pdi) < last(mdi) && last(adx) > 20 && last(adx) < last(adx, 1)), [last(pdi), last(mdi), last(adx, 1)], 'Buy: +DI leads and ADX is above 20 and rising. Sell: −DI leads and ADX is above 20 and falling.');
  const median = h.map((v, i) => (v + l[i]) / 2), ao5 = rolling(median, 5), ao34 = rolling(median, 34), ao = ao5.map((v, i) => v - ao34[i]);
  const a0 = last(ao), a1 = last(ao, 1), a2 = last(ao, 2);
  add('Awesome Oscillator (5, 34)', a0, 'oscillators', choose(a0 > 0 && a1 <= 0 || a0 > 0 && a1 > 0 && a0 > a1 && a1 < a2, a0 < 0 && a1 >= 0 || a0 < 0 && a1 < 0 && a0 < a1 && a1 > a2), [a1, a2], 'Buy on an upward zero crossing or upward turn above zero; Sell on a downward crossing or downward turn below zero.');
  const momentum = c.map((v, i) => i >= 10 ? v - c[i - 10] : NaN);
  add('Momentum (10)', last(momentum), 'oscillators', compare(last(momentum), last(momentum, 1)), [last(momentum, 1)], 'Buy when momentum rises versus the previous session; Sell when it falls.');
  const e12 = smooth(c, 12), e26 = smooth(c, 26), macd = c.map((_, i) => e12[i] - e26[i]), macdSignal = smooth(macd, 9);
  add('MACD Level (12, 26, 9)', last(macd), 'oscillators', compare(last(macd), last(macdSignal)), [last(macdSignal)], 'MACD line above its 9-session EMA signal: Buy; below: Sell. Displayed value is the MACD line.');
  const trend = smooth(c, 13), up = price > last(trend), down = price < last(trend);
  const srK = rolling(stochastic(rsi, rsi, rsi, 14), 3), srD = rolling(srK, 3);
  add('Stochastic RSI Fast (3, 3, 14, 14)', last(srK), 'oscillators', choose(down && last(srK) < 20 && last(srD) < 20 && last(srK) > last(srD), up && last(srK) > 80 && last(srD) > 80 && last(srK) < last(srD)), [last(srD), last(trend)], 'Buy in a downtrend with K and D below 20 and K above D; Sell in an uptrend above 80 with K below D. Trend = close versus EMA(13).');
  const wr = rawK.map(v => v - 100);
  add('Williams Percent Range (14)', last(wr), 'oscillators', choose(last(wr) < -80 && last(wr) > last(wr, 1), last(wr) > -20 && last(wr) < last(wr, 1)), [last(wr, 1)], 'Buy below −80 while rising; Sell above −20 while falling.');
  const bull = h.map((v, i) => v - trend[i]), bear = l.map((v, i) => v - trend[i]);
  add('Bull Bear Power (13)', last(bull) + last(bear), 'oscillators', choose(up && last(bear) < 0 && last(bear) > last(bear, 1), down && last(bull) > 0 && last(bull) < last(bull, 1)), [last(bull, 1), last(bear, 1), last(trend)], 'Value = bull + bear power against EMA(13). Buy in an uptrend with negative bear power improving; Sell in a downtrend with positive bull power declining.');
  const bp = c.map((v, i) => i ? v - Math.min(l[i], c[i - 1]) : NaN);
  const ratios = [7, 14, 28].map(p => { const numerator = mean(bp.slice(-p)), denominator = mean(tr.slice(-p)); return n > p && denominator > 0 ? numerator / denominator : NaN; });
  const uo = 100 * (4 * ratios[0] + 2 * ratios[1] + ratios[2]) / 7;
  add('Ultimate Oscillator (7, 14, 28)', uo, 'oscillators', choose(uo > 70, uo < 30), [], 'Buy above 70; Sell below 30; otherwise Neutral.');

  const groups = (['averages', 'oscillators'] as const).map(key => summarizeTechnicalGroup(rows, key));
  const score = groups.every(g => g.score != null) ? (groups[0].score! + groups[1].score!) / 2 : null;
  const valid = rows.filter(r => r.signal != null), buys = valid.filter(r => r.signal === 'BUY').length, sells = valid.filter(r => r.signal === 'SELL').length;
  const rating = score == null ? 'Incomplete' : technicalVerdict(score);
  const summary: SignalSummary = { verdict: score == null ? 'NEUTRAL' : technicalVerdict(score), score: score ?? NaN, buys, sells, neutrals: valid.length - buys - sells, enoughData: score != null, lastPrice: price, sma20: last(rolling(c, 20)), sma50: last(rolling(c, 50)), rsi: last(rsi), indicators: valid.map(r => ({ name: r.name, value: r.value!.toFixed(2), signal: r.signal! })) };
  let plan: TradePlan | null = null;
  const volatility = last(atr);
  if (n >= 20 && finite(volatility) && volatility > 0) {
    const support = Math.min(...l.slice(-20)), resistance = Math.max(...h.slice(-20));
    const stop = Math.min(support, price - 1.5 * volatility), entryLow = price - .5 * volatility, risk = price - stop;
    if (stop > 0 && entryLow > stop && risk > 0) {
      const targets = [1, 2, 3].map(r => price + r * risk);
      plan = { entryLow, entryHigh: price, stop, targets, riskPct: risk / price * 100, rewardPct: targets.map(t => (t - price) / price * 100), atr: volatility, support, resistance, supportLabel: 'Support · 20-session low', resistanceLabel: 'Resistance · 20-session high' };
    }
  }
  return { summary, rows, groups, score, rating, available: valid.length, candleDate: n ? pkDate(bars[n - 1].time) : null, bars: n, plan };
}

export function technicalExplanation(a: TechnicalAnalysis): string[] {
  return [
    '15 moving-average readings and 11 oscillators. Buy = +1, Neutral = 0, Sell = −1. Average each complete group, then average the two group scores with equal weight.',
    `Available: ${a.available}/26. Votes: ${a.summary.buys} Buy, ${a.summary.neutrals} Neutral, ${a.summary.sells} Sell. Group scores: ${a.groups.map(g => g.score == null ? 'unavailable' : g.score.toFixed(3)).join(' / ')}. Overall: ${a.score == null ? 'withheld until all 26 signals are available' : a.score.toFixed(3) + ' (' + a.rating + ')'}. Strong Sell < −0.50; Sell −0.50 to < −0.10; Neutral −0.10 to +0.10; Buy > +0.10 to +0.50; Strong Buy > +0.50.`,
    'Daily PSX historical OHLCV; today’s bar is excluded before 18:00 Pakistan time. EMA uses an SMA seed; RSI/ADX/ATR use Wilder smoothing. Cloud spans align 26 sessions back. Stochastic RSI and Bull Bear Power define trend as close versus EMA(13). Feed delays, adjustments and these conventions may differ from a broker. Missing signals are not counted as Neutral.',
  ];
}
export const technicalPlanExplanation = [
  'Illustrative long-position scenario, even when the rating is Sell; not an instruction to enter a trade. Reference = the displayed daily candle close. Entry range = reference − 0.5 × ATR(14) to reference. Stop = the lower of the 20-session low and reference − 1.5 × ATR. Support/resistance are observed 20-session low/high, not guaranteed barriers.',
  '1R = reference − stop. Take profits 1, 2 and 3 = reference + 1R, 2R and 3R. Risk % = 1R ÷ reference × 100; reward % = (target − reference) ÷ reference × 100. Fees, slippage, gaps and different entries change actual results. No probability of reaching a target is implied.',
];
