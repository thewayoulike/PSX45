import React, { useEffect, useMemo, useRef, useState } from 'react';
import { fetchOHLCV, fetchStockHistory, fetchChartAnalysis, OhlcBar, ChartAnalysisPoint } from '../services/psxData';
import { computeChartAnalysisFromBars } from '../utils/chartAnalysis';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  ComposedChart, Line, ReferenceLine, Bar, Cell,
} from 'recharts';
import { LineChart as LineIcon, CandlestickChart as CandleIcon, Activity, Loader2, RefreshCw, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

interface Props { symbol: string | null; }

const ZOOM_STEPS = [1, 1.25, 1.5, 2, 3, 4, 6, 8, 12] as const;
const MIN_WINDOW = 12;

function windowCount(total: number, zoomIdx: number): number {
  if (zoomIdx <= 0 || total === 0) return total;
  const factor = ZOOM_STEPS[Math.min(zoomIdx, ZOOM_STEPS.length - 1)] ?? 1;
  return Math.max(MIN_WINDOW, Math.floor(total / factor));
}

function applyViewport<T>(arr: T[], start: number, count: number): T[] {
  if (!arr.length || count >= arr.length) return arr;
  const s = Math.max(0, Math.min(start, arr.length - count));
  return arr.slice(s, s + count);
}

const ZoomControls: React.FC<{
  zoomIdx: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
}> = ({ zoomIdx, onZoomIn, onZoomOut, onReset }) => {
  const atMin = zoomIdx <= 0;
  const atMax = zoomIdx >= ZOOM_STEPS.length - 1;
  const pct = Math.round((1 / (ZOOM_STEPS[zoomIdx] ?? 1)) * 100);
  return (
    <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-xl p-1 gap-0.5">
      <button
        type="button"
        onClick={onZoomOut}
        disabled={atMin}
        className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-white dark:hover:bg-slate-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        title="Zoom out"
      >
        <ZoomOut size={14} />
      </button>
      <button
        type="button"
        onClick={onReset}
        disabled={atMin}
        className="px-2 py-1.5 rounded-lg text-[10px] font-bold tabular-nums text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-white dark:hover:bg-slate-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors min-w-[44px]"
        title="Reset zoom"
      >
        {atMin ? '100%' : `${pct}%`}
      </button>
      <button
        type="button"
        onClick={onZoomIn}
        disabled={atMax}
        className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-white dark:hover:bg-slate-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        title="Zoom in"
      >
        <ZoomIn size={14} />
      </button>
      {!atMin && (
        <button
          type="button"
          onClick={onReset}
          className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-white dark:hover:bg-slate-900 transition-colors"
          title="Fit all"
        >
          <Maximize2 size={13} />
        </button>
      )}
    </div>
  );
};

const RANGES: { k: string; days: number; period: string }[] = [
  { k: '1M', days: 30, period: '1mo' },
  { k: '3M', days: 90, period: '3mo' },
  { k: '6M', days: 180, period: '6mo' },
  { k: '1Y', days: 365, period: '1y' },
  { k: 'ALL', days: 0, period: 'max' },
];

const rs = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtVol = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : `${Math.round(n)}`;

type ChartMode = 'candle' | 'line' | 'technical';

interface ChartLayers {
  volume: boolean;
  upperBand: boolean;
  sma: boolean;
  lowerBand: boolean;
  rsi: boolean;
  macd: boolean;
}

const DEFAULT_LAYERS: ChartLayers = {
  volume: true,
  upperBand: true,
  sma: true,
  lowerBand: true,
  rsi: true,
  macd: true,
};

const LayerToggle: React.FC<{
  label: string;
  color: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}> = ({ label, color, active, onClick, disabled }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide border transition-all ${
      disabled
        ? 'opacity-30 cursor-not-allowed border-transparent text-slate-400'
        : active
          ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 shadow-sm'
          : 'border-transparent text-slate-400 line-through opacity-60 hover:opacity-100'
    }`}
  >
    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: active && !disabled ? color : '#94a3b8' }} />
    {label}
  </button>
);

const LayerToggleBar: React.FC<{
  layers: ChartLayers;
  onToggle: (key: keyof ChartLayers) => void;
  hasVolume: boolean;
  hasAnalysis: boolean;
  hasMacd: boolean;
}> = ({ layers, onToggle, hasVolume, hasAnalysis, hasMacd }) => (
  <div className="flex flex-wrap items-center gap-1.5 mb-3 px-1">
    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mr-1">Overlays</span>
    <LayerToggle label="Volume" color="#6366f1" active={layers.volume} onClick={() => onToggle('volume')} disabled={!hasVolume} />
    {hasAnalysis && (
      <>
        <LayerToggle label="Upper BB" color="#ef4444" active={layers.upperBand} onClick={() => onToggle('upperBand')} />
        <LayerToggle label="SMA" color="#3b82f6" active={layers.sma} onClick={() => onToggle('sma')} />
        <LayerToggle label="Lower BB" color="#10b981" active={layers.lowerBand} onClick={() => onToggle('lowerBand')} />
        <LayerToggle label="RSI" color="#9333ea" active={layers.rsi} onClick={() => onToggle('rsi')} />
        <LayerToggle label="MACD" color="#2563eb" active={layers.macd} onClick={() => onToggle('macd')} disabled={!hasMacd} />
      </>
    )}
  </div>
);

type AnalysisPointWithVol = ChartAnalysisPoint & { volume?: number; label?: string; volUp?: boolean };

const MacdRechartsPanel: React.FC<{
  data: AnalysisPointWithVol[];
  showXAxis?: boolean;
}> = ({ data, showXAxis = true }) => (
  <div className="h-[110px] sm:h-[120px]">
    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1 px-1">MACD (12, 26, 9)</div>
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.35} vertical={false} />
        <XAxis
          dataKey="label"
          hide={!showXAxis}
          tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }}
          axisLine={false}
          tickLine={false}
          minTickGap={48}
        />
        <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }} axisLine={false} tickLine={false} width={44} />
        <ReferenceLine y={0} stroke="#0f172a" strokeWidth={0.5} strokeOpacity={0.6} />
        <Tooltip
          contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 11 }}
          formatter={(v: any, name: string) => [Number(v).toFixed(3), name]}
          labelFormatter={(l) => l}
        />
        <Bar dataKey="macdHist" name="Histogram" isAnimationActive={false} radius={[1, 1, 0, 0]}>
          {data.map((entry, index) => (
            <Cell
              key={`macd-h-${index}`}
              fill={(entry.macdHist ?? 0) >= 0 ? '#64748b' : '#64748b'}
              fillOpacity={0.4}
            />
          ))}
        </Bar>
        <Line type="monotone" dataKey="macd" name="MACD" stroke="#2563eb" strokeWidth={1} dot={false} isAnimationActive={false} />
        <Line type="monotone" dataKey="macdSignal" name="Signal" stroke="#f97316" strokeWidth={1} dot={false} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  </div>
);

const BollingerRsiChart: React.FC<{
  points: AnalysisPointWithVol[];
  symbol: string;
  layers: ChartLayers;
  hasVolume: boolean;
  hasMacd: boolean;
}> = ({ points, symbol, layers, hasVolume, hasMacd }) => {
  const data = useMemo(
    () =>
      points.map((p, i, arr) => ({
        ...p,
        label: new Date(p.time).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        volume: p.volume ?? 0,
        volUp: i === 0 ? p.close >= (arr[i]?.close ?? p.close) : p.close >= arr[i - 1].close,
      })),
    [points]
  );

  const tip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const row = payload[0]?.payload as AnalysisPointWithVol;
    if (!row) return null;
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 px-3 py-2 text-[11px] shadow-sm tabular-nums">
        <div className="font-bold text-slate-700 dark:text-slate-200 mb-1">{label}</div>
        <div>Close <span className="font-bold">{rs(row.close)}</span></div>
        {layers.upperBand && <div className="text-rose-500">Upper {rs(row.upper)}</div>}
        {layers.sma && <div className="text-blue-500">SMA {rs(row.middle)}</div>}
        {layers.lowerBand && <div className="text-emerald-600">Lower {rs(row.lower)}</div>}
        {layers.rsi && <div className="text-purple-600 font-bold mt-1">RSI {row.rsi.toFixed(1)}</div>}
        {layers.macd && hasMacd && Number.isFinite(row.macd) && (
          <>
            <div className="text-blue-600">MACD {(row.macd ?? 0).toFixed(3)}</div>
            <div className="text-orange-500">Signal {(row.macdSignal ?? 0).toFixed(3)}</div>
            <div className="text-slate-500">Hist {(row.macdHist ?? 0).toFixed(3)}</div>
          </>
        )}
        {layers.volume && hasVolume && (row.volume ?? 0) > 0 && (
          <div className="text-indigo-500 mt-1">Vol {fmtVol(row.volume ?? 0)}</div>
        )}
      </div>
    );
  };

  const showAnyBand = layers.upperBand || layers.sma || layers.lowerBand;

  return (
    <div className="space-y-2">
      <div className="h-[260px] sm:h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.35} vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }} axisLine={false} tickLine={false} minTickGap={48} hide={layers.rsi || layers.macd || (layers.volume && hasVolume)} />
            <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }} axisLine={false} tickLine={false} width={44} />
            <Tooltip content={tip} />
            <Line type="monotone" dataKey="close" name="Close" stroke="#0f172a" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            {layers.upperBand && (
              <Line type="monotone" dataKey="upper" name="Upper Band" stroke="#ef4444" strokeWidth={1} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
            )}
            {layers.sma && (
              <Line type="monotone" dataKey="middle" name="Middle (SMA)" stroke="#3b82f6" strokeWidth={1} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
            )}
            {layers.lowerBand && (
              <Line type="monotone" dataKey="lower" name="Lower Band" stroke="#10b981" strokeWidth={1} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {layers.rsi && (
      <div className="h-[110px] sm:h-[120px]">
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1 px-1">RSI (14)</div>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.35} vertical={false} />
            <XAxis dataKey="label" hide={!(layers.volume && hasVolume) && !(layers.macd && hasMacd)} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }} axisLine={false} tickLine={false} minTickGap={48} />
            <YAxis domain={[0, 100]} ticks={[30, 50, 70]} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }} axisLine={false} tickLine={false} width={44} />
            <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="4 3" strokeWidth={1} />
            <ReferenceLine y={30} stroke="#10b981" strokeDasharray="4 3" strokeWidth={1} />
            <Tooltip
              contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 11 }}
              formatter={(v: any) => [Number(v).toFixed(1), 'RSI']}
              labelFormatter={(l) => l}
            />
            <Line type="monotone" dataKey="rsi" stroke="#9333ea" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      )}
      {layers.macd && hasMacd && (
        <MacdRechartsPanel data={data} showXAxis={!(layers.volume && hasVolume)} />
      )}
      {layers.volume && hasVolume && (
      <div className="h-[72px] sm:h-[80px]">
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1 px-1">Volume</div>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 2, right: 8, left: 0, bottom: 0 }}>
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }} axisLine={false} tickLine={false} minTickGap={48} />
            <YAxis hide domain={[0, 'auto']} />
            <Tooltip
              contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 11 }}
              formatter={(v: any) => [fmtVol(Number(v)), 'Volume']}
              labelFormatter={(l) => l}
            />
            <Bar dataKey="volume" isAnimationActive={false} radius={[1, 1, 0, 0]}>
              {data.map((entry, index) => (
                <Cell key={`vol-${index}`} fill={entry.volUp ? '#10b981' : '#f43f5e'} fillOpacity={0.85} />
              ))}
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      )}
      {!showAnyBand && !layers.rsi && !layers.macd && !(layers.volume && hasVolume) && (
        <p className="text-[10px] text-slate-400 px-1">Enable overlays above to show indicators.</p>
      )}
      <p className="text-[10px] text-slate-400 px-1">{symbol} — pypsx_toolkit analysis</p>
    </div>
  );
};

const LineVolumePanel: React.FC<{ bars: OhlcBar[] }> = ({ bars }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth || 640);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const slot = Math.max(4, (width - 64) / Math.max(bars.length, 1));
  return (
    <div ref={ref} className="w-full">
      <VolumeMiniChart bars={bars} slot={slot} padL={52} width={width} />
    </div>
  );
};

type CandleInterval = 'day' | 'month';

/** Aggregate daily OHLCV bars into monthly candles. */
function aggregateMonthly(bars: OhlcBar[]): OhlcBar[] {
  if (bars.length < 2) return bars;
  const out: OhlcBar[] = [];
  let bucket: OhlcBar | null = null;
  let monthKey = '';
  for (const b of bars) {
    const d = new Date(b.time);
    const mk = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    if (!bucket || mk !== monthKey) {
      if (bucket) out.push(bucket);
      monthKey = mk;
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

function fmtCandleDate(ms: number, interval: CandleInterval): string {
  if (interval === 'month') {
    return new Date(ms).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  }
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Wider bars when the series is sparse (e.g. monthly 1Y ≈ 12 candles). */
function chartBarMetrics(slot: number, barCount: number, interval: CandleInterval) {
  const sparse = barCount <= 36 || interval === 'month';
  if (sparse) {
    const w = Math.max(6, Math.min(slot * 0.74, interval === 'month' ? 52 : 22));
    return { bodyW: w, barW: w };
  }
  return {
    bodyW: Math.max(2, Math.min(10, slot * 0.62)),
    barW: Math.max(2, Math.min(8, slot * 0.55)),
  };
}

/** Match analysis points to OHLC bars by exact time or calendar day. */
function alignAnalysisToBars(bars: OhlcBar[], points: ChartAnalysisPoint[]): (ChartAnalysisPoint | null)[] {
  const byTime = new Map<number, ChartAnalysisPoint>();
  const byDay = new Map<string, ChartAnalysisPoint>();
  for (const p of points) {
    byTime.set(p.time, p);
    byDay.set(new Date(p.time).toISOString().slice(0, 10), p);
  }
  return bars.map((b) => byTime.get(b.time) ?? byDay.get(new Date(b.time).toISOString().slice(0, 10)) ?? null);
}

function polylinePath(values: (number | null | undefined)[], xAt: (i: number) => number, yAt: (v: number) => number): string {
  let d = '';
  values.forEach((v, i) => {
    if (v == null || !Number.isFinite(v)) return;
    d += `${d ? ' L' : 'M'} ${xAt(i)} ${yAt(v)}`;
  });
  return d;
}

const RsiMiniChart: React.FC<{
  aligned: (ChartAnalysisPoint | null)[];
  slot: number;
  padL: number;
  width: number;
  height?: number;
  showXLabels?: boolean;
}> = ({ aligned, slot, padL, width, height = 110, showXLabels = false }) => {
  const pad = { t: 8, r: 12, b: 20, l: 52 };
  const innerH = height - pad.t - pad.b;
  const yRsi = (v: number) => pad.t + ((100 - v) / 100) * innerH;
  const xAt = (i: number) => padL + i * slot + slot / 2;

  const rsiPath = polylinePath(
    aligned.map((p) => p?.rsi),
    xAt,
    yRsi
  );

  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1 px-1">RSI (14)</div>
      <svg width={width} height={height} className="overflow-visible">
        {[30, 50, 70].map((lvl) => {
          const y = yRsi(lvl);
          const color = lvl === 70 ? '#ef4444' : lvl === 30 ? '#10b981' : '#e2e8f0';
          return (
            <g key={lvl}>
              <line x1={padL} x2={width - pad.r} y1={y} y2={y} stroke={color} strokeOpacity={lvl === 50 ? 0.35 : 0.8} strokeDasharray={lvl === 50 ? '2 4' : '4 3'} strokeWidth={1} />
              <text x={padL - 6} y={y + 3} textAnchor="end" fontSize={10} fill="#94a3b8" fontWeight={600}>{lvl}</text>
            </g>
          );
        })}
        {rsiPath && (
          <path d={rsiPath} fill="none" stroke="#9333ea" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
        )}
        {showXLabels && aligned.length > 0 && [0, Math.floor(aligned.length / 2), aligned.length - 1].map((i) => {
          const pt = aligned[i];
          if (!pt) return null;
          const x = xAt(i);
          return (
            <text key={`rsi-x-${i}`} x={x} y={height - 4} textAnchor="middle" fontSize={10} fill="#94a3b8" fontWeight={600}>
              {new Date(pt.time).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </text>
          );
        })}
      </svg>
    </div>
  );
};

const MacdMiniChart: React.FC<{
  aligned: (ChartAnalysisPoint | null)[];
  slot: number;
  padL: number;
  width: number;
  height?: number;
  showXLabels?: boolean;
}> = ({ aligned, slot, padL, width, height = 120, showXLabels = false }) => {
  const pad = { t: 8, r: 12, b: 20, l: 52 };
  const innerH = height - pad.t - pad.b;
  const xAt = (i: number) => padL + i * slot + slot / 2;
  const barW = Math.max(2, Math.min(8, slot * 0.55));

  const nums: number[] = [0];
  aligned.forEach((p) => {
    if (!p) return;
    if (Number.isFinite(p.macd)) nums.push(p.macd!);
    if (Number.isFinite(p.macdSignal)) nums.push(p.macdSignal!);
    if (Number.isFinite(p.macdHist)) nums.push(p.macdHist!);
  });
  const minV = Math.min(...nums);
  const maxV = Math.max(...nums);
  const span = maxV - minV || 1;
  const yMin = minV - span * 0.08;
  const yMax = maxV + span * 0.08;
  const yScale = (v: number) => pad.t + ((yMax - v) / (yMax - yMin)) * innerH;
  const zeroY = yScale(0);

  const macdPath = polylinePath(aligned.map((p) => p?.macd), xAt, yScale);
  const signalPath = polylinePath(aligned.map((p) => p?.macdSignal), xAt, yScale);

  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1 px-1">MACD (12, 26, 9)</div>
      <svg width={width} height={height} className="overflow-visible">
        <line x1={padL} x2={width - pad.r} y1={zeroY} y2={zeroY} stroke="#0f172a" strokeOpacity={0.5} strokeWidth={0.5} />
        {aligned.map((p, i) => {
          if (!p || !Number.isFinite(p.macdHist)) return null;
          const x = xAt(i);
          const y = yScale(p.macdHist!);
          const top = Math.min(y, zeroY);
          const h = Math.max(1, Math.abs(y - zeroY));
          return (
            <rect
              key={`macd-h-${i}`}
              x={x - barW / 2}
              y={top}
              width={barW}
              height={h}
              fill="#64748b"
              fillOpacity={0.4}
              rx={0.5}
            />
          );
        })}
        {macdPath && (
          <path d={macdPath} fill="none" stroke="#2563eb" strokeWidth={1.25} strokeLinejoin="round" strokeLinecap="round" />
        )}
        {signalPath && (
          <path d={signalPath} fill="none" stroke="#f97316" strokeWidth={1.25} strokeLinejoin="round" strokeLinecap="round" />
        )}
        {showXLabels && aligned.length > 0 && [0, Math.floor(aligned.length / 2), aligned.length - 1].map((i) => {
          const pt = aligned[i];
          if (!pt) return null;
          return (
            <text key={`macd-x-${i}`} x={xAt(i)} y={height - 4} textAnchor="middle" fontSize={10} fill="#94a3b8" fontWeight={600}>
              {new Date(pt.time).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </text>
          );
        })}
      </svg>
    </div>
  );
};

const VolumeMiniChart: React.FC<{
  bars: OhlcBar[];
  slot: number;
  padL: number;
  width: number;
  height?: number;
  candleInterval?: CandleInterval;
  barW?: number;
}> = ({ bars, slot, padL, width, height = 72, candleInterval = 'day', barW: barWProp }) => {
  const pad = { t: 4, r: 12, b: 22, l: 52 };
  const innerH = height - pad.t - pad.b;
  const maxV = Math.max(...bars.map((b) => b.volume), 1);
  const yVol = (v: number) => pad.t + innerH - (v / maxV) * innerH;
  const xAt = (i: number) => padL + i * slot + slot / 2;
  const barW = barWProp ?? chartBarMetrics(slot, bars.length, candleInterval).barW;

  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1 px-1">Volume</div>
      <svg width={width} height={height} className="overflow-visible">
        <line x1={padL} x2={width - pad.r} y1={pad.t + innerH} y2={pad.t + innerH} stroke="#e2e8f0" strokeOpacity={0.5} />
        <text x={padL - 6} y={pad.t + 4} textAnchor="end" fontSize={9} fill="#94a3b8" fontWeight={600}>{fmtVol(maxV)}</text>
        {bars.map((b, i) => {
          const x = xAt(i);
          const top = yVol(b.volume);
          const h = pad.t + innerH - top;
          const up = b.close >= b.open;
          return (
            <rect
              key={`vol-${b.time}`}
              x={x - barW / 2}
              y={top}
              width={barW}
              height={Math.max(1, h)}
              fill={up ? '#10b981' : '#f43f5e'}
              fillOpacity={0.85}
              rx={0.5}
            />
          );
        })}
        {bars.length > 0 && [0, Math.floor(bars.length / 2), bars.length - 1].map((i) => {
          const b = bars[i];
          if (!b) return null;
          return (
            <text key={`vol-x-${i}`} x={xAt(i)} y={height - 4} textAnchor="middle" fontSize={10} fill="#94a3b8" fontWeight={600}>
              {fmtCandleDate(b.time, candleInterval)}
            </text>
          );
        })}
      </svg>
    </div>
  );
};

const CandleChart: React.FC<{
  bars: OhlcBar[];
  analysis?: ChartAnalysisPoint[];
  layers: ChartLayers;
  candleInterval?: CandleInterval;
  height?: number;
  panning?: boolean;
  canPan?: boolean;
}> = ({
  bars,
  analysis = [],
  layers,
  candleInterval = 'day',
  height = 320,
  panning = false,
  canPan = false,
}) => {
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

  const display = bars;
  const showOverlay = analysis.length > 0;
  const showBands = showOverlay && (layers.upperBand || layers.sma || layers.lowerBand);
  const aligned = useMemo(
    () => (showOverlay ? alignAnalysisToBars(display, analysis) : []),
    [display, analysis, showOverlay]
  );
  const hasVolume = bars.some((b) => b.volume > 0);
  const showVolume = layers.volume && hasVolume;
  const showRsi = layers.rsi && showOverlay && aligned.some(Boolean);
  const showMacd = layers.macd && showOverlay && aligned.some((p) => p && Number.isFinite(p.macd));
  const showBottomX = showVolume || showRsi || showMacd;

  let minP = Math.min(...display.map((b) => b.low));
  let maxP = Math.max(...display.map((b) => b.high));
  if (showBands) {
    aligned.forEach((p, i) => {
      if (!p) return;
      if (layers.upperBand) maxP = Math.max(maxP, p.upper);
      if (layers.lowerBand) minP = Math.min(minP, p.lower);
      if (layers.sma) {
        minP = Math.min(minP, p.middle);
        maxP = Math.max(maxP, p.middle);
      }
    });
  }
  const span = maxP - minP || maxP * 0.02 || 1;
  const yMin = minP - span * 0.04;
  const yMax = maxP + span * 0.04;
  const yScale = (p: number) => pad.t + ((yMax - p) / (yMax - yMin)) * innerH;
  const plotInnerW =
    candleInterval === 'month' && display.length <= 24
      ? Math.min(innerW, display.length * 44)
      : innerW;
  const slot = plotInnerW / Math.max(display.length, 1);
  const plotOffset = pad.l + (innerW - plotInnerW) / 2;
  const { bodyW, barW } = chartBarMetrics(slot, display.length, candleInterval);

  const hi = hover != null ? display[hover] : null;
  const hiAnalysis = hover != null && aligned[hover] ? aligned[hover] : null;
  const xAt = (i: number) => plotOffset + i * slot + slot / 2;

  const upperPath = showBands && layers.upperBand ? polylinePath(aligned.map((p) => p?.upper), xAt, yScale) : '';
  const middlePath = showBands && layers.sma ? polylinePath(aligned.map((p) => p?.middle), xAt, yScale) : '';
  const lowerPath = showBands && layers.lowerBand ? polylinePath(aligned.map((p) => p?.lower), xAt, yScale) : '';

  return (
    <div ref={wrapRef} className={`relative w-full select-none ${canPan ? (panning ? 'cursor-grabbing' : 'cursor-grab') : ''}`}>
      {hi && (
        <div className="absolute top-1 left-14 z-10 pointer-events-none rounded-lg bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-[11px] shadow-sm tabular-nums">
          <span className="font-bold text-slate-700 dark:text-slate-200">
            {fmtCandleDate(hi.time, candleInterval)}
          </span>
          <span className="text-slate-500 ml-2">O {rs(hi.open)}</span>
          <span className="text-slate-500 ml-1.5">H {rs(hi.high)}</span>
          <span className="text-slate-500 ml-1.5">L {rs(hi.low)}</span>
          <span className={`ml-1.5 font-bold ${hi.close >= hi.open ? 'text-emerald-600' : 'text-rose-500'}`}>C {rs(hi.close)}</span>
          {hi.volume > 0 && <span className="text-slate-400 ml-1.5">V {fmtVol(hi.volume)}</span>}
          {hiAnalysis && (
            <>
              {layers.upperBand && <span className="text-rose-500 ml-2">Upper {rs(hiAnalysis.upper)}</span>}
              {layers.sma && <span className="text-blue-500 ml-1.5">SMA {rs(hiAnalysis.middle)}</span>}
              {layers.lowerBand && <span className="text-emerald-600 ml-1.5">Lower {rs(hiAnalysis.lower)}</span>}
              {layers.rsi && <span className="text-purple-600 font-bold ml-1.5">RSI {hiAnalysis.rsi.toFixed(1)}</span>}
              {layers.macd && Number.isFinite(hiAnalysis.macd) && (
                <>
                  <span className="text-blue-600 ml-1.5">MACD {hiAnalysis.macd!.toFixed(2)}</span>
                  <span className="text-orange-500 ml-1">Sig {hiAnalysis.macdSignal!.toFixed(2)}</span>
                </>
              )}
            </>
          )}
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
        {showBands && upperPath && (
          <path d={upperPath} fill="none" stroke="#ef4444" strokeWidth={1} strokeDasharray="4 3" strokeLinejoin="round" />
        )}
        {showBands && middlePath && (
          <path d={middlePath} fill="none" stroke="#3b82f6" strokeWidth={1} strokeDasharray="4 3" strokeLinejoin="round" />
        )}
        {showBands && lowerPath && (
          <path d={lowerPath} fill="none" stroke="#10b981" strokeWidth={1} strokeDasharray="4 3" strokeLinejoin="round" />
        )}
        {display.map((b, i) => {
          const x = xAt(i);
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
        {/* x labels — only when no sub-panel below */}
        {!showBottomX && display.length > 0 && [0, Math.floor(display.length / 2), display.length - 1].map((i) => {
          const b = display[i];
          if (!b) return null;
          return (
            <text key={`x-${i}`} x={xAt(i)} y={h - 8} textAnchor="middle" fontSize={10} fill="#94a3b8" fontWeight={600}>
              {fmtCandleDate(b.time, candleInterval)}
            </text>
          );
        })}
      </svg>
      {showRsi && (
        <RsiMiniChart aligned={aligned} slot={slot} padL={plotOffset} width={w} showXLabels={!showVolume && !showMacd} />
      )}
      {showMacd && (
        <MacdMiniChart aligned={aligned} slot={slot} padL={plotOffset} width={w} showXLabels={!showVolume} />
      )}
      {showVolume && (
        <VolumeMiniChart bars={display} slot={slot} padL={plotOffset} width={w} candleInterval={candleInterval} barW={barW} />
      )}
    </div>
  );
};

export const StockChart: React.FC<Props> = ({ symbol }) => {
  const [ohlc, setOhlc] = useState<OhlcBar[]>([]);
  const [lineFallback, setLineFallback] = useState<{ time: number; price: number }[]>([]);
  const [analysis, setAnalysis] = useState<ChartAnalysisPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [range, setRange] = useState('3M');
  const [mode, setMode] = useState<ChartMode>('candle');
  const [candleInterval, setCandleInterval] = useState<CandleInterval>('day');
  const [err, setErr] = useState('');
  const [analysisErr, setAnalysisErr] = useState('');
  const [zoomIdx, setZoomIdx] = useState(0);
  const [viewStart, setViewStart] = useState(0);
  const [panning, setPanning] = useState(false);
  const [layers, setLayers] = useState<ChartLayers>(DEFAULT_LAYERS);
  const chartAreaRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{ x: number; start: number } | null>(null);

  const toggleLayer = (key: keyof ChartLayers) => {
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const rangeMeta = RANGES.find((x) => x.k === range) ?? RANGES[1];

  useEffect(() => {
    setZoomIdx(0);
    setViewStart(0);
  }, [symbol, range, mode, candleInterval]);

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
        const d = await fetchStockHistory(symbol, '1Y');
        setOhlc([]);
        setLineFallback((d || []).filter((p) => p.price > 0));
        if (mode === 'candle') setMode('line');
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

  const loadAnalysis = async () => {
    if (!symbol) return;
    setAnalysisLoading(true);
    setAnalysisErr('');
    try {
      const points = await fetchChartAnalysis(symbol, rangeMeta.period);
      setAnalysis(points);
      if (!points.length) setAnalysisErr('No analysis data — install pypsx-toolkit locally.');
    } catch (e) {
      console.error('Chart analysis load failed', e);
      setAnalysis([]);
      setAnalysisErr('Failed to load Bollinger/RSI analysis.');
    } finally {
      setAnalysisLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  useEffect(() => {
    if (symbol) loadAnalysis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, symbol, range]);

  const filteredAnalysis = useMemo(() => {
    const r = RANGES.find((x) => x.k === range);
    if (!r || r.days === 0) return analysis;
    const cutoff = Date.now() - r.days * 86400000;
    return analysis.filter((p) => p.time >= cutoff);
  }, [analysis, range]);

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

  const canCandle = filteredOhlc.length >= 5;
  const showCandle = mode === 'candle' && canCandle;
  const showTechnical = mode === 'technical';
  const candleOhlc = useMemo(() => {
    if (!showCandle) return filteredOhlc;
    if (candleInterval === 'month') return aggregateMonthly(filteredOhlc);
    return filteredOhlc;
  }, [filteredOhlc, candleInterval, showCandle]);
  const modeLabel = showTechnical
    ? 'BB + RSI'
    : showCandle
      ? candleInterval === 'month'
        ? 'Candles · Monthly'
        : 'Candles · Daily'
      : 'Price';

  const primaryLen = showCandle
    ? candleOhlc.length
    : showTechnical
      ? filteredAnalysis.length
      : chartData.length;
  const viewCount = windowCount(primaryLen, zoomIdx);
  const maxViewStart = Math.max(0, primaryLen - viewCount);
  const canZoom = primaryLen >= MIN_WINDOW;
  const canPan = canZoom && viewCount < primaryLen;

  useEffect(() => {
    setViewStart((s) => Math.min(s, maxViewStart));
  }, [maxViewStart]);

  const snapToRecent = (nextZoomIdx: number) => {
    const cnt = windowCount(primaryLen, nextZoomIdx);
    setViewStart(Math.max(0, primaryLen - cnt));
  };

  const zoomIn = () => {
    setZoomIdx((z) => {
      const next = Math.min(ZOOM_STEPS.length - 1, z + 1);
      if (next !== z) snapToRecent(next);
      return next;
    });
  };
  const zoomOut = () => setZoomIdx((z) => Math.max(0, z - 1));
  const resetZoom = () => {
    setZoomIdx(0);
    setViewStart(0);
  };

  const visibleOhlc = useMemo(
    () => applyViewport(candleOhlc, viewStart, viewCount),
    [candleOhlc, viewStart, viewCount]
  );
  const visibleChartData = useMemo(
    () => applyViewport(chartData, viewStart, viewCount),
    [chartData, viewStart, viewCount]
  );
  const visibleAnalysis = useMemo(() => {
    if (showTechnical) return applyViewport(filteredAnalysis, viewStart, viewCount);

    let t0: number | undefined;
    let t1: number | undefined;
    if (showCandle && visibleOhlc.length) {
      t0 = visibleOhlc[0].time;
      t1 = visibleOhlc[visibleOhlc.length - 1].time;
    } else if (mode === 'line' && visibleChartData.length) {
      t0 = visibleChartData[0].t;
      t1 = visibleChartData[visibleChartData.length - 1].t;
    } else if (visibleOhlc.length) {
      t0 = visibleOhlc[0].time;
      t1 = visibleOhlc[visibleOhlc.length - 1].time;
    }
    if (t0 == null || t1 == null) return [];
    return filteredAnalysis.filter((p) => p.time >= t0! && p.time <= t1!);
  }, [filteredAnalysis, visibleOhlc, visibleChartData, viewStart, viewCount, showTechnical, showCandle, mode]);

  const volByDay = useMemo(() => {
    const m = new Map<string, number>();
    filteredOhlc.forEach((b) => m.set(new Date(b.time).toISOString().slice(0, 10), b.volume));
    return m;
  }, [filteredOhlc]);

  const visibleAnalysisWithVol = useMemo(
    () =>
      visibleAnalysis.map((p, i, arr) => ({
        ...p,
        label: new Date(p.time).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        volume: volByDay.get(new Date(p.time).toISOString().slice(0, 10)) ?? 0,
        volUp: i === 0 ? p.close >= p.close : p.close >= arr[i - 1].close,
      })),
    [visibleAnalysis, volByDay]
  );

  const hasVolume = visibleOhlc.some((b) => b.volume > 0);

  const monthlyAnalysis = useMemo(
    () => (showCandle && candleInterval === 'month' ? computeChartAnalysisFromBars(candleOhlc, { monthly: true }) : []),
    [candleOhlc, showCandle, candleInterval]
  );

  const candleAnalysis = useMemo(() => {
    if (!showCandle) return [];
    if (candleInterval === 'month') {
      if (!visibleOhlc.length) return [];
      const t0 = visibleOhlc[0].time;
      const t1 = visibleOhlc[visibleOhlc.length - 1].time;
      return monthlyAnalysis.filter((p) => p.time >= t0 && p.time <= t1);
    }
    return visibleAnalysis;
  }, [showCandle, candleInterval, visibleOhlc, monthlyAnalysis, visibleAnalysis]);

  const analysisForLayers = showCandle && candleInterval === 'month' ? monthlyAnalysis : visibleAnalysis;
  const hasAnalysis = analysisForLayers.length > 0;
  const hasMacd = analysisForLayers.some((p) => Number.isFinite(p.macd));

  const visibleRangeLabel = useMemo(() => {
    const pick = showTechnical
      ? visibleAnalysis
      : showCandle
        ? visibleOhlc
        : visibleChartData;
    if (pick.length < 2) return '';
    const t0 = (pick[0] as { time?: number; t?: number }).time ?? (pick[0] as { t: number }).t;
    const t1 = (pick[pick.length - 1] as { time?: number; t?: number }).time ?? (pick[pick.length - 1] as { t: number }).t;
    const fmt = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    return `${fmt(t0)} – ${fmt(t1)}`;
  }, [showTechnical, showCandle, visibleAnalysis, visibleOhlc, visibleChartData]);

  const onPanStart = (clientX: number) => {
    if (!canPan) return;
    panRef.current = { x: clientX, start: viewStart };
    setPanning(true);
  };

  const onPanMove = (clientX: number) => {
    if (!panRef.current || !canPan) return;
    const width = chartAreaRef.current?.clientWidth ?? 640;
    const chartWidth = Math.max(width - 64, 120);
    const dx = clientX - panRef.current.x;
    const barShift = Math.round(-dx * (viewCount / chartWidth));
    setViewStart(Math.max(0, Math.min(maxViewStart, panRef.current.start + barShift)));
  };

  const onPanEnd = () => {
    panRef.current = null;
    setPanning(false);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!canPan || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    onPanStart(e.clientX);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!panRef.current) return;
    onPanMove(e.clientX);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!panRef.current) return;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    onPanEnd();
  };

  useEffect(() => {
    const el = chartAreaRef.current;
    if (!el || !canZoom) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.deltaY < 0) {
        setZoomIdx((z) => {
          const next = Math.min(ZOOM_STEPS.length - 1, z + 1);
          if (next !== z) {
            const cnt = windowCount(primaryLen, next);
            setViewStart(Math.max(0, primaryLen - cnt));
          }
          return next;
        });
      } else if (e.deltaY > 0) {
        setZoomIdx((z) => Math.max(0, z - 1));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [canZoom, primaryLen]);

  const first = filteredOhlc[0]?.close ?? chartData[0]?.price ?? 0;
  const last = filteredOhlc[filteredOhlc.length - 1]?.close ?? chartData[chartData.length - 1]?.price ?? 0;
  const up = last >= first;
  const changePct = first ? ((last - first) / first) * 100 : 0;
  const stroke = up ? '#10b981' : '#f43f5e';

  const refresh = () => {
    load();
    if (mode === 'technical' || mode === 'candle') loadAnalysis();
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 shadow-card dark:shadow-card-dark overflow-hidden">
      <div className="p-5 border-b border-slate-200/60 dark:border-slate-800 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center text-slate-500 dark:text-slate-400 shrink-0">
            {showTechnical ? <Activity size={18} /> : showCandle ? <CandleIcon size={18} /> : <LineIcon size={18} />}
          </div>
          <div>
            <h3 className="font-display font-black text-lg text-slate-900 dark:text-white tracking-tight">
              {symbol} · {modeLabel}
            </h3>
            {(filteredOhlc.length > 1 || chartData.length > 1) && (
              <div className="text-xs text-slate-400 flex items-center gap-2 flex-wrap">
                Rs. {rs(last)}{' '}
                <span className={`font-bold ${up ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
                  {up ? '+' : ''}{changePct.toFixed(2)}% · {range}
                </span>
                {canPan && visibleRangeLabel && (
                  <span className="text-[10px] font-medium text-slate-400">{visibleRangeLabel}</span>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
            {canCandle && (
              <button
                type="button"
                onClick={() => setMode('candle')}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all ${mode === 'candle' ? 'bg-white dark:bg-slate-900 text-teal-600 dark:text-teal-400 shadow-sm' : 'text-slate-500'}`}
              >
                Candles
              </button>
            )}
            <button
              type="button"
              onClick={() => setMode('line')}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all ${mode === 'line' ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-slate-500'}`}
            >
              Line
            </button>
            <button
              type="button"
              onClick={() => setMode('technical')}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all ${mode === 'technical' ? 'bg-white dark:bg-slate-900 text-purple-600 dark:text-purple-400 shadow-sm' : 'text-slate-500'}`}
            >
              BB + RSI
            </button>
          </div>
          {showCandle && (
            <div className="flex bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
              <button
                type="button"
                onClick={() => setCandleInterval('day')}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all ${candleInterval === 'day' ? 'bg-white dark:bg-slate-900 text-teal-600 dark:text-teal-400 shadow-sm' : 'text-slate-500'}`}
              >
                Day
              </button>
              <button
                type="button"
                onClick={() => setCandleInterval('month')}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all ${candleInterval === 'month' ? 'bg-white dark:bg-slate-900 text-teal-600 dark:text-teal-400 shadow-sm' : 'text-slate-500'}`}
              >
                Month
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
          {canZoom && (
            <ZoomControls zoomIdx={zoomIdx} onZoomIn={zoomIn} onZoomOut={zoomOut} onReset={resetZoom} />
          )}
          <button onClick={refresh} disabled={loading || analysisLoading} className="p-2 rounded-lg text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors disabled:opacity-40" title="Refresh">
            <RefreshCw size={15} className={loading || analysisLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div
        className={`p-4 ${canPan ? (panning ? 'cursor-grabbing touch-none' : 'cursor-grab touch-none') : ''}`}
        ref={chartAreaRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {(showCandle || showTechnical || mode === 'line') && !loading && (hasVolume || hasAnalysis) && (
          <LayerToggleBar
            layers={layers}
            onToggle={toggleLayer}
            hasVolume={hasVolume}
            hasAnalysis={hasAnalysis}
            hasMacd={hasMacd}
          />
        )}
        {showTechnical ? (
          analysisLoading && analysis.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-28 text-slate-400">
              <Loader2 size={22} className="animate-spin mb-2" />
              <span className="text-xs font-medium">Computing Bollinger Bands, RSI & MACD for {symbol}…</span>
            </div>
          ) : analysisErr && analysis.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-28">{analysisErr}</p>
          ) : analysis.length < 2 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-28">Not enough data for technical analysis.</p>
          ) : (
            <BollingerRsiChart
              points={visibleAnalysisWithVol}
              symbol={symbol || ''}
              layers={layers}
              hasVolume={hasVolume}
              hasMacd={hasMacd}
            />
          )
        ) : loading && filteredOhlc.length === 0 && chartData.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-28 text-slate-400">
            <Loader2 size={22} className="animate-spin mb-2" />
            <span className="text-xs font-medium">Loading OHLCV history for {symbol}…</span>
          </div>
        ) : err && loaded ? (
          <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-28">{err}</p>
        ) : showCandle ? (
          <div className="space-y-1">
            {analysisLoading && filteredAnalysis.length === 0 && (
              <div className="flex items-center gap-2 text-[11px] text-slate-400 px-1 pb-1">
                <Loader2 size={14} className="animate-spin" /> Loading Bollinger, RSI & MACD…
              </div>
            )}
            <CandleChart
              bars={visibleOhlc}
              analysis={candleAnalysis}
              layers={layers}
              candleInterval={candleInterval}
              height={320}
              panning={panning}
              canPan={canPan}
            />
            {!candleAnalysis.length && !analysisLoading && candleInterval === 'day' && (
              <p className="text-[10px] text-slate-400 px-1">BB/RSI/MACD overlay needs pypsx-toolkit locally.</p>
            )}
            {!candleAnalysis.length && candleInterval === 'month' && visibleOhlc.length >= 3 && (
              <p className="text-[10px] text-slate-400 px-1">Need more monthly bars for indicator overlays.</p>
            )}
          </div>
        ) : chartData.length < 2 && loaded ? (
          <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-28">No price history available for {symbol}.</p>
        ) : (
          <div className="space-y-1">
            <div className="h-96 sm:h-[420px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={visibleChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="scg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={stroke} stopOpacity={0.28} />
                      <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.4} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }} axisLine={false} tickLine={false} minTickGap={40} hide={(layers.volume && hasVolume) || (layers.macd && hasMacd)} />
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
            {layers.macd && hasMacd && visibleAnalysisWithVol.length > 0 && (
              <MacdRechartsPanel
                data={visibleAnalysisWithVol}
                showXAxis={!(layers.volume && hasVolume)}
              />
            )}
            {layers.volume && hasVolume && visibleOhlc.length > 0 && (
              <LineVolumePanel bars={visibleOhlc} />
            )}
            {!filteredAnalysis.length && !analysisLoading && mode === 'line' && (
              <p className="text-[10px] text-slate-400 px-1">MACD/RSI overlays need pypsx-toolkit locally.</p>
            )}
          </div>
        )}
        {!showTechnical && !showCandle && (
        <p className="text-[10px] text-slate-400 mt-2 px-1">
          {canCandle
            ? 'Daily OHLCV from PSX historical (same source as pypsx_toolkit.download) — open, high, low, close, volume.'
            : 'Close-only fallback from PSX timeseries. Candles need OHLCV from /api/proxy?ohlc=.'}
        </p>
        )}
        {canPan && (
          <p className="text-[10px] text-slate-400 mt-2 px-1">
            Drag left/right to pan · scroll or +/- to zoom · {visibleRangeLabel}
          </p>
        )}
      </div>
    </div>
  );
};
