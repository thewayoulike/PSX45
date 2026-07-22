// src/utils/indicators.ts
// Pure technical-analysis helpers + a combined buy/sell rating.
// These are mechanical indicators on historical prices — NOT investment advice.

export type Signal = 'BUY' | 'SELL' | 'NEUTRAL';
export type Verdict = 'STRONG BUY' | 'BUY' | 'NEUTRAL' | 'SELL' | 'STRONG SELL';

export interface IndicatorRow {
  name: string;
  value: string;
  signal: Signal;
}

export interface SignalSummary {
  verdict: Verdict;
  score: number; // -1 (all sell) .. +1 (all buy)
  buys: number;
  sells: number;
  neutrals: number;
  indicators: IndicatorRow[];
  lastPrice: number;
  enoughData: boolean;
}

const smaLast = (v: number[], p: number): number => {
  if (v.length < p) return NaN;
  let s = 0;
  for (let i = v.length - p; i < v.length; i++) s += v[i];
  return s / p;
};

// EMA series seeded with an SMA; values before index p-1 are undefined.
const emaSeries = (v: number[], p: number): number[] => {
  const out: number[] = [];
  if (v.length < p) return out;
  const k = 2 / (p + 1);
  let seed = 0;
  for (let i = 0; i < p; i++) seed += v[i];
  out[p - 1] = seed / p;
  for (let i = p; i < v.length; i++) out[i] = v[i] * k + out[i - 1] * (1 - k);
  return out;
};

const rsi = (v: number[], p = 14): number => {
  if (v.length <= p) return NaN;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= p; i++) {
    const d = v[i] - v[i - 1];
    if (d >= 0) gains += d;
    else losses -= d;
  }
  let avgG = gains / p;
  let avgL = losses / p;
  for (let i = p + 1; i < v.length; i++) {
    const d = v[i] - v[i - 1];
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgG = (avgG * (p - 1) + g) / p;
    avgL = (avgL * (p - 1) + l) / p;
  }
  if (avgL === 0) return 100;
  const rs = avgG / avgL;
  return 100 - 100 / (1 + rs);
};

const macdCalc = (v: number[]): { macd: number; signal: number; hist: number } | null => {
  if (v.length < 26) return null;
  const e12 = emaSeries(v, 12);
  const e26 = emaSeries(v, 26);
  const macdLine: number[] = [];
  for (let i = 25; i < v.length; i++) {
    if (e12[i] != null && e26[i] != null) macdLine.push(e12[i] - e26[i]);
  }
  if (macdLine.length === 0) return null;
  const macd = macdLine[macdLine.length - 1];
  if (macdLine.length < 9) return { macd, signal: macd, hist: 0 };
  const sig = emaSeries(macdLine, 9);
  const signal = sig[sig.length - 1];
  return { macd, signal, hist: macd - signal };
};

const f = (n: number, d = 2) => n.toFixed(d);

export const computeSignal = (rawCloses: number[]): SignalSummary => {
  const closes = rawCloses.filter((n) => Number.isFinite(n) && n > 0);
  const lastPrice = closes.length ? closes[closes.length - 1] : 0;
  const rows: IndicatorRow[] = [];
  const add = (name: string, value: string, signal: Signal) => rows.push({ name, value, signal });

  const enoughData = closes.length >= 35;
  if (!enoughData) {
    return { verdict: 'NEUTRAL', score: 0, buys: 0, sells: 0, neutrals: 0, indicators: rows, lastPrice, enoughData };
  }

  // 1) Price vs moving averages (classic: above MA = bullish)
  [10, 20, 50, 100, 200].forEach((p) => {
    const m = smaLast(closes, p);
    if (Number.isNaN(m)) return;
    add(`Price vs SMA ${p}`, f(m), lastPrice > m ? 'BUY' : lastPrice < m ? 'SELL' : 'NEUTRAL');
  });

  // 2) EMA 20/50 trend
  const e20 = emaSeries(closes, 20);
  const e50 = emaSeries(closes, 50);
  if (e20.length && e50.length) {
    const a = e20[e20.length - 1];
    const b = e50[e50.length - 1];
    if (a != null && b != null) add('EMA 20 vs 50', `${f(a)} / ${f(b)}`, a > b ? 'BUY' : a < b ? 'SELL' : 'NEUTRAL');
  }

  // 3) RSI (14)
  const r = rsi(closes, 14);
  if (!Number.isNaN(r)) add('RSI (14)', f(r, 1), r < 30 ? 'BUY' : r > 70 ? 'SELL' : 'NEUTRAL');

  // 4) MACD (12, 26, 9)
  const macd = macdCalc(closes);
  if (macd) add('MACD (12,26,9)', f(macd.hist), macd.macd > macd.signal ? 'BUY' : macd.macd < macd.signal ? 'SELL' : 'NEUTRAL');

  // 5) Momentum (10-day)
  if (closes.length > 10) {
    const mom = lastPrice - closes[closes.length - 11];
    add('Momentum (10)', f(mom), mom > 0 ? 'BUY' : mom < 0 ? 'SELL' : 'NEUTRAL');
  }

  const buys = rows.filter((x) => x.signal === 'BUY').length;
  const sells = rows.filter((x) => x.signal === 'SELL').length;
  const neutrals = rows.filter((x) => x.signal === 'NEUTRAL').length;
  const total = rows.length || 1;
  const score = (buys - sells) / total;

  const verdict: Verdict =
    score >= 0.5 ? 'STRONG BUY' :
    score >= 0.15 ? 'BUY' :
    score > -0.15 ? 'NEUTRAL' :
    score > -0.5 ? 'SELL' :
    'STRONG SELL';

  return { verdict, score, buys, sells, neutrals, indicators: rows, lastPrice, enoughData };
};
