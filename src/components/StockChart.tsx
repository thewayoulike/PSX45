import React, { useEffect, useMemo, useState } from 'react';
import { fetchStockHistory } from '../services/psxData';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { LineChart as LineIcon, Loader2, RefreshCw } from 'lucide-react';

interface Props { symbol: string | null; }

const RANGES: { k: string; days: number }[] = [
  { k: '1M', days: 30 },
  { k: '3M', days: 90 },
  { k: '6M', days: 180 },
  { k: '1Y', days: 365 },
  { k: 'ALL', days: 0 },
];

const rs = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const StockChart: React.FC<Props> = ({ symbol }) => {
  const [data, setData] = useState<{ time: number; price: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [range, setRange] = useState('3M');

  const load = async () => {
    if (!symbol) return;
    setLoading(true);
    try {
      const d = await fetchStockHistory(symbol, '1Y'); // EOD endpoint returns full history
      setData((d || []).filter(p => p.price > 0));
    } catch (e) {
      console.error('StockChart load failed', e);
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  const filtered = useMemo(() => {
    const r = RANGES.find(x => x.k === range);
    if (!r || r.days === 0) return data;
    const cutoff = Date.now() - r.days * 86400000;
    return data.filter(p => p.time >= cutoff);
  }, [data, range]);

  const chartData = useMemo(
    () => filtered.map(p => ({ t: p.time, price: p.price, label: new Date(p.time).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) })),
    [filtered]
  );

  const first = chartData[0]?.price ?? 0;
  const last = chartData[chartData.length - 1]?.price ?? 0;
  const up = last >= first;
  const changePct = first ? ((last - first) / first) * 100 : 0;
  const stroke = up ? '#10b981' : '#f43f5e';

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 shadow-card dark:shadow-card-dark overflow-hidden">
      <div className="p-5 border-b border-slate-200/60 dark:border-slate-800 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center text-slate-500 dark:text-slate-400 shrink-0"><LineIcon size={18} /></div>
          <div>
            <h3 className="font-display font-black text-lg text-slate-900 dark:text-white tracking-tight">{symbol} · Price</h3>
            {chartData.length > 1 && (
              <div className="text-xs text-slate-400 flex items-center gap-2">
                Rs. {rs(last)} <span className={`font-bold ${up ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>{up ? '+' : ''}{changePct.toFixed(2)}% · {range}</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
            {RANGES.map(r => (
              <button key={r.k} onClick={() => setRange(r.k)} className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all ${range === r.k ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'}`}>{r.k}</button>
            ))}
          </div>
          <button onClick={load} disabled={loading} className="p-2 rounded-lg text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors disabled:opacity-40" title="Refresh">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="p-4">
        {loading && chartData.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-28 text-slate-400">
            <Loader2 size={22} className="animate-spin mb-2" />
            <span className="text-xs font-medium">Loading price history for {symbol}…</span>
          </div>
        ) : chartData.length < 2 && loaded ? (
          <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-28">No price history available for {symbol}.</p>
        ) : (
          <div className="h-96 sm:h-[560px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="scg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={stroke} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.4} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }} axisLine={false} tickLine={false} minTickGap={40} />
                <YAxis domain={['auto', 'auto']} tickFormatter={(v: number) => `${v}`} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }} axisLine={false} tickLine={false} width={44} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.08)' }}
                  labelFormatter={(l) => l}
                  formatter={(v: any) => [`Rs. ${rs(Number(v))}`, 'Close']}
                />
                <Area type="monotone" dataKey="price" stroke={stroke} strokeWidth={2.5} fill="url(#scg)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
        <p className="text-[10px] text-slate-400 mt-2 px-1">
          Daily closing prices from PSX (dps.psx.com.pk). Candlesticks need historical high/low, which PSX doesn't publish in this free feed.
        </p>
      </div>
    </div>
  );
};
