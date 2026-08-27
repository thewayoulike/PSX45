import React, { useEffect, useMemo, useRef, useState } from 'react';
import { fetchOHLCV, fetchStockHistory, OhlcBar } from '../services/psxData';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { LineChart as LineIcon, CandlestickChart as CandleIcon, Loader2, RefreshCw } from 'lucide-react';

interface Props { symbol: string | null; }

const RANGES: { k: string; days: number }[] = [
  { k: '1M', days: 30 },
  { k: '3M', days: 90 },
  { k: '6M', days: 180 },
  { k: '1Y', days: 365 },
  { k: 'ALL', days: 0 },
];

const rs = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtVol = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : `${Math.round(n)}`;

type ChartMode = 'candle' | 'line';

/** Aggregate daily bars into weekly OHLC when the series is too dense for candles. */
function aggregateWeekly(bars: OhlcBar[]): OhlcBar[] {
  if (bars.length < 2) return bars;
  const out: OhlcBar[] = [];
  let bucket: OhlcBar | null = null;
  let weekKey = '';
  for (const b of bars) {
    const d = new Date(b.time);
    const onejan = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((b.time - onejan.getTime()) / 86400000) + onejan.getUTCDay() + 1) / 7);
    const wk = `${d.getUTCFullYear()}-W${week}`;
    if (!bucket || wk !== weekKey) {
      if (bucket) out.push(bucket);
      weekKey = wk;
      bucket = { ...b };
    } else {
      bucket.high = Math.max(bucket.high, b.high);
      bucket.low = Math.min(bucket.low, b.low);
      bucket.close = b.close;
      bucket.volume += b.volume;
      bucket.time = b.time;
    }
  }
  if (bucket) out.push(bucket);
  return out;
}

const CandleChart: React.FC<{ bars: OhlcBar[]; height?: number }> = ({ bars, height = 420 }) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth || 640));
    ro.observe(el);
    setWidth(el.clientWidth || 640);
    return () => ro.disconnect();
  }, []);

  const pad = { t: 16, r: 12, b: 28, l: 52 };
  const w = Math.max(280, width);
  const h = height;
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;

  const display = useMemo(() => {
    if (bars.length > 420) return aggregateWeekly(bars);
    return bars;
  }, [bars]);

  const minP = Math.min(...display.map((b) => b.low));
  const maxP = Math.max(...display.map((b) => b.high));
  const span = maxP - minP || maxP * 0.02 || 1;
  const yMin = minP - span * 0.04;
  const yMax = maxP + span * 0.04;
  const yScale = (p: number) => pad.t + ((yMax - p) / (yMax - yMin)) * innerH;
  const slot = innerW / Math.max(display.length, 1);
  const bodyW = Math.max(2, Math.min(10, slot * 0.62));

  const hi = hover != null ? display[hover] : null;

  return (
    <div ref={wrapRef} className="relative w-full select-none">
      {hi && (
        <div className="absolute top-1 left-14 z-10 pointer-events-none rounded-lg bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-[11px] shadow-sm tabular-nums">
          <span className="font-bold text-slate-700 dark:text-slate-200">
            {new Date(hi.time).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
          <span className="text-slate-500 ml-2">O {rs(hi.open)}</span>
          <span className="text-slate-500 ml-1.5">H {rs(hi.high)}</span>
          <span className="text-slate-500 ml-1.5">L {rs(hi.low)}</span>
          <span className={`ml-1.5 font-bold ${hi.close >= hi.open ? 'text-emerald-600' : 'text-rose-500'}`}>C {rs(hi.close)}</span>
          {hi.volume > 0 && <span className="text-slate-400 ml-1.5">V {fmtVol(hi.volume)}</span>}
        </div>
      )}
      <svg width={w} height={h} className="overflow-visible">
        {/* grid */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = pad.t + t * innerH;
          const price = yMax - t * (yMax - yMin);
          return (
            <g key={t}>
              <line x1={pad.l} x2={w - pad.r} y1={y} y2={y} stroke="#e2e8f0" strokeOpacity={0.45} strokeDasharray="3 3" />
              <text x={pad.l - 6} y={y + 3} textAnchor="end" fontSize={10} fill="#94a3b8" fontWeight={600}>{price.toFixed(1)}</text>
            </g>
          );
        })}
        {display.map((b, i) => {
          const x = pad.l + i * slot + slot / 2;
          const up = b.close >= b.open;
          const color = up ? '#10b981' : '#f43f5e';
          const yO = yScale(b.open);
          const yC = yScale(b.close);
          const yH = yScale(b.high);
          const yL = yScale(b.low);
          const top = Math.min(yO, yC);
          const bodyH = Math.max(1.5, Math.abs(yC - yO));
          return (
            <g
              key={b.time}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              className="cursor-crosshair"
            >
              <rect x={x - slot / 2} y={pad.t} width={slot} height={innerH} fill="transparent" />
              <line x1={x} x2={x} y1={yH} y2={yL} stroke={color} strokeWidth={1.25} />
              <rect x={x - bodyW / 2} y={top} width={bodyW} height={bodyH} fill={color} rx={0.5} />
            </g>
          );
        })}
        {/* x labels */}
        {display.length > 0 && [0, Math.floor(display.length / 2), display.length - 1].map((i) => {
          const b = display[i];
          if (!b) return null;
          const x = pad.l + i * slot + slot / 2;
          return (
            <text key={`x-${i}`} x={x} y={h - 8} textAnchor="middle" fontSize={10} fill="#94a3b8" fontWeight={600}>
              {new Date(b.time).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </text>
          );
        })}
      </svg>
      {bars.length > 420 && (
        <p className="text-[10px] text-slate-400 px-1 -mt-1">Showing weekly candles ({display.length}) — daily series has {bars.length} bars.</p>
      )}
    </div>
  );
};

export const StockChart: React.FC<Props> = ({ symbol }) => {
  const [ohlc, setOhlc] = useState<OhlcBar[]>([]);
  const [lineFallback, setLineFallback] = useState<{ time: number; price: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [range, setRange] = useState('3M');
  const [mode, setMode] = useState<ChartMode>('candle');
  const [err, setErr] = useState('');

  const load = async () => {
    if (!symbol) return;
    setLoading(true);
    setErr('');
    try {
      const bars = await fetchOHLCV(symbol);
      if (bars.length >= 5) {
        setOhlc(bars);
        setLineFallback([]);
      } else {
        // Fallback to close-only timeseries if historical OHLCV fails
        const d = await fetchStockHistory(symbol, '1Y');
        setOhlc([]);
        setLineFallback((d || []).filter((p) => p.price > 0));
        setMode('line');
        if (!(d || []).length) setErr('No price history available.');
      }
    } catch (e) {
      console.error('StockChart load failed', e);
      setErr('Failed to load chart data.');
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  const filteredOhlc = useMemo(() => {
    const r = RANGES.find((x) => x.k === range);
    if (!r || r.days === 0) return ohlc;
    const cutoff = Date.now() - r.days * 86400000;
    return ohlc.filter((p) => p.time >= cutoff);
  }, [ohlc, range]);

  const filteredLine = useMemo(() => {
    const r = RANGES.find((x) => x.k === range);
    const src = ohlc.length
      ? ohlc.map((b) => ({ time: b.time, price: b.close }))
      : lineFallback;
    if (!r || r.days === 0) return src;
    const cutoff = Date.now() - r.days * 86400000;
    return src.filter((p) => p.time >= cutoff);
  }, [ohlc, lineFallback, range]);

  const chartData = useMemo(
    () => filteredLine.map((p) => ({
      t: p.time,
      price: p.price,
      label: new Date(p.time).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    })),
    [filteredLine]
  );

  const first = filteredOhlc[0]?.close ?? chartData[0]?.price ?? 0;
  const last = filteredOhlc[filteredOhlc.length - 1]?.close ?? chartData[chartData.length - 1]?.price ?? 0;
  const up = last >= first;
  const changePct = first ? ((last - first) / first) * 100 : 0;
  const stroke = up ? '#10b981' : '#f43f5e';
  const canCandle = filteredOhlc.length >= 5;
  const showCandle = mode === 'candle' && canCandle;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 shadow-card dark:shadow-card-dark overflow-hidden">
      <div className="p-5 border-b border-slate-200/60 dark:border-slate-800 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center text-slate-500 dark:text-slate-400 shrink-0">
            {showCandle ? <CandleIcon size={18} /> : <LineIcon size={18} />}
          </div>
          <div>
            <h3 className="font-display font-black text-lg text-slate-900 dark:text-white tracking-tight">
              {symbol} · {showCandle ? 'Candles' : 'Price'}
            </h3>
            {(filteredOhlc.length > 1 || chartData.length > 1) && (
              <div className="text-xs text-slate-400 flex items-center gap-2">
                Rs. {rs(last)}{' '}
                <span className={`font-bold ${up ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
                  {up ? '+' : ''}{changePct.toFixed(2)}% · {range}
                </span>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canCandle && (
            <div className="flex bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
              <button
                type="button"
                onClick={() => setMode('candle')}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all ${mode === 'candle' ? 'bg-white dark:bg-slate-900 text-teal-600 dark:text-teal-400 shadow-sm' : 'text-slate-500'}`}
              >
                Candles
              </button>
              <button
                type="button"
                onClick={() => setMode('line')}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all ${mode === 'line' ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-slate-500'}`}
              >
                Line
              </button>
            </div>
          )}
          <div className="flex bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
            {RANGES.map((r) => (
              <button
                key={r.k}
                onClick={() => setRange(r.k)}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all ${range === r.k ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'}`}
              >
                {r.k}
              </button>
            ))}
          </div>
          <button onClick={load} disabled={loading} className="p-2 rounded-lg text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors disabled:opacity-40" title="Refresh">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="p-4">
        {loading && filteredOhlc.length === 0 && chartData.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-28 text-slate-400">
            <Loader2 size={22} className="animate-spin mb-2" />
            <span className="text-xs font-medium">Loading OHLCV history for {symbol}…</span>
          </div>
        ) : err && loaded ? (
          <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-28">{err}</p>
        ) : showCandle ? (
          <CandleChart bars={filteredOhlc} height={420} />
        ) : chartData.length < 2 && loaded ? (
          <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-28">No price history available for {symbol}.</p>
        ) : (
          <div className="h-96 sm:h-[420px]">
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
          {canCandle
            ? 'Daily OHLCV from PSX historical (same source as pypsx_toolkit.download) — open, high, low, close, volume.'
            : 'Close-only fallback from PSX timeseries. Candles need OHLCV from /api/ohlc.'}
        </p>
      </div>
    </div>
  );
};
