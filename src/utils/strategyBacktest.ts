// Walk-forward strategy backtests on PSX daily OHLC bars — educational only, not investment advice.
import { OhlcBar } from '../services/psxData';
import { computeSignal, Verdict } from './indicators';

export type BacktestStrategy = 'rsi_oversold' | 'sma_cross' | 'macd_cross' | 'composite_buy';

export interface BacktestOptions {
  strategy: BacktestStrategy;
  stopPct?: number;
  takeProfitPct?: number;
  commissionPct?: number;
  rsiThreshold?: number;
  fromTime?: number;
  toTime?: number;
}

export interface BacktestTrade {
  entryIdx: number;
  exitIdx: number;
  entryTime: number;
  exitTime: number;
  entry: number;
  exit: number;
  retPct: number;
  reason: 'tp' | 'sl' | 'signal' | 'eod';
}

export interface BacktestMetrics {
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  avgReturnPct: number;
  totalReturnPct: number;
  compoundedReturnPct: number;
  maxDrawdownPct: number;
  buyHoldReturnPct: number;
  alphaVsBuyHoldPct: number;
}

export interface BacktestResult {
  symbol: string;
  strategy: BacktestStrategy;
  barCount: number;
  fromTime: number;
  toTime: number;
  trades: BacktestTrade[];
  metrics: BacktestMetrics;
  equityCurve: { time: number; equity: number; buyHold: number }[];
}

const DEFAULTS = { stopPct: 1.5, takeProfitPct: 4, commissionPct: 0.1, rsiThreshold: 30 };

const smaAt = (closes: number[], period: number, idx: number): number => {
  if (idx < period - 1) return NaN;
  let s = 0;
  for (let i = idx - period + 1; i <= idx; i++) s += closes[i];
  return s / period;
};

const emaSeed = (v: number[], p: number): number[] => {
  const out: number[] = new Array(v.length).fill(NaN);
  if (v.length < p) return out;
  const k = 2 / (p + 1);
  let seed = 0;
  for (let i = 0; i < p; i++) seed += v[i];
  out[p - 1] = seed / p;
  for (let i = p; i < v.length; i++) out[i] = v[i] * k + out[i - 1] * (1 - k);
  return out;
};

/** MACD line + signal at bar index (undefined before warm-up). */
const macdAt = (closes: number[], idx: number): { macd: number; signal: number } | null => {
  if (idx < 25 || closes.length < 26) return null;
  const slice = closes.slice(0, idx + 1);
  const e12 = emaSeed(slice, 12);
  const e26 = emaSeed(slice, 26);
  const macdLine: number[] = [];
  for (let i = 25; i < slice.length; i++) {
    if (Number.isFinite(e12[i]) && Number.isFinite(e26[i])) macdLine.push(e12[i] - e26[i]);
  }
  if (macdLine.length < 9) {
    const macd = macdLine[macdLine.length - 1];
    return { macd, signal: macd };
  }
  const sig = emaSeed(macdLine, 9);
  return { macd: macdLine[macdLine.length - 1], signal: sig[sig.length - 1] };
};

const isBuyVerdict = (v: Verdict) => v === 'BUY' || v === 'STRONG BUY';
const isSellVerdict = (v: Verdict) => v === 'SELL' || v === 'STRONG SELL';

/** Exit long on stop/tp using bar high/low; fallback to close at series end. */
const walkExit = (
  bars: OhlcBar[],
  entryIdx: number,
  entry: number,
  stopPct: number,
  takeProfitPct: number,
  signalExit?: (j: number) => boolean
): { exitIdx: number; exit: number; reason: BacktestTrade['reason'] } => {
  const sl = entry * (1 - stopPct / 100);
  const tp = entry * (1 + takeProfitPct / 100);
  for (let j = entryIdx + 1; j < bars.length; j++) {
    const b = bars[j];
    if (b.low <= sl) return { exitIdx: j, exit: sl, reason: 'sl' };
    if (b.high >= tp) return { exitIdx: j, exit: tp, reason: 'tp' };
    if (signalExit?.(j)) return { exitIdx: j, exit: b.close, reason: 'signal' };
  }
  const last = bars.length - 1;
  return { exitIdx: last, exit: bars[last].close, reason: 'eod' };
};

const buildMetrics = (
  trades: BacktestTrade[],
  bars: OhlcBar[],
  commissionPct: number
): BacktestMetrics => {
  const empty: BacktestMetrics = {
    trades: 0, wins: 0, losses: 0, winRate: 0, avgReturnPct: 0, totalReturnPct: 0,
    compoundedReturnPct: 0, maxDrawdownPct: 0, buyHoldReturnPct: 0, alphaVsBuyHoldPct: 0,
  };
  if (!bars.length) return empty;

  const buyHoldReturnPct = bars.length > 1
    ? ((bars[bars.length - 1].close - bars[0].close) / bars[0].close) * 100
    : 0;

  if (!trades.length) {
    return { ...empty, buyHoldReturnPct, alphaVsBuyHoldPct: -buyHoldReturnPct };
  }

  const wins = trades.filter((t) => t.retPct > 0).length;
  const totalReturnPct = trades.reduce((s, t) => s + t.retPct, 0);
  const avgReturnPct = totalReturnPct / trades.length;

  let equity = 1;
  let peak = 1;
  let maxDd = 0;
  for (const t of trades) {
    equity *= 1 + t.retPct / 100;
    if (equity > peak) peak = equity;
    const dd = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
    if (dd > maxDd) maxDd = dd;
  }
  const compoundedReturnPct = (equity - 1) * 100;

  return {
    trades: trades.length,
    wins,
    losses: trades.length - wins,
    winRate: (wins / trades.length) * 100,
    avgReturnPct,
    totalReturnPct,
    compoundedReturnPct,
    maxDrawdownPct: maxDd,
    buyHoldReturnPct,
    alphaVsBuyHoldPct: compoundedReturnPct - buyHoldReturnPct,
  };
};

const buildEquityCurve = (bars: OhlcBar[], trades: BacktestTrade[]): BacktestResult['equityCurve'] => {
  if (!bars.length) return [];
  const start = bars[0].close;
  const points: BacktestResult['equityCurve'] = [{
    time: bars[0].time,
    equity: 1,
    buyHold: 1,
  }];

  let equity = 1;
  let tIdx = 0;
  for (let i = 1; i < bars.length; i++) {
    while (tIdx < trades.length && trades[tIdx].exitIdx === i) {
      equity *= 1 + trades[tIdx].retPct / 100;
      tIdx++;
    }
    points.push({
      time: bars[i].time,
      equity,
      buyHold: start > 0 ? bars[i].close / start : 1,
    });
  }
  return points;
};

const runSmaCross = (bars: OhlcBar[], opts: Required<Pick<BacktestOptions, 'stopPct' | 'takeProfitPct' | 'commissionPct'>>): BacktestTrade[] => {
  const closes = bars.map((b) => b.close);
  const trades: BacktestTrade[] = [];
  let i = 50;
  while (i < bars.length - 1) {
    const prev20 = smaAt(closes, 20, i - 1);
    const prev50 = smaAt(closes, 50, i - 1);
    const cur20 = smaAt(closes, 20, i);
    const cur50 = smaAt(closes, 50, i);
    if ([prev20, prev50, cur20, cur50].some((n) => !Number.isFinite(n))) { i++; continue; }
    const golden = prev20 <= prev50 && cur20 > cur50;
    if (!golden) { i++; continue; }

    const entryIdx = i;
    const entry = bars[entryIdx].close;
    const { exitIdx, exit, reason } = walkExit(bars, entryIdx, entry, opts.stopPct, opts.takeProfitPct, (j) => {
      const p20 = smaAt(closes, 20, j - 1);
      const p50 = smaAt(closes, 50, j - 1);
      const c20 = smaAt(closes, 20, j);
      const c50 = smaAt(closes, 50, j);
      return Number.isFinite(p20) && Number.isFinite(p50) && Number.isFinite(c20) && Number.isFinite(c50)
        && p20 >= p50 && c20 < c50;
    });
    const gross = ((exit - entry) / entry) * 100;
    trades.push({
      entryIdx, exitIdx, entryTime: bars[entryIdx].time, exitTime: bars[exitIdx].time,
      entry, exit, retPct: gross - opts.commissionPct, reason,
    });
    i = exitIdx + 1;
  }
  return trades;
};

const runMacdCross = (bars: OhlcBar[], opts: Required<Pick<BacktestOptions, 'stopPct' | 'takeProfitPct' | 'commissionPct'>>): BacktestTrade[] => {
  const closes = bars.map((b) => b.close);
  const trades: BacktestTrade[] = [];
  let i = 35;
  while (i < bars.length - 1) {
    const prev = macdAt(closes, i - 1);
    const cur = macdAt(closes, i);
    if (!prev || !cur) { i++; continue; }
    const crossUp = prev.macd <= prev.signal && cur.macd > cur.signal;
    if (!crossUp) { i++; continue; }

    const entryIdx = i;
    const entry = bars[entryIdx].close;
    const { exitIdx, exit, reason } = walkExit(bars, entryIdx, entry, opts.stopPct, opts.takeProfitPct, (j) => {
      const p = macdAt(closes, j - 1);
      const c = macdAt(closes, j);
      return Boolean(p && c && p.macd >= p.signal && c.macd < c.signal);
    });
    const gross = ((exit - entry) / entry) * 100;
    trades.push({
      entryIdx, exitIdx, entryTime: bars[entryIdx].time, exitTime: bars[exitIdx].time,
      entry, exit, retPct: gross - opts.commissionPct, reason,
    });
    i = exitIdx + 1;
  }
  return trades;
};

const runCompositeBuy = (bars: OhlcBar[], opts: Required<Pick<BacktestOptions, 'stopPct' | 'takeProfitPct' | 'commissionPct'>>): BacktestTrade[] => {
  const closes = bars.map((b) => b.close);
  const trades: BacktestTrade[] = [];
  let i = 35;
  while (i < bars.length - 1) {
    const sig = computeSignal(closes.slice(0, i + 1));
    if (!sig.enoughData || !isBuyVerdict(sig.verdict)) { i++; continue; }

    const entryIdx = i;
    const entry = bars[entryIdx].close;
    const { exitIdx, exit, reason } = walkExit(bars, entryIdx, entry, opts.stopPct, opts.takeProfitPct, (j) => {
      const s = computeSignal(closes.slice(0, j + 1));
      return s.enoughData && isSellVerdict(s.verdict);
    });
    const gross = ((exit - entry) / entry) * 100;
    trades.push({
      entryIdx, exitIdx, entryTime: bars[entryIdx].time, exitTime: bars[exitIdx].time,
      entry, exit, retPct: gross - opts.commissionPct, reason,
    });
    i = exitIdx + 1;
  }
  return trades;
};

/** Full RSI oversold walk-forward (all trades with bar timestamps). */
const runRsiOversoldFull = (
  bars: OhlcBar[],
  opts: Required<Pick<BacktestOptions, 'stopPct' | 'takeProfitPct' | 'commissionPct' | 'rsiThreshold'>>
): BacktestTrade[] => {
  const closes = bars.map((b) => b.close);
  const rsiPeriod = 14;
  const threshold = opts.rsiThreshold;
  if (closes.length < rsiPeriod + 5) return [];

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

  const trades: BacktestTrade[] = [];
  let i = rsiPeriod;
  while (i < bars.length - 1) {
    if (!(rsiAt[i] < threshold)) { i++; continue; }
    const entryIdx = i;
    const entry = bars[entryIdx].close;
    const { exitIdx, exit, reason } = walkExit(bars, entryIdx, entry, opts.stopPct, opts.takeProfitPct);
    const gross = ((exit - entry) / entry) * 100;
    trades.push({
      entryIdx, exitIdx, entryTime: bars[entryIdx].time, exitTime: bars[exitIdx].time,
      entry, exit, retPct: gross - opts.commissionPct, reason,
    });
    i = exitIdx + 1;
  }
  return trades;
};

export const STRATEGY_LABELS: Record<BacktestStrategy, string> = {
  rsi_oversold: 'RSI Oversold (< 30)',
  sma_cross: 'SMA 20/50 Golden Cross',
  macd_cross: 'MACD Signal Cross',
  composite_buy: 'Multi-Indicator Buy',
};

export const STRATEGY_HINTS: Record<BacktestStrategy, string> = {
  rsi_oversold: 'Enter when RSI(14) drops below threshold; exit at fixed stop/TP or end of data.',
  sma_cross: 'Enter on SMA 20 crossing above SMA 50; exit on death cross, stop, or TP.',
  macd_cross: 'Enter when MACD crosses above its signal line; exit on bearish cross, stop, or TP.',
  composite_buy: 'Enter when combined SMA/EMA/RSI/MACD score is BUY+; exit on SELL verdict or stop/TP.',
};

/** Run a walk-forward backtest on filtered OHLC bars. */
export const runStrategyBacktest = (
  symbol: string,
  allBars: OhlcBar[],
  options: BacktestOptions
): BacktestResult => {
  const stopPct = options.stopPct ?? DEFAULTS.stopPct;
  const takeProfitPct = options.takeProfitPct ?? DEFAULTS.takeProfitPct;
  const commissionPct = options.commissionPct ?? DEFAULTS.commissionPct;
  const rsiThreshold = options.rsiThreshold ?? DEFAULTS.rsiThreshold;

  let bars = [...allBars].sort((a, b) => a.time - b.time);
  if (options.fromTime) bars = bars.filter((b) => b.time >= options.fromTime!);
  if (options.toTime) bars = bars.filter((b) => b.time <= options.toTime!);

  const empty: BacktestResult = {
    symbol,
    strategy: options.strategy,
    barCount: bars.length,
    fromTime: bars[0]?.time ?? 0,
    toTime: bars[bars.length - 1]?.time ?? 0,
    trades: [],
    metrics: buildMetrics([], bars, commissionPct),
    equityCurve: buildEquityCurve(bars, []),
  };
  if (bars.length < 40) return empty;

  const runOpts = { stopPct, takeProfitPct, commissionPct, rsiThreshold };
  let trades: BacktestTrade[] = [];
  switch (options.strategy) {
    case 'rsi_oversold':
      trades = runRsiOversoldFull(bars, runOpts);
      break;
    case 'sma_cross':
      trades = runSmaCross(bars, runOpts);
      break;
    case 'macd_cross':
      trades = runMacdCross(bars, runOpts);
      break;
    case 'composite_buy':
      trades = runCompositeBuy(bars, runOpts);
      break;
  }

  return {
    symbol,
    strategy: options.strategy,
    barCount: bars.length,
    fromTime: bars[0].time,
    toTime: bars[bars.length - 1].time,
    trades,
    metrics: buildMetrics(trades, bars, commissionPct),
    equityCurve: buildEquityCurve(bars, trades),
  };
};

/** Slice bars to last N calendar days (approx). */
export const filterBarsByLookback = (bars: OhlcBar[], days: number): OhlcBar[] => {
  if (!bars.length || days <= 0) return bars;
  const cutoff = Date.now() - days * 86400000;
  const filtered = bars.filter((b) => b.time >= cutoff);
  return filtered.length >= 40 ? filtered : bars.slice(-Math.max(40, Math.min(bars.length, days)));
};
