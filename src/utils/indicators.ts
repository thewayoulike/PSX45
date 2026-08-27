// src/utils/indicators.ts
// Pure technical-analysis helpers + a combined buy/sell rating + a trade plan.
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
  // Raw numeric values (handy for compact table views)
  sma20: number;
  sma50: number;
  rsi: number;
}

export interface TradePlan {
  entryLow: number;
  entryHigh: number;
  stop: number;
  targets: number[];    // [TP1, TP2, TP3]
  riskPct: number;      // (price - stop) / price * 100
  rewardPct: number[];  // per target, relative to price
  atr: number;
  support: number;      // recent 10-day low
  resistance: number;   // recent 20-day high (or price + 2*ATR)
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
const safe = (n: number) => (Number.isNaN(n) || !Number.isFinite(n) ? 0 : n);

export const computeSignal = (rawCloses: number[]): SignalSummary => {
  const closes = rawCloses.filter((n) => Number.isFinite(n) && n > 0);
  const lastPrice = closes.length ? closes[closes.length - 1] : 0;
  const rows: IndicatorRow[] = [];
  const add = (name: string, value: string, signal: Signal) => rows.push({ name, value, signal });

  const sma20n = smaLast(closes, 20);
  const sma50n = smaLast(closes, 50);
  const rsiN = rsi(closes, 14);

  const enoughData = closes.length >= 35;
  if (!enoughData) {
    return { verdict: 'NEUTRAL', score: 0, buys: 0, sells: 0, neutrals: 0, indicators: rows, lastPrice, enoughData, sma20: safe(sma20n), sma50: safe(sma50n), rsi: safe(rsiN) };
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
  if (!Number.isNaN(rsiN)) add('RSI (14)', f(rsiN, 1), rsiN < 30 ? 'BUY' : rsiN > 70 ? 'SELL' : 'NEUTRAL');

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

  return { verdict, score, buys, sells, neutrals, indicators: rows, lastPrice, enoughData, sma20: safe(sma20n), sma50: safe(sma50n), rsi: safe(rsiN) };
};

// Auto trade plan: buy range, stop loss, 1R/2R/3R targets, plus support/resistance.
// Volatility uses a close-to-close ATR proxy (PSX EOD data has no intraday H/L).
export const computeTradePlan = (rawCloses: number[], refPrice?: number): TradePlan | null => {
  const closes = rawCloses.filter((n) => Number.isFinite(n) && n > 0);
  if (closes.length < 20) return null;

  const price = refPrice && refPrice > 0 ? refPrice : closes[closes.length - 1];

  // Close-to-close ATR proxy over the last 14 sessions.
  const period = 14;
  let sum = 0;
  let count = 0;
  for (let i = Math.max(1, closes.length - period); i < closes.length; i++) {
    sum += Math.abs(closes[i] - closes[i - 1]);
    count++;
  }
  const atr = count > 0 ? sum / count : price * 0.02;

  // Support / resistance from recent structure.
  const support = Math.min(...closes.slice(-10));
  const recentHigh = Math.max(...closes.slice(-20));
  const resistance = recentHigh > price ? recentHigh : price + 2 * atr;

  // Buy (accumulation) zone: a slight dip up to the current price.
  const entryLow = price - 0.5 * atr;
  const entryHigh = price;

  // Stop below structure / volatility.
  let stop = Math.min(support, price - 1.5 * atr);
  if (stop >= entryLow) stop = entryLow - atr;
  if (stop <= 0) stop = price * 0.9;

  const risk = price - stop; // 1R
  const targets = [price + risk, price + 2 * risk, price + 3 * risk];
  const riskPct = (risk / price) * 100;
  const rewardPct = targets.map((t) => ((t - price) / price) * 100);

  return { entryLow, entryHigh, stop, targets, riskPct, rewardPct, atr, support, resistance };
};

/** Fixed-exit plan used by the RSI &lt; 30 mean-reversion preset (−1.5% stop / +4% TP). */
export const computeRsiOversoldPlan = (price: number): TradePlan | null => {
  if (!(price > 0)) return null;
  const stopPct = 1.5;
  const tpPct = 4;
  const stop = price * (1 - stopPct / 100);
  const tp = price * (1 + tpPct / 100);
  return {
    entryLow: price,
    entryHigh: price,
    stop,
    targets: [tp, price * (1 + (tpPct * 1.5) / 100), price * (1 + (tpPct * 2) / 100)],
    riskPct: stopPct,
    rewardPct: [tpPct, tpPct * 1.5, tpPct * 2],
    atr: price * 0.015,
    support: stop,
    resistance: tp,
  };
};

export interface RsiOversoldTrade {
  entryIdx: number;
  exitIdx: number;
  entry: number;
  exit: number;
  retPct: number;
  reason: 'tp' | 'sl' | 'eod';
}

export interface RsiOversoldBacktest {
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  avgReturnPct: number;
  totalReturnPct: number; // sum of per-trade % (not compounded)
  expectancyPct: number;
  maxDrawdownPct: number; // on equity curve of +1 starting capital, simple compound of trade returns
  samples: RsiOversoldTrade[];
}

/**
 * Walk-forward RSI &lt; 30 mean-reversion on one symbol's close series.
 * Entry at next bar after signal (or same close); exit at +tpPct / −stopPct or series end.
 */
export const backtestRsiOversold = (
  rawCloses: number[],
  opts?: { rsiPeriod?: number; threshold?: number; stopPct?: number; takeProfitPct?: number; commissionPct?: number }
): RsiOversoldBacktest => {
  const rsiPeriod = opts?.rsiPeriod ?? 14;
  const threshold = opts?.threshold ?? 30;
  const stopPct = opts?.stopPct ?? 1.5;
  const takeProfitPct = opts?.takeProfitPct ?? 4;
  const commissionPct = opts?.commissionPct ?? 0.1; // round-trip approx split on entry+exit

  const closes = rawCloses.filter((n) => Number.isFinite(n) && n > 0);
  const empty: RsiOversoldBacktest = {
    trades: 0, wins: 0, losses: 0, winRate: 0, avgReturnPct: 0, totalReturnPct: 0, expectancyPct: 0, maxDrawdownPct: 0, samples: [],
  };
  if (closes.length < rsiPeriod + 5) return empty;

  // Precompute RSI at each index (Wilder, same as rsi())
  const rsiAt: number[] = new Array(closes.length).fill(NaN);
  {
    let gains = 0;
    let losses = 0;
    for (let i = 1; i <= rsiPeriod; i++) {
      const d = closes[i] - closes[i - 1];
      if (d >= 0) gains += d;
      else losses -= d;
    }
    let avgG = gains / rsiPeriod;
    let avgL = losses / rsiPeriod;
    rsiAt[rsiPeriod] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
    for (let i = rsiPeriod + 1; i < closes.length; i++) {
      const d = closes[i] - closes[i - 1];
      const g = d > 0 ? d : 0;
      const l = d < 0 ? -d : 0;
      avgG = (avgG * (rsiPeriod - 1) + g) / rsiPeriod;
      avgL = (avgL * (rsiPeriod - 1) + l) / rsiPeriod;
      rsiAt[i] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
    }
  }

  const trades: RsiOversoldTrade[] = [];
  let i = rsiPeriod;
  while (i < closes.length - 1) {
    if (!(rsiAt[i] < threshold)) { i++; continue; }
    const entryIdx = i;
    const entry = closes[entryIdx];
    const tp = entry * (1 + takeProfitPct / 100);
    const sl = entry * (1 - stopPct / 100);
    let exitIdx = closes.length - 1;
    let exit = closes[exitIdx];
    let reason: RsiOversoldTrade['reason'] = 'eod';
    for (let j = entryIdx + 1; j < closes.length; j++) {
      const p = closes[j];
      // Check stop before TP on same bar (conservative)
      if (p <= sl) { exitIdx = j; exit = sl; reason = 'sl'; break; }
      if (p >= tp) { exitIdx = j; exit = tp; reason = 'tp'; break; }
    }
    const gross = ((exit - entry) / entry) * 100;
    const retPct = gross - commissionPct; // subtract round-trip commission
    trades.push({ entryIdx, exitIdx, entry, exit, retPct, reason });
    i = exitIdx + 1; // no overlapping positions
  }

  if (!trades.length) return empty;

  const wins = trades.filter((t) => t.retPct > 0).length;
  const losses = trades.length - wins;
  const totalReturnPct = trades.reduce((s, t) => s + t.retPct, 0);
  const avgReturnPct = totalReturnPct / trades.length;
  const winRate = (wins / trades.length) * 100;

  // Simple equity curve for max drawdown
  let equity = 1;
  let peak = 1;
  let maxDd = 0;
  for (const t of trades) {
    equity *= 1 + t.retPct / 100;
    if (equity > peak) peak = equity;
    const dd = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
    if (dd > maxDd) maxDd = dd;
  }

  return {
    trades: trades.length,
    wins,
    losses,
    winRate,
    avgReturnPct,
    totalReturnPct,
    expectancyPct: avgReturnPct,
    maxDrawdownPct: maxDd,
    samples: trades.slice(0, 8),
  };
};

/** Merge per-symbol RSI oversold backtests into one summary. */
export const mergeRsiOversoldBacktests = (parts: RsiOversoldBacktest[]): RsiOversoldBacktest => {
  const tradeLists = parts.filter((p) => p.trades > 0);
  const trades = tradeLists.reduce((s, p) => s + p.trades, 0);
  if (!trades) {
    return { trades: 0, wins: 0, losses: 0, winRate: 0, avgReturnPct: 0, totalReturnPct: 0, expectancyPct: 0, maxDrawdownPct: 0, samples: [] };
  }
  const wins = tradeLists.reduce((s, p) => s + p.wins, 0);
  const losses = tradeLists.reduce((s, p) => s + p.losses, 0);
  const totalReturnPct = tradeLists.reduce((s, p) => s + p.totalReturnPct, 0);
  const avgReturnPct = totalReturnPct / trades;
  const maxDrawdownPct = Math.max(...tradeLists.map((p) => p.maxDrawdownPct), 0);
  const samples = tradeLists.flatMap((p) => p.samples).slice(0, 12);
  return {
    trades,
    wins,
    losses,
    winRate: (wins / trades) * 100,
    avgReturnPct,
    totalReturnPct,
    expectancyPct: avgReturnPct,
    maxDrawdownPct,
    samples,
  };
};
