import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, RefreshCw, Activity, Info } from 'lucide-react';
import { fetchStockHistory } from '../services/psxData';
import { computeSignal, SignalSummary, Signal } from '../utils/indicators';

const VERDICT_STYLES: Record<string, { text: string; bg: string; ring: string }> = {
  'STRONG BUY':  { text: 'text-emerald-700 dark:text-emerald-300', bg: 'bg-emerald-100 dark:bg-emerald-900/40', ring: 'ring-emerald-500' },
  'BUY':         { text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/25', ring: 'ring-emerald-400' },
  'NEUTRAL':     { text: 'text-slate-600 dark:text-slate-300',     bg: 'bg-slate-100 dark:bg-slate-800',        ring: 'ring-slate-400' },
  'SELL':        { text: 'text-rose-600 dark:text-rose-400',       bg: 'bg-rose-50 dark:bg-rose-900/25',        ring: 'ring-rose-400' },
  'STRONG SELL': { text: 'text-rose-700 dark:text-rose-300',       bg: 'bg-rose-100 dark:bg-rose-900/40',       ring: 'ring-rose-500' },
};

const chip = (s: Signal) =>
  s === 'BUY' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
  : s === 'SELL' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
  : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400';

export const TradeSignal: React.FC<{ ticker: string }> = ({ ticker }) => {
  const [summary, setSummary] = useState<SignalSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!ticker) return;
    setLoading(true);
    setError('');
    try {
      const history = await fetchStockHistory(ticker, '1Y');
      const closes = history.map((h) => h.price);
      if (closes.length < 35) {
        setError('Not enough price history to compute reliable signals for this stock.');
        setSummary(computeSignal(closes));
      } else {
        setSummary(computeSignal(closes));
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load price history.');
    } finally {
      setLoading(false);
    }
  }, [ticker]);

  useEffect(() => { load(); }, [load]);

  const v = summary?.verdict || 'NEUTRAL';
  const style = VERDICT_STYLES[v];
  // Map score (-1..1) to a 0..100% marker position on the meter.
  const markerPct = summary ? ((summary.score + 1) / 2) * 100 : 50;

  return (
    <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-indigo-100 dark:bg-indigo-900/40 rounded-xl">
            <Activity size={18} className="text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Technical Signal — {ticker}</h3>
            <p className="text-xs text-slate-400">Based on daily price history (1Y)</p>
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 px-3 py-2 rounded-lg text-xs font-bold transition-colors"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Refresh
        </button>
      </div>

      <div className="p-4 sm:p-5">
        {loading && !summary ? (
          <div className="flex items-center justify-center py-10 text-slate-400">
            <Loader2 size={22} className="animate-spin" />
          </div>
        ) : (
          <>
            {/* Verdict */}
            <div className="flex flex-col items-center text-center mb-5">
              <div className={`px-5 py-2 rounded-xl text-lg font-extrabold tracking-wide ${style.bg} ${style.text} ring-1 ${style.ring}/30`}>
                {v}
              </div>
              {summary && (
                <div className="flex gap-4 mt-3 text-xs font-bold">
                  <span className="text-emerald-600 dark:text-emerald-400">{summary.buys} Buy</span>
                  <span className="text-slate-400">{summary.neutrals} Neutral</span>
                  <span className="text-rose-500 dark:text-rose-400">{summary.sells} Sell</span>
                </div>
              )}
            </div>

            {/* Meter */}
            <div className="relative mb-6 px-1">
              <div className="h-2.5 rounded-full overflow-hidden flex">
                <div className="flex-1 bg-rose-500/80" />
                <div className="flex-1 bg-rose-300/70" />
                <div className="flex-1 bg-slate-300 dark:bg-slate-600" />
                <div className="flex-1 bg-emerald-300/70" />
                <div className="flex-1 bg-emerald-500/80" />
              </div>
              <div
                className="absolute -top-1 w-1.5 h-4.5 h-[18px] bg-slate-900 dark:bg-white rounded-full shadow -translate-x-1/2 transition-all duration-500"
                style={{ left: `${markerPct}%` }}
              />
              <div className="flex justify-between text-[10px] text-slate-400 mt-1.5 font-bold uppercase tracking-wide">
                <span>Strong Sell</span>
                <span>Neutral</span>
                <span>Strong Buy</span>
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-700 dark:text-amber-400">
                {error}
              </div>
            )}

            {/* Indicator breakdown */}
            {summary && summary.indicators.length > 0 && (
              <div className="rounded-xl border border-slate-100 dark:border-slate-800 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 text-left">
                    <tr>
                      <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Indicator</th>
                      <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 text-right">Value</th>
                      <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 text-center">Signal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {summary.indicators.map((row) => (
                      <tr key={row.name}>
                        <td className="px-3 py-2 text-slate-700 dark:text-slate-300 font-medium">{row.name}</td>
                        <td className="px-3 py-2 text-right font-mono text-slate-500 dark:text-slate-400">{row.value}</td>
                        <td className="px-3 py-2 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-bold ${chip(row.signal)}`}>{row.signal}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Disclaimer */}
            <div className="mt-4 flex items-start gap-2 text-[11px] text-slate-400 leading-relaxed">
              <Info size={13} className="mt-0.5 shrink-0" />
              <span>
                These are mechanical technical-analysis signals for educational purposes only — not investment advice or
                a recommendation to buy or sell. Indicators reflect past price action and can be wrong. Do your own research.
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
