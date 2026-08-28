import React, { useCallback, useMemo, useState } from 'react';
import {
  Activity, BarChart3, FlaskConical, Loader2, Play, TrendingDown, TrendingUp,
} from 'lucide-react';
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { fetchOHLCV, fetchStockHistory } from '../services/psxData';
import {
  BacktestResult,
  BacktestStrategy,
  STRATEGY_HINTS,
  STRATEGY_LABELS,
  filterBarsByLookback,
  runStrategyBacktest,
} from '../utils/strategyBacktest';

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
  const [symbol, setSymbol] = useState('OGDC');
  const [strategy, setStrategy] = useState<BacktestStrategy>('rsi_oversold');
  const [lookback, setLookback] = useState<Lookback>('1Y');
  const [stopPct, setStopPct] = useState(1.5);
  const [takeProfitPct, setTakeProfitPct] = useState(4);
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [benchmarkPct, setBenchmarkPct] = useState<number | null>(null);

  const run = useCallback(async () => {
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
      const filtered = days > 0 ? filterBarsByLookback(bars, days) : bars;
      const bt = runStrategyBacktest(sym, filtered, {
        strategy,
        stopPct,
        takeProfitPct,
        commissionPct: 0.1,
      });
      setResult(bt);

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
  }, [symbol, strategy, lookback, stopPct, takeProfitPct]);

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

          <div className="grid grid-cols-2 gap-3">
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
          {result && (
            <span className="text-xs text-slate-500">
              {result.barCount} daily bars · {fmtDate(result.fromTime)} → {fmtDate(result.toTime)}
            </span>
          )}
        </div>
        {error && <p className="mt-3 text-sm font-medium text-rose-500">{error}</p>}
      </div>

      {m && result && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            {[
              { label: 'Trades', value: String(m.trades), sub: `${fmt(m.winRate, 0)}% win rate` },
              { label: 'Compounded', value: fmtPct(m.compoundedReturnPct), sub: 'after commissions', pos: m.compoundedReturnPct },
              { label: 'Buy & Hold', value: fmtPct(m.buyHoldReturnPct), sub: `${result.symbol} close-to-close`, pos: m.buyHoldReturnPct },
              { label: 'Alpha', value: fmtPct(m.alphaVsBuyHoldPct), sub: 'vs buy & hold', pos: m.alphaVsBuyHoldPct },
              { label: 'Max DD', value: fmtPct(-m.maxDrawdownPct), sub: 'peak-to-trough', pos: -m.maxDrawdownPct },
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
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 p-5 shadow-card dark:shadow-card-dark">
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

          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 shadow-card dark:shadow-card-dark overflow-hidden">
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
        </>
      )}

      {!result && status !== 'running' && (
        <div className="text-center py-16 text-slate-400 text-sm">
          Pick a PSX symbol and strategy, then run a backtest on daily OHLC from PSX historical data.
          <br />
          <span className="text-xs mt-2 inline-block">Includes ~0.1% round-trip commission. Educational only — not investment advice.</span>
        </div>
      )}

      <p className="text-[11px] text-slate-400 text-center pb-4">
        <strong className="text-slate-500">Disclaimer:</strong> Backtests use daily OHLC with simplified fills. Past performance does not guarantee future results.
      </p>
    </div>
  );
};
