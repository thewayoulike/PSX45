import React, { useCallback, useMemo, useState } from 'react';
import {
  Activity, BarChart3, FlaskConical, Loader2, Play, TrendingDown, TrendingUp, Lock, Columns3, Trophy,
} from 'lucide-react';
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { fetchOHLCV, fetchStockHistory } from '../services/psxData';
import {
  BacktestResult,
  BacktestStrategy,
  MIN_COMPARABLE_TRADES,
  STRATEGY_HINTS,
  STRATEGY_LABELS,
  bestComparable,
  compareStrategies,
  filterBarsByLookback,
  runStrategyBacktest,
} from '../utils/strategyBacktest';
import type { OhlcBar } from '../services/psxData';
import { useFreemium } from './FreemiumContext';

interface Props {
  onSymbolClick?: (symbol: string) => void;
}

type Lookback = '6M' | '1Y' | '2Y' | 'ALL';

const LOOKBACK_DAYS: Record<Lookback, number> = { '6M': 183, '1Y': 365, '2Y': 730, ALL: 0 };
const POPULAR = ['OGDC', 'PPL', 'LUCK', 'HBL', 'MCB', 'ENGRO', 'SYS', 'FFC'];

const fmt = (n?: number | null, d = 2) =>
  (n == null || Number.isNaN(n) || !Number.isFinite(n))
    ? '—'
    : n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

const fmtPct = (n?: number | null) => {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${n >= 0 ? '+' : ''}${fmt(n)}%`;
};

const fmtDate = (t: number) =>
  new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });

const reasonLabel: Record<string, string> = {
  tp: 'Take profit',
  sl: 'Stop loss',
  signal: 'Signal exit',
  eod: 'End of data',
};

export const StrategyBacktest: React.FC<Props> = ({ onSymbolClick }) => {
  const { isFree, requestUpgrade } = useFreemium();
  const [symbol, setSymbol] = useState('OGDC');
  const [strategy, setStrategy] = useState<BacktestStrategy>('rsi_oversold');
  const [lookback, setLookback] = useState<Lookback>('1Y');
  const [stopPct, setStopPct] = useState(1.5);
  const [takeProfitPct, setTakeProfitPct] = useState(4);
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [benchmarkPct, setBenchmarkPct] = useState<number | null>(null);
  // Broker commission rate for PSX charges (with sales tax, CDC and exchange fees); 0 turns costs off.
  const [feePct, setFeePct] = useState(0.15);
  const [comparison, setComparison] = useState<{ results: BacktestResult[]; settings: string } | null>(null);

  const execute = useCallback(async (mode: 'single' | 'compare') => {
    const sym = symbol.toUpperCase().replace('PSX:', '').trim();
    if (!sym) return;
    setStatus('running');
    setError(null);
    setBenchmarkPct(null);
    try {
      const [bars, kseHist] = await Promise.all([
        fetchOHLCV(sym),
        fetchStockHistory('KSE100', lookback === '6M' ? '6M' : '1Y').catch(() => []),
      ]);
      if (bars.length < 40) throw new Error(`Not enough OHLC data for ${sym} (${bars.length} bars).`);

      const days = LOOKBACK_DAYS[lookback];
      const filtered: OhlcBar[] = days > 0 ? filterBarsByLookback(bars, days) : bars;
      const options = { stopPct, takeProfitPct, costs: 'psx' as const, feePct: Math.max(0, feePct) };
      if (mode === 'compare') {
        // Let the spinner paint before the synchronous run of every strategy.
        await new Promise((r) => setTimeout(r, 0));
        const results = compareStrategies(sym, filtered, options);
        setComparison({ results, settings: `${sym} · ${lookback} · stop ${stopPct}% · target ${takeProfitPct}% · commission ${feePct}%` });
        setResult(results.find((r) => r.strategy === strategy) ?? results[0]);
      } else {
        setResult(runStrategyBacktest(sym, filtered, { ...options, strategy }));
      }

      if (kseHist.length >= 2) {
        const a = kseHist[0].price;
        const b = kseHist[kseHist.length - 1].price;
        if (a > 0) setBenchmarkPct(((b - a) / a) * 100);
      }
      setStatus('done');
    } catch (e: any) {
      setError(e?.message || 'Backtest failed');
      setStatus('error');
      setResult(null);
    }
  }, [symbol, strategy, lookback, stopPct, takeProfitPct, feePct]);
  const run = useCallback(() => execute('single'), [execute]);
  const runCompare = useCallback(() => execute('compare'), [execute]);

  const ranked = useMemo(() => comparison
    ? [...comparison.results].sort((a, b) => {
        // Too few trades to judge goes last, then highest compounded return first.
        const fewA = a.metrics.trades < MIN_COMPARABLE_TRADES ? 1 : 0;
        const fewB = b.metrics.trades < MIN_COMPARABLE_TRADES ? 1 : 0;
        return fewA - fewB || b.metrics.compoundedReturnPct - a.metrics.compoundedReturnPct;
      })
    : [], [comparison]);
  const best = useMemo(() => (comparison ? bestComparable(comparison.results) : null), [comparison]);

  const chartData = useMemo(() => {
    if (!result?.equityCurve.length) return [];
    return result.equityCurve.map((p) => ({
      time: p.time,
      label: fmtDate(p.time),
      strategy: Number(((p.equity - 1) * 100).toFixed(2)),
      buyHold: Number(((p.buyHold - 1) * 100).toFixed(2)),
    }));
  }, [result]);

  const m = result?.metrics;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6 w-full min-w-0">
      <div className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-md border border-slate-200/60 dark:border-slate-800/60 rounded-3xl shadow-card dark:shadow-card-dark p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center border shadow-sm shrink-0 bg-violet-50 dark:bg-violet-500/10 border-violet-100 dark:border-violet-500/20">
              <FlaskConical size={24} className="text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <h2 className="text-2xl font-display font-black text-slate-900 dark:text-white tracking-tight">
                Strategy Backtest
              </h2>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-1">
                Walk-forward rules on PSX daily OHLC — compare strategy vs buy &amp; hold
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Symbol</label>
            <input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              className="w-full glass-input rounded-xl px-4 py-2.5 text-sm font-bold outline-none"
              placeholder="OGDC"
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {POPULAR.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSymbol(s)}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${symbol === s ? 'bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Strategy</label>
            <select
              value={strategy}
              onChange={(e) => setStrategy(e.target.value as BacktestStrategy)}
              className="w-full glass-input rounded-xl px-4 py-2.5 text-sm font-bold outline-none"
            >
              {(Object.keys(STRATEGY_LABELS) as BacktestStrategy[]).map((k) => (
                <option key={k} value={k}>{STRATEGY_LABELS[k]}</option>
              ))}
            </select>
            <p className="text-[10px] text-slate-400 mt-1.5 leading-snug">{STRATEGY_HINTS[strategy]}</p>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Lookback</label>
            <select
              value={lookback}
              onChange={(e) => setLookback(e.target.value as Lookback)}
              className="w-full glass-input rounded-xl px-4 py-2.5 text-sm font-bold outline-none"
            >
              <option value="6M">Last 6 months</option>
              <option value="1Y">Last 1 year</option>
              <option value="2Y">Last 2 years</option>
              <option value="ALL">Full history</option>
            </select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Stop %</label>
              <input
                type="number"
                step="0.1"
                min="0.5"
                max="20"
                value={stopPct}
                onChange={(e) => setStopPct(Number(e.target.value))}
                className="w-full glass-input rounded-xl px-3 py-2.5 text-sm font-bold outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Target %</label>
              <input
                type="number"
                step="0.1"
                min="0.5"
                max="50"
                value={takeProfitPct}
                onChange={(e) => setTakeProfitPct(Number(e.target.value))}
                className="w-full glass-input rounded-xl px-3 py-2.5 text-sm font-bold outline-none"
              />
            </div>
            <div>
              <label htmlFor="bt-commission" className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Comm. %</label>
              <input
                id="bt-commission"
                type="number"
                step="0.01"
                min="0"
                max="2"
                value={feePct}
                title="Broker commission rate. Sales tax, CDC and exchange fees are added; 0 turns all costs off."
                onChange={(e) => setFeePct(Number(e.target.value))}
                className="w-full glass-input rounded-xl px-3 py-2.5 text-sm font-bold outline-none"
              />
            </div>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={run}
            disabled={status === 'running'}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white text-sm font-bold shadow-lg shadow-violet-600/20 transition-all"
          >
            {status === 'running' ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
            Run backtest
          </button>
          <button
            type="button"
            onClick={runCompare}
            disabled={status === 'running'}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-violet-200 dark:border-violet-500/30 bg-white dark:bg-slate-900 hover:bg-violet-50 dark:hover:bg-violet-500/10 disabled:opacity-60 text-violet-700 dark:text-violet-300 text-sm font-bold transition-all"
          >
            <Columns3 size={16} />
            Compare all strategies
          </button>
          {result && (
            <span className="text-xs text-slate-500">
              {result.barCount} daily bars · {fmtDate(result.fromTime)} → {fmtDate(result.toTime)}
            </span>
          )}
        </div>
        {error && <p className="mt-3 text-sm font-medium text-rose-500">{error}</p>}
      </div>

      {comparison && ranked.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 shadow-card dark:shadow-card-dark overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Columns3 size={18} className="text-violet-600" />
              <h3 className="text-sm font-black text-slate-800 dark:text-slate-100">Strategies side by side</h3>
            </div>
            <span className="text-[11px] text-slate-400">{comparison.settings}</span>
          </div>
          <p className="px-5 pt-3 text-xs text-slate-500 dark:text-slate-400">
            {isFree
              ? <>Trade counts for each strategy are shown below.</>
              : best
                ? <>Best on this window: <strong className="text-slate-700 dark:text-slate-200">{STRATEGY_LABELS[best.strategy]}</strong> ({fmtPct(best.metrics.compoundedReturnPct)} after PSX costs; buy &amp; hold {fmtPct(best.metrics.buyHoldReturnPct)}).</>
                : <>No strategy with at least {MIN_COMPARABLE_TRADES} trades made money on this window after PSX costs.</>}
            {' '}Select a row to see its trades and equity curve.
          </p>
          {isFree && (
            <div className="mx-5 mt-3 flex flex-wrap items-center justify-between gap-3 bg-indigo-50/80 dark:bg-indigo-500/10 border border-indigo-200/60 dark:border-indigo-500/20 rounded-2xl px-4 py-2.5">
              <p className="text-xs font-medium text-indigo-800 dark:text-indigo-200">Free teaser: upgrade to compare returns, drawdown and Sharpe.</p>
              <button type="button" onClick={requestUpgrade} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shrink-0">
                <Lock size={12} /> Upgrade
              </button>
            </div>
          )}
          <div className="overflow-x-auto mt-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-widest text-slate-400 border-b border-slate-100 dark:border-slate-800">
                  <th className="text-left px-5 py-3">Strategy</th>
                  <th className="text-right px-3 py-3">Trades</th>
                  <th className="text-right px-3 py-3">Win %</th>
                  <th className="text-right px-3 py-3">Avg / trade</th>
                  <th className="text-right px-3 py-3" title="Total gains divided by total losses. Above 1 means winners outweighed losers.">Profit factor</th>
                  <th className="text-right px-3 py-3">Compounded</th>
                  <th className="text-right px-3 py-3">vs buy &amp; hold</th>
                  <th className="text-right px-3 py-3" title="Largest fall from a peak in account value.">Max DD</th>
                  <th className="text-right px-3 py-3" title="Return per unit of day-to-day swings, annualised. Above 1 is good; below 0 lost money.">Sharpe</th>
                  <th className="text-right px-5 py-3">In market</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((r) => {
                  const x = r.metrics;
                  const few = x.trades < MIN_COMPARABLE_TRADES;
                  const selected = result?.strategy === r.strategy && result?.symbol === r.symbol;
                  const lock = isFree ? 'blur-[3px] select-none' : '';
                  const tone = (n: number) => (n >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500');
                  const pick = () => { setResult(r); setStrategy(r.strategy); };
                  return (
                    <tr
                      key={r.strategy}
                      onClick={pick}
                      className={`border-b border-slate-50 dark:border-slate-800/50 cursor-pointer ${selected ? 'bg-violet-50/70 dark:bg-violet-500/10' : 'hover:bg-slate-50/50 dark:hover:bg-slate-800/30'} ${few ? 'opacity-60' : ''}`}
                    >
                      <td className="px-5 py-2.5 font-bold text-slate-700 dark:text-slate-200">
                        <button type="button" className="text-left inline-flex items-center gap-1.5" onClick={(e) => { e.stopPropagation(); pick(); }}>
                          {!isFree && best?.strategy === r.strategy && <Trophy size={13} className="text-amber-500 shrink-0" aria-label="Best" />}
                          {STRATEGY_LABELS[r.strategy]}
                        </button>
                        {few && <div className="text-[10px] font-medium text-slate-400">Too few trades to judge</div>}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono">{x.trades}</td>
                      <td className={`px-3 py-2.5 text-right font-mono ${lock}`}>{x.trades ? `${fmt(x.winRate, 0)}%` : '—'}</td>
                      <td className={`px-3 py-2.5 text-right font-mono ${lock} ${x.trades ? tone(x.avgReturnPct) : ''}`}>{x.trades ? fmtPct(x.avgReturnPct) : '—'}</td>
                      <td className={`px-3 py-2.5 text-right font-mono ${lock}`}>{x.profitFactor == null ? (x.trades ? 'No losses' : '—') : fmt(x.profitFactor)}</td>
                      <td className={`px-3 py-2.5 text-right font-black ${lock} ${tone(x.compoundedReturnPct)}`}>{fmtPct(x.compoundedReturnPct)}</td>
                      <td className={`px-3 py-2.5 text-right font-mono ${lock} ${tone(x.alphaVsBuyHoldPct)}`}>{fmtPct(x.alphaVsBuyHoldPct)}</td>
                      <td className={`px-3 py-2.5 text-right font-mono text-rose-500 ${lock}`}>{x.trades ? fmtPct(-x.maxDrawdownPct) : '—'}</td>
                      <td className={`px-3 py-2.5 text-right font-mono ${lock}`}>{x.sharpe == null ? '—' : fmt(x.sharpe)}</td>
                      <td className={`px-5 py-2.5 text-right font-mono text-slate-500 ${lock}`}>{fmt(x.exposurePct, 0)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="px-5 py-3 text-[11px] text-slate-400">
            Every strategy uses the same stock, window, stop, target and PSX charges. Strategies with fewer than {MIN_COMPARABLE_TRADES} trades are listed last: a handful of trades says more about luck than about the rule.
          </p>
        </div>
      )}

      {m && result && (
        <>
          {isFree && (
            <div className="flex flex-wrap items-center justify-between gap-3 bg-indigo-50/80 dark:bg-indigo-500/10 border border-indigo-200/60 dark:border-indigo-500/20 rounded-2xl px-4 py-3">
              <p className="text-sm font-medium text-indigo-800 dark:text-indigo-200">
                Free teaser: {m.trades} trade{m.trades === 1 ? '' : 's'} generated for {result.symbol}. Upgrade to unlock full metrics and trade list.
              </p>
              <button
                type="button"
                onClick={requestUpgrade}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shrink-0"
              >
                <Lock size={14} /> Upgrade
              </button>
            </div>
          )}
          <div className={`relative ${isFree ? 'select-none' : ''}`}>
            {isFree && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/40 dark:bg-slate-950/40 backdrop-blur-[2px] rounded-3xl">
                <button
                  type="button"
                  onClick={requestUpgrade}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold shadow-lg"
                >
                  <Lock size={16} /> Upgrade to see results
                </button>
              </div>
            )}
            <div className={isFree ? 'opacity-40 blur-[2px] pointer-events-none' : ''}>
          <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 mb-3">{STRATEGY_LABELS[result.strategy]} · {result.symbol}</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Trades', value: String(m.trades), sub: `${fmt(m.winRate, 0)}% win rate · ${fmt(m.avgHoldDays, 1)} days avg hold` },
              { label: 'Compounded', value: fmtPct(m.compoundedReturnPct), sub: 'after PSX costs', pos: m.compoundedReturnPct },
              { label: 'Buy & Hold', value: fmtPct(m.buyHoldReturnPct), sub: `${result.symbol} close-to-close`, pos: m.buyHoldReturnPct },
              { label: 'Alpha', value: fmtPct(m.alphaVsBuyHoldPct), sub: 'vs buy & hold', pos: m.alphaVsBuyHoldPct },
              { label: 'Max DD', value: fmtPct(-m.maxDrawdownPct), sub: 'peak-to-trough', pos: -m.maxDrawdownPct },
              { label: 'Profit factor', value: m.profitFactor == null ? (m.trades ? 'No losses' : '—') : fmt(m.profitFactor), sub: `avg win ${fmtPct(m.avgWinPct)} · avg loss ${fmtPct(m.avgLossPct)}` },
              { label: 'Sharpe', value: m.sharpe == null ? '—' : fmt(m.sharpe), sub: `annualised · in market ${fmt(m.exposurePct, 0)}% of days` },
              { label: 'KSE-100', value: benchmarkPct != null ? fmtPct(benchmarkPct) : '—', sub: `${lookback} benchmark`, pos: benchmarkPct ?? undefined },
            ].map(({ label, value, sub, pos }) => (
              <div key={label} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/60 dark:border-slate-800/60 p-4 shadow-sm">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</div>
                <div className={`text-xl font-black mt-1 ${pos == null ? 'text-slate-800 dark:text-slate-100' : pos >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
                  {value}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">{sub}</div>
              </div>
            ))}
          </div>

          {chartData.length > 1 && (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 p-5 shadow-card dark:shadow-card-dark mt-6">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 size={18} className="text-violet-600" />
                <h3 className="text-sm font-black text-slate-800 dark:text-slate-100">Equity curve (% return)</h3>
              </div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-800" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={40} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} width={48} />
                    <Tooltip
                      formatter={(v: number, name: string) => [`${fmt(v)}%`, name === 'strategy' ? 'Strategy' : 'Buy & hold']}
                      labelFormatter={(l) => String(l)}
                    />
                    <Area type="monotone" dataKey="strategy" stroke="#7c3aed" fill="#7c3aed" fillOpacity={0.15} strokeWidth={2} name="strategy" />
                    <Area type="monotone" dataKey="buyHold" stroke="#64748b" fill="#64748b" fillOpacity={0.08} strokeWidth={1.5} name="buyHold" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="flex gap-4 mt-2 text-[10px] font-bold text-slate-400">
                <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-violet-600 inline-block" /> Strategy (compounded)</span>
                <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-slate-400 inline-block" /> Buy &amp; hold</span>
              </div>
            </div>
          )}

          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 shadow-card dark:shadow-card-dark overflow-hidden mt-6">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity size={18} className="text-violet-600" />
                <h3 className="text-sm font-black text-slate-800 dark:text-slate-100">
                  Trades ({result.trades.length})
                </h3>
              </div>
              {onSymbolClick && (
                <button
                  type="button"
                  onClick={() => onSymbolClick(result.symbol)}
                  className="text-xs font-bold text-violet-600 hover:underline"
                >
                  Open {result.symbol} profile
                </button>
              )}
            </div>
            {result.trades.length === 0 ? (
              <p className="p-8 text-sm text-slate-500 text-center">
                No trades generated for {STRATEGY_LABELS[result.strategy]} on this window. Try a longer lookback or different strategy.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-widest text-slate-400 border-b border-slate-100 dark:border-slate-800">
                      <th className="text-left px-5 py-3">Entry</th>
                      <th className="text-left px-3 py-3">Exit</th>
                      <th className="text-right px-3 py-3">Entry ₨</th>
                      <th className="text-right px-3 py-3">Exit ₨</th>
                      <th className="text-right px-3 py-3">Return</th>
                      <th className="text-left px-5 py-3">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.trades.map((t, i) => (
                      <tr key={i} className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                        <td className="px-5 py-2.5 font-medium text-slate-700 dark:text-slate-200">{fmtDate(t.entryTime)}</td>
                        <td className="px-3 py-2.5 text-slate-500">{fmtDate(t.exitTime)}</td>
                        <td className="px-3 py-2.5 text-right font-mono">{fmt(t.entry)}</td>
                        <td className="px-3 py-2.5 text-right font-mono">{fmt(t.exit)}</td>
                        <td className={`px-3 py-2.5 text-right font-black ${t.retPct >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                          {t.retPct >= 0 ? <TrendingUp size={12} className="inline mr-1" /> : <TrendingDown size={12} className="inline mr-1" />}
                          {fmtPct(t.retPct)}
                        </td>
                        <td className="px-5 py-2.5 text-xs text-slate-500">{reasonLabel[t.reason] || t.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
            </div>
          </div>
        </>
      )}

      {!result && status !== 'running' && (
        <div className="text-center py-16 text-slate-400 text-sm">
          Pick a PSX symbol and strategy, then run a backtest on daily historical prices.
          <br />
          <span className="text-xs mt-2 inline-block">Includes PSX charges on every buy and sell. Educational only — not investment advice.</span>
        </div>
      )}

      <p className="text-[11px] text-slate-400 text-center pb-4">
        Signals fill at the signal-day close. Gaps fill at the next opening price; if both stop and target
        are crossed within a bar, the stop takes priority. Drawdown uses daily closing equity, including
        open positions. PSX charges (commission with 15% sales tax, CDC Rs 0.005 a share, PSX/SECP/NCCPL fees)
        apply to every buy and sell, for both the strategy and buy-and-hold. Capital gains tax is not included.
        Daily bars cannot measure intraday drawdown or guarantee execution. Past performance does not guarantee future results.
      </p>
    </div>
  );
};
