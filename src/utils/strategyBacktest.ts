// Walk-forward strategy backtests on PSX daily OHLC bars — educational only, not investment advice.
import { OhlcBar } from '../services/psxData';
import { computeSignal, Verdict } from './indicators';
import { atrSeries } from './awaisIndicators';
import { buyCost, netReturn } from '../features/tradingLab/engine';

export type BacktestStrategy =
  | 'rsi_oversold' | 'sma_cross' | 'macd_cross' | 'composite_buy'
  | 'ema_cross' | 'bollinger_bounce' | 'supertrend';

/** Every strategy, in the order the comparison table lists them. */
export const BACKTEST_STRATEGIES: BacktestStrategy[] = [
  'rsi_oversold', 'bollinger_bounce', 'sma_cross', 'ema_cross', 'macd_cross', 'supertrend', 'composite_buy',
];

export interface BacktestOptions {
  strategy: BacktestStrategy;
  stopPct?: number;
  takeProfitPct?: number;
  /** 'flat' charges commissionPct per round trip; 'psx' uses the Trading Lab's PSX charges at each trade's prices. */
  costs?: 'flat' | 'psx';
  commissionPct?: number;
  /** Broker commission rate for 'psx' costs (0 turns all charges off). */
  feePct?: number;
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
  avgWinPct: number;
  avgLossPct: number;
  /** Gross gains ÷ gross losses; null when there are no losing trades. */
  profitFactor: number | null;
  totalReturnPct: number;
  compoundedReturnPct: number;
  maxDrawdownPct: number;
  /** Annualised from daily equity changes (250 trading days, no risk-free rate); null when it can't be measured. */
  sharpe: number | null;
  /** Share of days a position was open. */
  exposurePct: number;
  avgHoldDays: number;
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

const DEFAULTS = { stopPct: 1.5, takeProfitPct: 4, commissionPct: 0.1, feePct: 0.15, rsiThreshold: 30 };
const TRADING_DAYS = 250;
/** Fewer trades than this and a comparison says more about luck than about the strategy. */
export const MIN_COMPARABLE_TRADES = 5;

/** Net return of one long trade in %, after costs. */
type ReturnFn = (entry: number, exit: number) => number;

const returnFn = (o: Pick<BacktestOptions, 'costs' | 'commissionPct' | 'feePct'>): ReturnFn => {
  if (o.costs === 'psx') {
    const fee = o.feePct ?? DEFAULTS.feePct;
    return (entry, exit) => (netReturn(entry, exit, fee, 0) / buyCost(entry, fee, 0)) * 100;
  }
  const c = o.commissionPct ?? DEFAULTS.commissionPct;
  return (entry, exit) => ((exit - entry) / entry) * 100 - c;
};

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

const rsiSeries = (closes: number[], period: number): number[] => {
  const out: number[] = new Array(closes.length).fill(NaN);
  if (closes.length <= period) return out;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gains += d;
    else losses -= d;
  }
  let avgG = gains / period;
  let avgL = losses / period;
  out[period] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgG = (avgG * (period - 1) + (d > 0 ? d : 0)) / period;
    avgL = (avgL * (period - 1) + (d < 0 ? -d : 0)) / period;
    out[i] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  }
  return out;
};

/** Lower and middle Bollinger band (SMA ± k population standard deviations). */
const bollingerAt = (closes: number[], period: number, k: number, idx: number): { lower: number; middle: number } | null => {
  const middle = smaAt(closes, period, idx);
  if (!Number.isFinite(middle)) return null;
  let s = 0;
  for (let i = idx - period + 1; i <= idx; i++) s += (closes[i] - middle) ** 2;
  return { lower: middle - k * Math.sqrt(s / period), middle };
};

/** Supertrend direction per bar: 1 up, -1 down, 0 during warm-up. */
export const supertrendDirection = (bars: OhlcBar[], period = 10, factor = 3): number[] => {
  const atr = atrSeries(bars, period);
  const dir: number[] = new Array(bars.length).fill(0);
  let upper = NaN;
  let lower = NaN;
  for (let i = period; i < bars.length; i++) {
    const mid = (bars[i].high + bars[i].low) / 2;
    const basicUpper = mid + factor * atr[i];
    const basicLower = mid - factor * atr[i];
    const prevClose = bars[i - 1].close;
    upper = !Number.isFinite(upper) || basicUpper < upper || prevClose > upper ? basicUpper : upper;
    lower = !Number.isFinite(lower) || basicLower > lower || prevClose < lower ? basicLower : lower;
    const prev = dir[i - 1];
    dir[i] = prev === 1 ? (bars[i].close < lower ? -1 : 1) : (bars[i].close > upper ? 1 : -1);
  }
  return dir;
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
    // A gap is executable at the opening price, not at an unavailable threshold.
    if (b.open <= sl) return { exitIdx: j, exit: b.open, reason: 'sl' };
    if (b.open >= tp) return { exitIdx: j, exit: b.open, reason: 'tp' };
    if (b.low <= sl) return { exitIdx: j, exit: sl, reason: 'sl' };
    if (b.high >= tp) return { exitIdx: j, exit: tp, reason: 'tp' };
    if (signalExit?.(j)) return { exitIdx: j, exit: b.close, reason: 'signal' };
  }
  const last = bars.length - 1;
  return { exitIdx: last, exit: bars[last].close, reason: 'eod' };
};

interface Rules {
  /** First bar index where the entry rule can be evaluated. */
  start: number;
  entry: (i: number) => boolean;
  exit?: (j: number) => boolean;
}

/** One position at a time: enter at the signal-day close, exit on stop, target or the exit rule. */
const walkRules = (
  bars: OhlcBar[],
  rules: Rules,
  opts: { stopPct: number; takeProfitPct: number; ret: ReturnFn }
): BacktestTrade[] => {
  const trades: BacktestTrade[] = [];
  let i = rules.start;
  while (i < bars.length - 1) {
    if (!rules.entry(i)) { i++; continue; }
    const entryIdx = i;
    const entry = bars[entryIdx].close;
    const { exitIdx, exit, reason } = walkExit(bars, entryIdx, entry, opts.stopPct, opts.takeProfitPct, rules.exit);
    trades.push({
      entryIdx, exitIdx, entryTime: bars[entryIdx].time, exitTime: bars[exitIdx].time,
      entry, exit, retPct: opts.ret(entry, exit), reason,
    });
    i = exitIdx + 1;
  }
  return trades;
};

const crossedUp = (a: number[], b: number[], i: number) =>
  [a[i - 1], b[i - 1], a[i], b[i]].every(Number.isFinite) && a[i - 1] <= b[i - 1] && a[i] > b[i];
const crossedDown = (a: number[], b: number[], i: number) =>
  [a[i - 1], b[i - 1], a[i], b[i]].every(Number.isFinite) && a[i - 1] >= b[i - 1] && a[i] < b[i];

const strategyRules = (strategy: BacktestStrategy, bars: OhlcBar[], rsiThreshold: number): Rules => {
  const closes = bars.map((b) => b.close);
  switch (strategy) {
    case 'rsi_oversold': {
      const rsi = rsiSeries(closes, 14);
      return { start: 14, entry: (i) => rsi[i] < rsiThreshold };
    }
    case 'sma_cross': {
      const s20 = closes.map((_, i) => smaAt(closes, 20, i));
      const s50 = closes.map((_, i) => smaAt(closes, 50, i));
      return { start: 50, entry: (i) => crossedUp(s20, s50, i), exit: (j) => crossedDown(s20, s50, j) };
    }
    case 'ema_cross': {
      const e9 = emaSeed(closes, 9);
      const e21 = emaSeed(closes, 21);
      return { start: 22, entry: (i) => crossedUp(e9, e21, i), exit: (j) => crossedDown(e9, e21, j) };
    }
    case 'macd_cross': {
      const m = closes.map((_, i) => macdAt(closes, i));
      const line = m.map((x) => x?.macd ?? NaN);
      const signal = m.map((x) => x?.signal ?? NaN);
      return { start: 35, entry: (i) => crossedUp(line, signal, i), exit: (j) => crossedDown(line, signal, j) };
    }
    case 'bollinger_bounce': {
      const bb = closes.map((_, i) => bollingerAt(closes, 20, 2, i));
      return {
        start: 20,
        // A close back inside the lower band after a close below it.
        entry: (i) => Boolean(bb[i - 1] && bb[i] && closes[i - 1] < bb[i - 1]!.lower && closes[i] > bb[i]!.lower),
        exit: (j) => Boolean(bb[j] && closes[j] >= bb[j]!.middle),
      };
    }
    case 'supertrend': {
      const dir = supertrendDirection(bars);
      return { start: 11, entry: (i) => dir[i - 1] === -1 && dir[i] === 1, exit: (j) => dir[j] === -1 };
    }
    case 'composite_buy': {
      const sig = (i: number) => computeSignal(closes.slice(0, i + 1));
      return {
        start: 35,
        entry: (i) => { const s = sig(i); return s.enoughData && isBuyVerdict(s.verdict); },
        exit: (j) => { const s = sig(j); return s.enoughData && isSellVerdict(s.verdict); },
      };
    }
  }
};

const buildEquityCurve = (bars: OhlcBar[], trades: BacktestTrade[], ret: ReturnFn): BacktestResult['equityCurve'] => {
  if (!bars.length) return [];
  const start = bars[0].close;
  const points: BacktestResult['equityCurve'] = [{
    time: bars[0].time,
    equity: 1,
    buyHold: bars.length > 1 ? 1 + ret(start, start) / 100 : 1,
  }];

  let equity = 1;
  let tIdx = 0;
  for (let i = 1; i < bars.length; i++) {
    while (tIdx < trades.length && trades[tIdx].exitIdx === i) {
      equity *= 1 + trades[tIdx].retPct / 100;
      tIdx++;
    }
    const openTrade = trades[tIdx];
    // Value open positions at the daily close, net of the costs of selling there.
    const markedEquity = openTrade && i >= openTrade.entryIdx && i < openTrade.exitIdx
      ? equity * (1 + ret(openTrade.entry, bars[i].close) / 100) : equity;
    points.push({
      time: bars[i].time,
      equity: markedEquity,
      buyHold: start > 0 ? 1 + ret(start, bars[i].close) / 100 : 1,
    });
  }
  return points;
};

const sharpeOf = (curve: BacktestResult['equityCurve']): number | null => {
  if (curve.length < 20) return null;
  const r: number[] = [];
  for (let i = 1; i < curve.length; i++) r.push(curve[i].equity / curve[i - 1].equity - 1);
  const mean = r.reduce((s, x) => s + x, 0) / r.length;
  const sd = Math.sqrt(r.reduce((s, x) => s + (x - mean) ** 2, 0) / (r.length - 1));
  return sd > 1e-12 ? (mean / sd) * Math.sqrt(TRADING_DAYS) : null;
};

const buildMetrics = (trades: BacktestTrade[], bars: OhlcBar[], curve: BacktestResult['equityCurve'], ret: ReturnFn): BacktestMetrics => {
  const empty: BacktestMetrics = {
    trades: 0, wins: 0, losses: 0, winRate: 0, avgReturnPct: 0, avgWinPct: 0, avgLossPct: 0, profitFactor: null,
    totalReturnPct: 0, compoundedReturnPct: 0, maxDrawdownPct: 0, sharpe: null, exposurePct: 0, avgHoldDays: 0,
    buyHoldReturnPct: 0, alphaVsBuyHoldPct: 0,
  };
  if (!bars.length) return empty;

  const buyHoldReturnPct = bars.length > 1 ? ret(bars[0].close, bars[bars.length - 1].close) : 0;

  const winners = trades.filter((t) => t.retPct > 0);
  const losers = trades.filter((t) => t.retPct <= 0);
  const gain = winners.reduce((s, t) => s + t.retPct, 0);
  const loss = -losers.reduce((s, t) => s + t.retPct, 0);
  const totalReturnPct = gain - loss;
  const heldDays = trades.reduce((s, t) => s + (t.exitIdx - t.entryIdx), 0);

  let peak = 1;
  let maxDd = 0;
  for (const point of curve) {
    if (point.equity > peak) peak = point.equity;
    const dd = peak > 0 ? ((peak - point.equity) / peak) * 100 : 0;
    if (dd > maxDd) maxDd = dd;
  }
  const compoundedReturnPct = ((curve[curve.length - 1]?.equity ?? 1) - 1) * 100;

  return {
    trades: trades.length,
    wins: winners.length,
    losses: losers.length,
    winRate: trades.length ? (winners.length / trades.length) * 100 : 0,
    avgReturnPct: trades.length ? totalReturnPct / trades.length : 0,
    avgWinPct: winners.length ? gain / winners.length : 0,
    avgLossPct: losers.length ? -loss / losers.length : 0,
    profitFactor: loss > 0 ? gain / loss : null,
    totalReturnPct,
    compoundedReturnPct,
    maxDrawdownPct: maxDd,
    sharpe: trades.length ? sharpeOf(curve) : null,
    exposurePct: bars.length > 1 ? (heldDays / (bars.length - 1)) * 100 : 0,
    avgHoldDays: trades.length ? heldDays / trades.length : 0,
    buyHoldReturnPct,
    alphaVsBuyHoldPct: compoundedReturnPct - buyHoldReturnPct,
  };
};

export const STRATEGY_LABELS: Record<BacktestStrategy, string> = {
  rsi_oversold: 'RSI Oversold (< 30)',
  sma_cross: 'SMA 20/50 Golden Cross',
  macd_cross: 'MACD Signal Cross',
  composite_buy: 'Multi-Indicator Buy',
  ema_cross: 'EMA 9/21 Cross',
  bollinger_bounce: 'Bollinger Band Bounce',
  supertrend: 'Supertrend (10, 3)',
};

export const STRATEGY_HINTS: Record<BacktestStrategy, string> = {
  rsi_oversold: 'Enter when RSI(14) drops below threshold; exit at fixed stop/TP or end of data.',
  sma_cross: 'Enter on SMA 20 crossing above SMA 50; exit on death cross, stop, or TP.',
  macd_cross: 'Enter when MACD crosses above its signal line; exit on bearish cross, stop, or TP.',
  composite_buy: 'Enter when combined SMA/EMA/RSI/MACD score is BUY+; exit on SELL verdict or stop/TP.',
  ema_cross: 'Enter when EMA 9 crosses above EMA 21; exit when it crosses back below, or on stop/TP.',
  bollinger_bounce: 'Enter when price closes back above the lower band (20, 2) after closing below it; exit at the middle band, stop, or TP.',
  supertrend: 'Enter when Supertrend (ATR 10, ×3) turns up; exit when it turns down, or on stop/TP.',
};

/** Run a walk-forward backtest on filtered OHLC bars. */
export const runStrategyBacktest = (
  symbol: string,
  allBars: OhlcBar[],
  options: BacktestOptions
): BacktestResult => {
  const stopPct = options.stopPct ?? DEFAULTS.stopPct;
  const takeProfitPct = options.takeProfitPct ?? DEFAULTS.takeProfitPct;
  const rsiThreshold = options.rsiThreshold ?? DEFAULTS.rsiThreshold;
  const ret = returnFn(options);

  let bars = [...allBars].sort((a, b) => a.time - b.time);
  if (options.fromTime) bars = bars.filter((b) => b.time >= options.fromTime!);
  if (options.toTime) bars = bars.filter((b) => b.time <= options.toTime!);

  const trades = bars.length < 40 ? [] : walkRules(bars, strategyRules(options.strategy, bars, rsiThreshold), { stopPct, takeProfitPct, ret });
  const equityCurve = buildEquityCurve(bars, trades, ret);
  return {
    symbol,
    strategy: options.strategy,
    barCount: bars.length,
    fromTime: bars[0]?.time ?? 0,
    toTime: bars[bars.length - 1]?.time ?? 0,
    trades,
    metrics: buildMetrics(trades, bars, equityCurve, ret),
    equityCurve,
  };
};

/** Run every strategy on the same bars and settings, for a side-by-side table. */
export const compareStrategies = (
  symbol: string,
  bars: OhlcBar[],
  options: Omit<BacktestOptions, 'strategy'>,
  strategies: BacktestStrategy[] = BACKTEST_STRATEGIES
): BacktestResult[] => strategies.map((strategy) => runStrategyBacktest(symbol, bars, { ...options, strategy }));

/**
 * Best strategy by compounded return among those with enough trades to compare;
 * null when none qualifies or none beats doing nothing.
 */
export const bestComparable = (results: BacktestResult[]): BacktestResult | null => {
  const ok = results.filter((r) => r.metrics.trades >= MIN_COMPARABLE_TRADES);
  const best = ok.reduce<BacktestResult | null>((b, r) => (!b || r.metrics.compoundedReturnPct > b.metrics.compoundedReturnPct ? r : b), null);
  return best && best.metrics.compoundedReturnPct > 0 ? best : null;
};

/** Slice bars to last N calendar days (approx). */
export const filterBarsByLookback = (bars: OhlcBar[], days: number): OhlcBar[] => {
  if (!bars.length || days <= 0) return bars;
  const cutoff = Date.now() - days * 86400000;
  const filtered = bars.filter((b) => b.time >= cutoff);
  return filtered.length >= 40 ? filtered : bars.slice(-Math.max(40, Math.min(bars.length, days)));
};
