import React, { useCallback, useEffect, useMemo, useRef, useState, useId } from 'react';
import { fetchOHLCV, fetchStockHistory, fetchChartAnalysis, OhlcBar, ChartAnalysisPoint } from '../services/psxData';
import { computeChartAnalysisFromBars } from '../utils/chartAnalysis';
import {
  computeAwaisOverlays,
  DEFAULT_AWAIS_LAYERS,
  AwaisLayers,
  AwaisOverlayData,
  cloneAwaisLayers,
  hasAnyBb,
  hasAnyPivot,
  hasAnySupertrend,
  isMaSeriesVisible,
  ChartTimeframe,
  PivotLabel,
} from '../utils/awaisIndicators';
import { IndicatorsPanel, AwaisSvgOverlays, AwaisPivotLabels } from './AwaisChartOverlays';
import {
  MomentumPanel,
  MomentumMiniChart,
  momentumHoverText,
  MOMENTUM_PANEL_HEIGHT,
  MOMENTUM_MACD_HEIGHT,
  VOLUME_PANEL_HEIGHT,
  CANDLE_CHART_HEIGHT,
} from './MomentumPanel';
import {
  activeMomentumTypes,
  countMomentumEnabled,
  DEFAULT_MOMENTUM_CONFIG,
  MomentumConfig,
  cloneMomentumConfig,
  computeMomentumSeries,
  sliceMomentumSeries,
} from '../utils/momentumIndicators';
import {
  loadChartSettings,
  persistChartSettings,
  CHART_SETTINGS_EVENT,
  type ChartUserSettings,
} from '../services/chartSettingsStorage';
import {
  ChartDrawing,
  DrawTool,
  DEFAULT_DRAW_COLOR,
  hitTestDrawings,
  loadDrawings,
  newDrawingId,
  pointFromPixel,
  saveDrawings,
  type DrawRenderCoords,
} from '../utils/chartDrawings';
import { ChartDrawingsLayer, DrawToolsToolbar } from './ChartDrawings';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  ComposedChart, Line, ReferenceLine, Bar, Cell,
} from 'recharts';
import { LineChart as LineIcon, CandlestickChart as CandleIcon, Activity, Loader2, RefreshCw, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

interface Props { symbol: string | null; }

const ZOOM_STEPS = [1, 1.25, 1.5, 2, 3, 4, 6, 8, 12] as const;
const MIN_WINDOW = 12;
const PRICE_ZOOM_MIN = -5;
const PRICE_ZOOM_MAX = 4;

function priceSpanMultiplier(zoomIdx: number): number {
  if (zoomIdx === 0) return 1;
  if (zoomIdx < 0) return Math.pow(0.85, -zoomIdx);
  return Math.pow(1.28, zoomIdx);
}

function clampPanOffset(offset: number, limits: { min: number; max: number }): number {
  const lo = Math.min(limits.min, limits.max);
  const hi = Math.max(limits.min, limits.max);
  return Math.max(lo, Math.min(hi, offset));
}

function collectCandleBounds(bars: OhlcBar[]): { minP: number; maxP: number; span: number } {
  if (!bars.length) return { minP: 0, maxP: 1, span: 1 };
  const minP = Math.min(...bars.map((b) => b.low));
  const maxP = Math.max(...bars.map((b) => b.high));
  const span = maxP - minP || maxP * 0.02 || 1;
  return { minP, maxP, span };
}

function collectPriceBounds(
  bars: OhlcBar[],
  awaisData: AwaisOverlayData | null,
  awaisLayers: AwaisLayers,
  includePivots: boolean
): { minP: number; maxP: number; span: number } {
  const candle = collectCandleBounds(bars);
  if (!awaisData) return candle;

  let minP = candle.minP;
  let maxP = candle.maxP;
  const n = bars.length;
  const push = (v: number | null | undefined) => {
    if (v != null && Number.isFinite(v)) {
      minP = Math.min(minP, v);
      maxP = Math.max(maxP, v);
    }
  };

  if (includePivots && hasAnyPivot(awaisLayers)) {
    awaisData.pivots.forEach((p) => {
      if (awaisLayers.pivot[p.label as PivotLabel]) push(p.value);
    });
  }
  if (hasAnyBb(awaisLayers)) {
    for (let i = 0; i < n; i++) {
      if (awaisLayers.bb.upper) push(awaisData.bb.upper[i]);
      if (awaisLayers.bb.middle) push(awaisData.bb.middle[i]);
      if (awaisLayers.bb.lower) push(awaisData.bb.lower[i]);
    }
  }
  awaisData.maLines.forEach((m) => {
    if (!isMaSeriesVisible(awaisLayers, m.slot)) return;
    for (let i = 0; i < n; i++) push(m.values[i]);
  });
  if (hasAnySupertrend(awaisLayers)) {
    for (let i = 0; i < n; i++) {
      if (awaisLayers.supertrend.up) push(awaisData.supertrend.up[i]);
      if (awaisLayers.supertrend.down) push(awaisData.supertrend.down[i]);
    }
  }

  const span = maxP - minP || maxP * 0.02 || 1;
  return { minP, maxP, span };
}

/** How far the user can pan up/down (in units of visible half-span) to reach pivots etc. */
function computePricePanLimits(
  bars: OhlcBar[],
  awaisData: AwaisOverlayData | null,
  awaisLayers: AwaisLayers,
  zoomIdx: number,
  fitAll: boolean
): { min: number; max: number } {
  const candle = collectCandleBounds(bars);
  const center0 = (candle.minP + candle.maxP) / 2;
  const half = (candle.span / 2) * 1.08 * priceSpanMultiplier(zoomIdx);
  if (half <= 0) return { min: -2, max: 2 };

  if (fitAll) {
    const full = collectPriceBounds(bars, awaisData, awaisLayers, true);
    const fullHalf = (full.span / 2) * 1.1 * priceSpanMultiplier(zoomIdx);
    const fullCenter = (full.minP + full.maxP) / 2;
    return {
      min: (full.minP - fullHalf * 0.04 + fullHalf - fullCenter) / fullHalf,
      max: (full.maxP + fullHalf * 0.04 - fullHalf - fullCenter) / fullHalf,
    };
  }

  const extent = collectPriceBounds(bars, awaisData, awaisLayers, true);
  const margin = half * 0.05;
  const panMax = (extent.maxP + margin - half - center0) / half;
  const panMin = (extent.minP - margin + half - center0) / half;

  return { min: panMin, max: panMax };
}

function formatHorizZoomLabel(zoomIdx: number): string {
  if (zoomIdx <= 0) return '100%';
  return `${Math.round((1 / (ZOOM_STEPS[zoomIdx] ?? 1)) * 100)}%`;
}

function formatPriceZoomLabel(zoomIdx: number, fitAll: boolean): string {
  if (zoomIdx === 0) return fitAll ? 'All' : 'Auto';
  return `${Math.round(priceSpanMultiplier(zoomIdx) * 100)}%`;
}

function computePriceYRange(
  bars: OhlcBar[],
  awaisData: AwaisOverlayData | null,
  awaisLayers: AwaisLayers,
  opts: { zoomIdx: number; panOffset: number; fitAll: boolean; panLimits: { min: number; max: number } }
): { yMin: number; yMax: number } {
  if (!bars.length) return { yMin: 0, yMax: 1 };

  const panOffset = clampPanOffset(opts.panOffset, opts.panLimits);

  if (opts.fitAll) {
    const full = collectPriceBounds(bars, awaisData, awaisLayers, true);
    const half = (full.span / 2) * 1.1 * priceSpanMultiplier(opts.zoomIdx);
    const center0 = (full.minP + full.maxP) / 2;
    const center = center0 + panOffset * half;
    return { yMin: center - half, yMax: center + half };
  }

  const candle = collectCandleBounds(bars);
  const half = (candle.span / 2) * 1.08 * priceSpanMultiplier(opts.zoomIdx);
  const center0 = (candle.minP + candle.maxP) / 2;
  const center = center0 + panOffset * half;
  return { yMin: center - half, yMax: center + half };
}

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

const AxisZoomControls: React.FC<{
  axis: 'H' | 'Y';
  zoomIdx: number;
  minIdx: number;
  maxIdx: number;
  label: string;
  isDefault: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  onFitAll?: () => void;
}> = ({ axis, zoomIdx, minIdx, maxIdx, label, isDefault, onZoomIn, onZoomOut, onReset, onFitAll }) => {
  const atMin = zoomIdx <= minIdx;
  const atMax = zoomIdx >= maxIdx;
  return (
    <div
      className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-xl p-1 gap-0.5"
      title={axis === 'H' ? 'Horizontal (time) zoom' : 'Vertical (price) zoom'}
    >
      <span className="px-1.5 text-[9px] font-black text-slate-400 uppercase tracking-wider">{axis}</span>
      <button
        type="button"
        onClick={onZoomOut}
        disabled={atMin}
        className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-white dark:hover:bg-slate-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        title={axis === 'H' ? 'Zoom out (more bars)' : 'Zoom out (wider price range)'}
      >
        <ZoomOut size={14} />
      </button>
      <button
        type="button"
        onClick={onReset}
        disabled={isDefault}
        className="px-2 py-1.5 rounded-lg text-[10px] font-bold tabular-nums text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-white dark:hover:bg-slate-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors min-w-[44px]"
        title="Reset axis"
      >
        {label}
      </button>
      <button
        type="button"
        onClick={onZoomIn}
        disabled={atMax}
        className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-white dark:hover:bg-slate-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        title={axis === 'H' ? 'Zoom in (fewer bars)' : 'Zoom in (tighter price range)'}
      >
        <ZoomIn size={14} />
      </button>
      {!isDefault && (
        <button
          type="button"
          onClick={onReset}
          className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-white dark:hover:bg-slate-900 transition-colors"
          title="Reset axis"
        >
          <Maximize2 size={13} />
        </button>
      )}
      {onFitAll && (
        <button
          type="button"
          onClick={onFitAll}
          className="px-2 py-1.5 rounded-lg text-[9px] font-bold text-orange-500 hover:bg-white dark:hover:bg-slate-900 transition-colors"
          title="Fit pivot targets into view"
        >
          Targets
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

/** Close-to-close % change vs the prior candle in the series. */
function candleChangeFromPrev(current: OhlcBar, prev: OhlcBar | null | undefined): number | null {
  if (!prev || prev.close <= 0) return null;
  return ((current.close - prev.close) / prev.close) * 100;
}

function barIndexAtX(x: number, plotOffset: number, slot: number, count: number): number | null {
  if (count <= 0 || slot <= 0 || x < plotOffset || x > plotOffset + count * slot) return null;
  return Math.min(count - 1, Math.max(0, Math.floor((x - plotOffset) / slot)));
}

type PlotHoverState = { idx: number | null; x: number | null; y: number | null };

function plotCoordsFromOverlay(
  e: React.PointerEvent<SVGRectElement> | React.MouseEvent<SVGRectElement>,
  padLeft: number,
  padTop: number
) {
  return { x: padLeft + e.nativeEvent.offsetX, y: padTop + e.nativeEvent.offsetY };
}

function plotMouseHandlers(
  plotOffset: number,
  slot: number,
  count: number,
  plotTop: number,
  plotBottom: number,
  setHover: (v: PlotHoverState) => void,
  panning: boolean,
  trackY = false,
  disabled = false
) {
  const plotRight = plotOffset + count * slot;
  return {
    onMouseMove: (e: React.MouseEvent<SVGSVGElement>) => {
      if (panning || disabled) return;
      const x = e.nativeEvent.offsetX;
      const y = e.nativeEvent.offsetY;
      setHover((prev) => {
        const next: PlotHoverState = { ...prev, idx: barIndexAtX(x, plotOffset, slot, count) };
        if (x >= plotOffset && x <= plotRight) next.x = x;
        if (trackY && y >= plotTop && y <= plotBottom) next.y = y;
        return next;
      });
    },
  };
}

const AXIS_LABEL = '#334155';
const MUTED_LABEL = '#64748b';

const CrosshairVertical: React.FC<{ x: number; top: number; bottom: number }> = ({ x, top, bottom }) => (
  <line
    x1={x}
    x2={x}
    y1={top}
    y2={bottom}
    stroke="#94a3b8"
    strokeWidth={1}
    strokeDasharray="4 4"
    opacity={0.85}
    pointerEvents="none"
  />
);

type ChartMode = 'candle' | 'line' | 'technical';

interface ChartLayers {
  volume: boolean;
  momentum: boolean;
}

const DEFAULT_LAYERS: ChartLayers = {
  volume: true,
  momentum: true,
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
  momentumLabel: string;
}> = ({ layers, onToggle, hasVolume, momentumLabel }) => (
  <div
    className="flex flex-wrap items-center gap-1.5 mb-1 px-1 relative z-20"
    onPointerDown={(e) => e.stopPropagation()}
  >
    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mr-1">Panels</span>
    <LayerToggle label="Volume" color="#6366f1" active={layers.volume} onClick={() => onToggle('volume')} disabled={!hasVolume} />
    <LayerToggle label={momentumLabel} color="#9333ea" active={layers.momentum} onClick={() => onToggle('momentum')} />
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
  momentumConfig: MomentumConfig;
  hasVolume: boolean;
  hasMacd: boolean;
}> = ({ points, symbol, layers, momentumConfig, hasVolume, hasMacd }) => {
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
        <div className="text-rose-500">Upper {rs(row.upper)}</div>
        <div className="text-blue-500">SMA {rs(row.middle)}</div>
        <div className="text-emerald-600">Lower {rs(row.lower)}</div>
        {layers.momentum && momentumConfig.enabled.RSI && (
          <div className="text-purple-600 font-bold mt-1">RSI {row.rsi.toFixed(1)}</div>
        )}
        {layers.momentum && momentumConfig.enabled.MACD && hasMacd && Number.isFinite(row.macd) && (
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

  const showAnyBand = true;

  return (
    <div className="space-y-2">
      <div className="h-[260px] sm:h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.35} vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }} axisLine={false} tickLine={false} minTickGap={48} hide={layers.momentum || (layers.volume && hasVolume)} />
            <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }} axisLine={false} tickLine={false} width={44} />
            <Tooltip content={tip} />
            <Line type="monotone" dataKey="close" name="Close" stroke="#0f172a" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="upper" name="Upper Band" stroke="#ef4444" strokeWidth={1} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="middle" name="Middle (SMA)" stroke="#3b82f6" strokeWidth={1} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="lower" name="Lower Band" stroke="#10b981" strokeWidth={1} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {layers.momentum && momentumConfig.enabled.RSI && (
      <div className="h-[140px] sm:h-[150px]">
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1 px-1">RSI ({momentumConfig.rsi.length})</div>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.35} vertical={false} />
            <XAxis dataKey="label" hide={!(layers.volume && hasVolume)} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }} axisLine={false} tickLine={false} minTickGap={48} />
            <YAxis domain={[0, 100]} ticks={[momentumConfig.rsi.oversold, 50, momentumConfig.rsi.overbought]} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }} axisLine={false} tickLine={false} width={44} />
            <ReferenceLine y={momentumConfig.rsi.overbought} stroke="#ef4444" strokeDasharray="4 3" strokeWidth={1} />
            <ReferenceLine y={momentumConfig.rsi.oversold} stroke="#10b981" strokeDasharray="4 3" strokeWidth={1} />
            <Tooltip
              contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 11 }}
              formatter={(v: any) => [Number(v).toFixed(1), 'RSI']}
              labelFormatter={(l) => l}
            />
            <Line type="monotone" dataKey="rsi" stroke={momentumConfig.rsi.color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      )}
      {layers.momentum && momentumConfig.enabled.MACD && hasMacd && (
        <MacdRechartsPanel data={data} showXAxis={!(layers.volume && hasVolume)} />
      )}
      {layers.volume && hasVolume && (
      <div className="h-[100px] sm:h-[110px]">
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
      {!showAnyBand && !layers.momentum && !(layers.volume && hasVolume) && (
        <p className="text-[10px] text-slate-400 px-1">Enable overlays above to show indicators.</p>
      )}
      <p className="text-[10px] text-slate-400 px-1">{symbol} — indicators from OHLC</p>
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
      <VolumeMiniChart bars={bars} slot={slot} padL={52} width={width} height={VOLUME_PANEL_HEIGHT} />
    </div>
  );
};

const LineMomentumPanel: React.FC<{
  bars: OhlcBar[];
  config: MomentumConfig;
  momentumSeries: ReturnType<typeof computeMomentumSeries>;
  showVolume: boolean;
}> = ({ bars, config, momentumSeries, showVolume }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const active = useMemo(() => activeMomentumTypes(config), [config]);

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
  if (!active.length) return null;
  return (
    <div ref={ref} className="w-full space-y-1">
      {active.map((type, idx) => (
        <MomentumMiniChart
          key={type}
          type={type}
          bars={bars}
          config={config}
          series={momentumSeries}
          slot={slot}
          padL={52}
          width={width}
          showXLabels={!showVolume && idx === active.length - 1}
        />
      ))}
    </div>
  );
};

type CandleInterval = 'day' | 'week' | 'month';

function weekBucketKey(time: number): string {
  const d = new Date(time);
  const monday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return `W${monday}`;
}

/** Aggregate daily OHLCV bars into weekly candles (Monday–Sunday). */
function aggregateWeekly(bars: OhlcBar[]): OhlcBar[] {
  if (bars.length < 2) return bars;
  const out: OhlcBar[] = [];
  let bucket: OhlcBar | null = null;
  let weekKey = '';
  for (const b of bars) {
    const wk = weekBucketKey(b.time);
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
  if (interval === 'week') {
    return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Wider bars when the series is sparse (e.g. weekly/monthly views). */
function chartBarMetrics(slot: number, barCount: number, interval: CandleInterval) {
  const sparse = barCount <= 36 || interval === 'month' || interval === 'week';
  if (sparse) {
    const cap = interval === 'month' ? 52 : interval === 'week' ? 34 : 22;
    const w = Math.max(6, Math.min(slot * 0.74, cap));
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

function volumeScaleMax(volumes: number[]): number {
  let max = 0;
  for (const v of volumes) if (v > max) max = v;
  // Small headroom so the tallest bar does not touch the panel edge.
  return max > 0 ? max * 1.06 : 1;
}

const VolumeMiniChart: React.FC<{
  bars: OhlcBar[];
  slot: number;
  padL: number;
  width: number;
  height?: number;
  candleInterval?: CandleInterval;
  barW?: number;
  hoverX?: number | null;
  hoverIdx?: number | null;
  plotMouseHandlers?: { onMouseMove: (e: React.MouseEvent<SVGSVGElement>) => void; onMouseLeave: () => void };
}> = ({ bars, slot, padL, width, height = VOLUME_PANEL_HEIGHT, candleInterval = 'day', barW: barWProp, hoverX = null, hoverIdx = null, plotMouseHandlers }) => {
  const pad = { t: 8, r: 56, b: 24, l: 52 };
  const innerH = height - pad.t - pad.b;
  const maxV = volumeScaleMax(bars.map((b) => b.volume));
  const peakV = bars.reduce((m, b) => Math.max(m, b.volume), 0);
  const yVol = (v: number) => pad.t + innerH - (v / maxV) * innerH;
  const xAt = (i: number) => padL + i * slot + slot / 2;
  const barW = barWProp ?? chartBarMetrics(slot, bars.length, candleInterval).barW;

  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1 px-1">Volume</div>
      <svg width={width} height={height} className="overflow-visible" {...plotMouseHandlers}>
        <line x1={padL} x2={width - pad.r} y1={pad.t + innerH} y2={pad.t + innerH} stroke="#e2e8f0" strokeOpacity={0.5} />
        <text x={width - 8} y={pad.t + 4} textAnchor="end" fontSize={10} fill={MUTED_LABEL} fontWeight={700}>{fmtVol(peakV)}</text>
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
        {hoverX != null && <CrosshairVertical x={hoverX} top={pad.t} bottom={pad.t + innerH} />}
        {hoverIdx != null && bars[hoverIdx]?.volume > 0 && (
          <>
            <rect x={width - 46} y={yVol(bars[hoverIdx].volume) - 10} width={40} height={16} rx={4} fill="#1e293b" />
            <text x={width - 8} y={yVol(bars[hoverIdx].volume) + 4} textAnchor="end" fontSize={9} fill="#f8fafc" fontWeight={700}>
              {fmtVol(bars[hoverIdx].volume)}
            </text>
          </>
        )}
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

function sliceAwaisData(data: AwaisOverlayData, startIdx: number, count: number): AwaisOverlayData {
  const slice = <T,>(arr: T[]) => arr.slice(startIdx, startIdx + count);
  return {
    maLines: data.maLines.map((m) => ({ ...m, values: slice(m.values) })),
    bb: { upper: slice(data.bb.upper), middle: slice(data.bb.middle), lower: slice(data.bb.lower) },
    supertrend: { up: slice(data.supertrend.up), down: slice(data.supertrend.down) },
    ichimoku: {
      conversion: slice(data.ichimoku.conversion),
      base: slice(data.ichimoku.base),
      spanA: slice(data.ichimoku.spanA),
      spanB: slice(data.ichimoku.spanB),
      displacement: data.ichimoku.displacement,
    },
    pivots: data.pivots,
  };
}

const CandleChart: React.FC<{
  bars: OhlcBar[];
  analysis?: ChartAnalysisPoint[];
  layers: ChartLayers;
  momentumConfig: MomentumConfig;
  momentumSeries: ReturnType<typeof computeMomentumSeries>;
  awaisLayers: AwaisLayers;
  awaisData?: AwaisOverlayData | null;
  candleInterval?: CandleInterval;
  height?: number;
  panning?: boolean;
  canPan?: boolean;
  priceZoomIdx?: number;
  pricePanOffset?: number;
  priceFitAll?: boolean;
  pricePanLimits?: { min: number; max: number };
  plotRef?: React.RefObject<HTMLDivElement | null>;
  drawTool?: DrawTool;
  drawings?: ChartDrawing[];
  draftDrawing?: ChartDrawing | null;
  selectedDrawingId?: string | null;
  onDrawingsChange?: (next: ChartDrawing[]) => void;
  onDraftChange?: (next: ChartDrawing | null) => void;
  onSelectDrawing?: (id: string | null) => void;
}> = ({
  bars,
  analysis = [],
  layers,
  momentumConfig,
  momentumSeries,
  awaisLayers,
  awaisData = null,
  candleInterval = 'day',
  height = 320,
  panning = false,
  canPan = false,
  priceZoomIdx = 0,
  pricePanOffset = 0,
  priceFitAll = false,
  pricePanLimits = { min: -2, max: 2 },
  plotRef,
  drawTool = 'pan',
  drawings = [],
  draftDrawing = null,
  selectedDrawingId = null,
  onDrawingsChange,
  onDraftChange,
  onSelectDrawing,
}) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [plotHover, setPlotHover] = useState<PlotHoverState>({ idx: null, x: null, y: null });
  const plotClipId = useId().replace(/:/g, '');
  const labelClipId = useId().replace(/:/g, '');

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth || 640));
    ro.observe(el);
    setWidth(el.clientWidth || 640);
    return () => ro.disconnect();
  }, []);

  const pad = { t: 16, r: 56, b: 28, l: 52 };
  const w = Math.max(280, width);
  const h = height;
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;

  const display = bars;
  const showOverlay = analysis.length > 0;
  const aligned = useMemo(
    () => (showOverlay ? alignAnalysisToBars(display, analysis) : []),
    [display, analysis, showOverlay]
  );
  const activeMomentum = useMemo(() => activeMomentumTypes(momentumConfig), [momentumConfig]);
  const hasAwais = awaisData != null;
  const showMomentum = layers.momentum && display.length >= 3 && activeMomentum.length > 0;
  const showVolume = layers.volume && bars.some((b) => b.volume > 0);
  const showBottomX = showVolume || showMomentum;

  const { yMin, yMax } = useMemo(
    () =>
      computePriceYRange(bars, awaisData, awaisLayers, {
        zoomIdx: priceZoomIdx,
        panOffset: pricePanOffset,
        fitAll: priceFitAll,
        panLimits: pricePanLimits,
      }),
    [bars, awaisData, awaisLayers, priceZoomIdx, pricePanOffset, priceFitAll, pricePanLimits]
  );
  const yScale = (p: number) => pad.t + ((yMax - p) / (yMax - yMin)) * innerH;
  const plotInnerW =
    candleInterval === 'month' && display.length <= 24
      ? Math.min(innerW, display.length * 44)
      : candleInterval === 'week' && display.length <= 52
        ? Math.min(innerW, display.length * 34)
        : innerW;
  const slot = plotInnerW / Math.max(display.length, 1);
  const plotOffset = pad.l + (innerW - plotInnerW) / 2;
  const { bodyW, barW } = chartBarMetrics(slot, display.length, candleInterval);

  const hi = plotHover.idx != null ? display[plotHover.idx] : null;
  const prevBar = plotHover.idx != null && plotHover.idx > 0 ? display[plotHover.idx - 1] : null;
  const barChangePct = hi ? candleChangeFromPrev(hi, prevBar) : null;
  const hiMomentum = plotHover.idx != null ? momentumSeries[plotHover.idx] : null;
  const momentumTip = momentumHoverText(momentumConfig, hiMomentum ?? undefined);
  const xAt = (i: number) => plotOffset + i * slot + slot / 2;
  const crosshairX = plotHover.x;
  const crosshairY = plotHover.y;
  const cursorPrice =
    crosshairY != null && innerH > 0 ? yMax - ((crosshairY - pad.t) / innerH) * (yMax - yMin) : null;

  const barTimes = useMemo(() => display.map((b) => b.time), [display]);
  const drawCoords: DrawRenderCoords = useMemo(
    () => ({
      barTimes,
      plotOffset,
      slot,
      plotLeft: pad.l,
      plotRight: w - pad.r,
      plotTop: pad.t,
      plotBottom: pad.t + innerH,
      yMin,
      yMax,
      padTop: pad.t,
      innerH,
    }),
    [barTimes, plotOffset, slot, pad.l, pad.r, pad.t, innerH, w, yMin, yMax]
  );

  const drawingActive = drawTool !== 'pan' && drawTool !== 'crosshair' && drawTool !== 'select';
  const plotOverlayActive = drawTool !== 'pan';
  const trendPendingRef = useRef(false);

  useEffect(() => {
    trendPendingRef.current = false;
  }, [drawTool]);

  const commitDrawing = useCallback(
    (d: ChartDrawing) => {
      onDrawingsChange?.([...drawings, d]);
      onDraftChange?.(null);
      onSelectDrawing?.(d.id);
      trendPendingRef.current = false;
    },
    [drawings, onDrawingsChange, onDraftChange, onSelectDrawing]
  );

  const updatePlotHover = useCallback(
    (x: number, y: number) => {
      const plotRight = plotOffset + display.length * slot;
      setPlotHover({
        idx: barIndexAtX(x, plotOffset, slot, display.length),
        x: x >= plotOffset && x <= plotRight ? x : null,
        y: y >= pad.t && y <= pad.t + innerH ? y : null,
      });
    },
    [plotOffset, slot, display.length, pad.t, innerH]
  );

  const handleDrawPointerDown = (e: React.PointerEvent<SVGRectElement>) => {
    e.stopPropagation();
    const { x, y } = plotCoordsFromOverlay(e, pad.l, pad.t);

    if (drawTool === 'crosshair') {
      updatePlotHover(x, y);
      return;
    }

    if (drawTool === 'select') {
      e.preventDefault();
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      const hit = hitTestDrawings(x, y, drawings, drawCoords, 10);
      onSelectDrawing?.(hit);
      return;
    }

    if (!drawingActive || !onDrawingsChange) return;
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const pt = pointFromPixel(x, y, display, plotOffset, slot, yMin, yMax, pad.t, innerH);
    if (!pt) return;
    if (drawTool === 'hline') {
      commitDrawing({ id: newDrawingId(), type: 'hline', price: pt.price, color: DEFAULT_DRAW_COLOR });
      return;
    }
    if (drawTool === 'vline') {
      commitDrawing({ id: newDrawingId(), type: 'vline', time: pt.time, color: DEFAULT_DRAW_COLOR });
      return;
    }
    if (drawTool === 'trendline' || drawTool === 'fib') {
      if (!trendPendingRef.current || !draftDrawing || draftDrawing.type !== drawTool) {
        trendPendingRef.current = true;
        onDraftChange?.({
          id: newDrawingId(),
          type: drawTool,
          p1: pt,
          p2: pt,
          color: DEFAULT_DRAW_COLOR,
        });
      } else {
        commitDrawing({ ...draftDrawing, p2: pt });
      }
      return;
    }
    if (drawTool === 'rect') {
      onDraftChange?.({ id: newDrawingId(), type: 'rect', p1: pt, p2: pt, color: DEFAULT_DRAW_COLOR });
    }
  };

  const handleDrawPointerMove = (e: React.PointerEvent<SVGRectElement>) => {
    const { x, y } = plotCoordsFromOverlay(e, pad.l, pad.t);

    if (drawTool === 'crosshair') {
      updatePlotHover(x, y);
      return;
    }

    if (!drawingActive) return;
    const pt = pointFromPixel(x, y, display, plotOffset, slot, yMin, yMax, pad.t, innerH);
    if (!pt || !draftDrawing) return;
    if (draftDrawing.type === 'trendline' || draftDrawing.type === 'rect' || draftDrawing.type === 'fib') {
      onDraftChange?.({ ...draftDrawing, p2: pt });
    }
  };

  const handleDrawPointerUp = (e: React.PointerEvent<SVGRectElement>) => {
    try { (e.currentTarget as Element).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (drawTool === 'rect' && draftDrawing?.type === 'rect') {
      commitDrawing(draftDrawing);
    }
  };

  useEffect(() => {
    if (panning) setPlotHover({ idx: null, x: null, y: null });
  }, [panning]);

  const mainMouseHandlers = useMemo(
    () => plotMouseHandlers(plotOffset, slot, display.length, pad.t, pad.t + innerH, setPlotHover, panning, true, plotOverlayActive),
    [plotOffset, slot, display.length, pad.t, innerH, panning, plotOverlayActive]
  );
  const subMouseHandlers = useMemo(
    () => plotMouseHandlers(plotOffset, slot, display.length, pad.t, pad.t + innerH, setPlotHover, panning, false, plotOverlayActive),
    [plotOffset, slot, display.length, pad.t, innerH, panning, plotOverlayActive]
  );

  const wrapCursor =
    drawTool === 'crosshair'
      ? 'cursor-crosshair'
      : drawTool === 'pan'
        ? canPan || panning
          ? panning
            ? 'cursor-grabbing'
            : 'cursor-grab'
          : 'cursor-crosshair'
        : drawTool === 'select'
          ? 'cursor-pointer'
          : 'cursor-crosshair';

  return (
    <div
      ref={wrapRef}
      className={`relative w-full select-none ${wrapCursor}`}
      onMouseLeave={() => setPlotHover({ idx: null, x: null, y: null })}
    >
      {hi && (
        <div className="absolute top-1 right-2 z-10 pointer-events-none rounded-lg bg-white/98 dark:bg-slate-900/98 border border-slate-300 dark:border-slate-600 px-2.5 py-1.5 text-[11px] shadow-md tabular-nums max-w-[calc(100%-1rem)]">
          <span className="font-bold text-slate-800 dark:text-slate-100">
            {fmtCandleDate(hi.time, candleInterval)}
          </span>
          <span className="text-slate-600 dark:text-slate-300 ml-2">O {rs(hi.open)}</span>
          <span className="text-slate-600 dark:text-slate-300 ml-1.5">H {rs(hi.high)}</span>
          <span className="text-slate-600 dark:text-slate-300 ml-1.5">L {rs(hi.low)}</span>
          <span className={`ml-1.5 font-bold ${hi.close >= hi.open ? 'text-emerald-700' : 'text-rose-600'}`}>C {rs(hi.close)}</span>
          {barChangePct != null && (
            <span className={`ml-1.5 font-bold ${barChangePct >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
              ({barChangePct >= 0 ? '+' : ''}{barChangePct.toFixed(2)}%)
            </span>
          )}
          {hi.volume > 0 && <span className="text-slate-600 dark:text-slate-300 ml-1.5">V {fmtVol(hi.volume)}</span>}
          {showMomentum && momentumTip && <span className="text-purple-700 dark:text-purple-300 font-bold ml-1.5">{momentumTip}</span>}
        </div>
      )}
      <div ref={plotRef} className="overflow-hidden">
      <svg width={w} height={h} className="overflow-hidden" {...mainMouseHandlers}>
        <defs>
          <clipPath id={plotClipId}>
            <rect x={pad.l} y={pad.t} width={innerW} height={innerH} />
          </clipPath>
          <clipPath id={labelClipId}>
            <rect x={0} y={pad.t - 2} width={w} height={innerH + 4} />
          </clipPath>
        </defs>
        {/* grid */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = pad.t + t * innerH;
          const price = yMax - t * (yMax - yMin);
          return (
            <g key={t}>
              <line x1={pad.l} x2={w - pad.r} y1={y} y2={y} stroke="#e2e8f0" strokeOpacity={0.45} strokeDasharray="3 3" />
              <text x={w - 8} y={y + 4} textAnchor="end" fontSize={11} fill={AXIS_LABEL} fontWeight={700}>{price.toFixed(1)}</text>
            </g>
          );
        })}
        <g clipPath={`url(#${plotClipId})`}>
        {hasAwais && awaisData && (
          <AwaisSvgOverlays
            data={awaisData}
            layers={awaisLayers}
            barCount={display.length}
            xAt={xAt}
            yScale={yScale}
            plotOffset={plotOffset}
            width={w}
            padRight={pad.r}
            hidePivotLabels
          />
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
            <g key={b.time}>
              <rect x={x - slot / 2} y={pad.t} width={slot} height={innerH} fill="transparent" pointerEvents="none" />
              <line x1={x} x2={x} y1={yH} y2={yL} stroke={color} strokeWidth={1.25} />
              <rect x={x - bodyW / 2} y={top} width={bodyW} height={bodyH} fill={color} rx={0.5} />
            </g>
          );
        })}
        {(drawings.length > 0 || draftDrawing) && (
          <g pointerEvents="none">
            <ChartDrawingsLayer
              drawings={drawings}
              draft={draftDrawing}
              selectedId={selectedDrawingId}
              coords={drawCoords}
            />
          </g>
        )}
        </g>
        {plotOverlayActive && (
          <rect
            x={pad.l}
            y={pad.t}
            width={innerW}
            height={innerH}
            fill="transparent"
            style={{
              cursor:
                drawTool === 'select' ? 'pointer' : drawTool === 'crosshair' ? 'crosshair' : 'crosshair',
            }}
            onPointerDown={handleDrawPointerDown}
            onPointerMove={handleDrawPointerMove}
            onPointerUp={handleDrawPointerUp}
          />
        )}
        {crosshairX != null && (drawTool === 'crosshair' || drawTool === 'pan') && (
          <g pointerEvents="none">
            <CrosshairVertical x={crosshairX} top={pad.t} bottom={pad.t + innerH} />
            {crosshairY != null && cursorPrice != null && (
              <>
                <line
                  x1={pad.l}
                  x2={w - pad.r}
                  y1={crosshairY}
                  y2={crosshairY}
                  stroke="#94a3b8"
                  strokeWidth={1}
                  strokeDasharray="4 4"
                  opacity={0.85}
                />
                <rect x={w - 54} y={crosshairY - 10} width={50} height={18} rx={4} fill="#1e293b" stroke="#475569" strokeWidth={0.5} />
                <text x={w - 8} y={crosshairY + 4} textAnchor="end" fontSize={10} fill="#f8fafc" fontWeight={700}>
                  {rs(cursorPrice)}
                </text>
              </>
            )}
            {!showBottomX && hi && (
              <>
                <rect x={crosshairX - 42} y={pad.t + innerH + 4} width={84} height={16} rx={4} fill="#475569" />
                <text x={crosshairX} y={pad.t + innerH + 15} textAnchor="middle" fontSize={9} fill="#f8fafc" fontWeight={600}>
                  {fmtCandleDate(hi.time, candleInterval)}
                </text>
              </>
            )}
          </g>
        )}
        {hasAwais && awaisData && (
          <g clipPath={`url(#${labelClipId})`}>
            <AwaisPivotLabels
              data={awaisData}
              layers={awaisLayers}
              yScale={yScale}
              width={w}
              padRight={pad.r}
              plotTop={pad.t}
              plotBottom={pad.t + innerH}
            />
          </g>
        )}
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
      </div>
      {showMomentum && activeMomentum.map((type, idx) => (
        <div key={type} className="mt-3 pt-2 border-t border-slate-200/80 dark:border-slate-700/80">
        <MomentumMiniChart
          type={type}
          bars={display}
          config={momentumConfig}
          series={momentumSeries}
          slot={slot}
          padL={plotOffset}
          width={w}
          height={type === 'MACD' ? MOMENTUM_MACD_HEIGHT : MOMENTUM_PANEL_HEIGHT}
          showXLabels={!showVolume && idx === activeMomentum.length - 1}
          hoverX={crosshairX}
          hoverIdx={plotHover.idx}
          plotMouseHandlers={subMouseHandlers}
        />
        </div>
      ))}
      {showVolume && (
        <div className="mt-3 pt-2 border-t border-slate-200/80 dark:border-slate-700/80">
        <VolumeMiniChart
          bars={display}
          slot={slot}
          padL={plotOffset}
          width={w}
          height={VOLUME_PANEL_HEIGHT}
          candleInterval={candleInterval}
          barW={barW}
          hoverX={crosshairX}
          hoverIdx={plotHover.idx}
          plotMouseHandlers={subMouseHandlers}
        />
        </div>
      )}
    </div>
  );
};

export const StockChart: React.FC<Props> = ({ symbol }) => {
  const [ohlc, setOhlc] = useState<OhlcBar[]>([]);
  const [lineFallback, setLineFallback] = useState<{ time: number; price: number }[]>([]);
  const [analysis, setAnalysis] = useState<ChartAnalysisPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [range, setRange] = useState('3M');
  const [mode, setMode] = useState<ChartMode>('candle');
  const [candleInterval, setCandleInterval] = useState<CandleInterval>('day');
  const [err, setErr] = useState('');
  const [zoomIdx, setZoomIdx] = useState(0);
  const [viewStart, setViewStart] = useState(0);
  const [priceZoomIdx, setPriceZoomIdx] = useState(0);
  const [pricePanOffset, setPricePanOffset] = useState(0);
  const [priceFitAll, setPriceFitAll] = useState(false);
  const [panning, setPanning] = useState(false);
  const [drawTool, setDrawTool] = useState<DrawTool>('pan');
  const [drawings, setDrawings] = useState<ChartDrawing[]>([]);
  const [draftDrawing, setDraftDrawing] = useState<ChartDrawing | null>(null);
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  const [layers, setLayers] = useState<ChartLayers>(() => loadChartSettings().layers);
  const [awaisLayers, setAwaisLayers] = useState<AwaisLayers>(() => cloneAwaisLayers(loadChartSettings().awaisLayers));
  const [momentumConfig, setMomentumConfig] = useState<MomentumConfig>(() => cloneMomentumConfig(loadChartSettings().momentumConfig));
  const chartPanRef = useRef<HTMLDivElement>(null);
  const candlePlotRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{
    x: number;
    y: number;
    startView: number;
    startPricePan: number;
    panH: boolean;
    panV: boolean;
  } | null>(null);

  const endPan = useCallback(() => {
    panRef.current = null;
    setPanning(false);
  }, []);

  const toggleLayer = (key: keyof ChartLayers) => {
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  useEffect(() => {
    persistChartSettings({ layers, awaisLayers, momentumConfig });
  }, [layers, awaisLayers, momentumConfig]);

  useEffect(() => {
    const onCloudSettings = (e: Event) => {
      const detail = (e as CustomEvent<ChartUserSettings>).detail;
      if (!detail) return;
      setLayers({ ...detail.layers });
      setAwaisLayers(cloneAwaisLayers(detail.awaisLayers));
      setMomentumConfig(cloneMomentumConfig(detail.momentumConfig));
    };
    window.addEventListener(CHART_SETTINGS_EVENT, onCloudSettings);
    return () => window.removeEventListener(CHART_SETTINGS_EVENT, onCloudSettings);
  }, []);

  const rangeMeta = RANGES.find((x) => x.k === range) ?? RANGES[1];

  useEffect(() => {
    setZoomIdx(0);
    setViewStart(0);
    setPriceZoomIdx(0);
    setPricePanOffset(0);
    setPriceFitAll(false);
    setDraftDrawing(null);
    setSelectedDrawingId(null);
  }, [symbol, range, mode, candleInterval]);

  useEffect(() => {
    if (!symbol) {
      setDrawings([]);
      return;
    }
    setDrawings(loadDrawings(symbol));
    setDraftDrawing(null);
    setSelectedDrawingId(null);
  }, [symbol]);

  useEffect(() => {
    if (!symbol) return;
    saveDrawings(symbol, drawings);
  }, [symbol, drawings]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (!selectedDrawingId) return;
      e.preventDefault();
      setDrawings((prev) => prev.filter((d) => d.id !== selectedDrawingId));
      setSelectedDrawingId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedDrawingId]);

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

  useEffect(() => {
    if (!symbol || import.meta.env.PROD) return;
    fetchChartAnalysis(symbol, rangeMeta.period)
      .then((points) => { if (points.length) setAnalysis(points); })
      .catch(() => setAnalysis([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, range, mode]);

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

  /** Browser-side BB/RSI/MACD from OHLC — works on production without Python. */
  const clientAnalysis = useMemo(() => {
    if (filteredOhlc.length >= 3) {
      return computeChartAnalysisFromBars(filteredOhlc);
    }
    if (filteredLine.length >= 3) {
      return computeChartAnalysisFromBars(
        filteredLine.map((p) => ({
          time: p.time,
          open: p.price,
          high: p.price,
          low: p.price,
          close: p.price,
          volume: 0,
        }))
      );
    }
    return [];
  }, [filteredOhlc, filteredLine]);

  const filteredAnalysis = useMemo(() => {
    const src = analysis.length > 0 ? analysis : clientAnalysis;
    const r = RANGES.find((x) => x.k === range);
    if (!r || r.days === 0) return src;
    const cutoff = Date.now() - r.days * 86400000;
    return src.filter((p) => p.time >= cutoff);
  }, [analysis, clientAnalysis, range]);

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
    if (candleInterval === 'week') return aggregateWeekly(filteredOhlc);
    return filteredOhlc;
  }, [filteredOhlc, candleInterval, showCandle]);
  const modeLabel = showTechnical
    ? 'BB + RSI'
    : showCandle
      ? candleInterval === 'month'
        ? 'Candles · Monthly'
        : candleInterval === 'week'
          ? 'Candles · Weekly'
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
    endPan();
    setZoomIdx(0);
    setViewStart(0);
  };

  const priceZoomIn = () => setPriceZoomIdx((z) => Math.max(PRICE_ZOOM_MIN, z - 1));
  const priceZoomOut = () => setPriceZoomIdx((z) => Math.min(PRICE_ZOOM_MAX, z + 1));
  const resetPriceZoom = () => {
    endPan();
    setPriceZoomIdx(0);
    setPricePanOffset(0);
    setPriceFitAll(false);
  };
  const fitAllPrice = () => {
    endPan();
    setPriceFitAll(true);
    setPriceZoomIdx(0);
    setPricePanOffset(0);
  };

  const priceZoomActive = priceZoomIdx !== 0 || pricePanOffset !== 0 || priceFitAll;

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

  const sparseCandleAnalysis = useMemo(
    () =>
      showCandle && (candleInterval === 'month' || candleInterval === 'week')
        ? computeChartAnalysisFromBars(candleOhlc, { monthly: true })
        : [],
    [candleOhlc, showCandle, candleInterval]
  );

  const candleAnalysis = useMemo(() => {
    if (!showCandle) return [];
    if (candleInterval === 'month' || candleInterval === 'week') {
      if (!visibleOhlc.length) return [];
      const t0 = visibleOhlc[0].time;
      const t1 = visibleOhlc[visibleOhlc.length - 1].time;
      return sparseCandleAnalysis.filter((p) => p.time >= t0 && p.time <= t1);
    }
    return visibleAnalysis;
  }, [showCandle, candleInterval, visibleOhlc, sparseCandleAnalysis, visibleAnalysis]);

  const analysisForLayers =
    showCandle && (candleInterval === 'month' || candleInterval === 'week')
      ? sparseCandleAnalysis
      : visibleAnalysis;
  const hasMacd = analysisForLayers.some((p) => Number.isFinite(p.macd));

  const pivotTimeframe: ChartTimeframe =
    showCandle && candleInterval === 'month'
      ? 'month'
      : showCandle && candleInterval === 'week'
        ? 'week'
        : 'day';

  /** Pivots need whole anchor periods, so feed them unfiltered history, not the visible range. */
  const pivotBars = useMemo(
    () => (pivotTimeframe === 'month' ? aggregateMonthly(ohlc) : ohlc),
    [ohlc, pivotTimeframe]
  );

  const awaisFull = useMemo(
    () =>
      computeAwaisOverlays(showCandle ? candleOhlc : filteredOhlc, awaisLayers, {
        pivotBars,
        timeframe: pivotTimeframe,
      }),
    [showCandle, candleOhlc, filteredOhlc, awaisLayers, pivotBars, pivotTimeframe]
  );

  const awaisVisible = useMemo(() => {
    if (!awaisFull || !visibleOhlc.length) return null;
    const full = showCandle ? candleOhlc : filteredOhlc;
    const startIdx = full.findIndex((b) => b.time === visibleOhlc[0].time);
    if (startIdx < 0) return awaisFull;
    return sliceAwaisData(awaisFull, startIdx, visibleOhlc.length);
  }, [awaisFull, visibleOhlc, showCandle, candleOhlc, filteredOhlc]);

  const momentumBars = useMemo((): OhlcBar[] => {
    if (candleOhlc.length >= 3) return candleOhlc;
    if (filteredOhlc.length >= 3) return filteredOhlc;
    return filteredLine.map((p) => ({
      time: p.time,
      open: p.price,
      high: p.price,
      low: p.price,
      close: p.price,
      volume: 0,
    }));
  }, [candleOhlc, filteredOhlc, filteredLine]);

  const momentumSeriesFull = useMemo(
    () => (momentumBars.length >= 3 ? computeMomentumSeries(momentumBars, momentumConfig) : []),
    [momentumBars, momentumConfig]
  );

  const momentumVisibleBars = useMemo((): OhlcBar[] => {
    if (visibleOhlc.length >= 3) return visibleOhlc;
    return applyViewport(momentumBars, viewStart, viewCount);
  }, [visibleOhlc, momentumBars, viewStart, viewCount]);

  const momentumSeriesVisible = useMemo(
    () => sliceMomentumSeries(momentumSeriesFull, momentumBars, momentumVisibleBars),
    [momentumSeriesFull, momentumBars, momentumVisibleBars]
  );

  const pricePanLimits = useMemo(
    () => computePricePanLimits(visibleOhlc, awaisVisible, awaisLayers, priceZoomIdx, priceFitAll),
    [visibleOhlc, awaisVisible, awaisLayers, priceZoomIdx, priceFitAll]
  );

  useEffect(() => {
    setPricePanOffset((p) => clampPanOffset(p, pricePanLimits));
  }, [priceZoomIdx, pricePanLimits]);

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

  const canPanH = canPan;
  const canPanV = showCandle && visibleOhlc.length >= 3;
  const canPanChart = canPanH || canPanV;

  const pricePanLimitsRef = useRef(pricePanLimits);
  pricePanLimitsRef.current = pricePanLimits;
  const maxViewStartRef = useRef(maxViewStart);
  maxViewStartRef.current = maxViewStart;
  const viewCountRef = useRef(viewCount);
  viewCountRef.current = viewCount;

  const applyPanMove = useCallback((clientX: number, clientY: number) => {
    const pan = panRef.current;
    if (!pan) return;
    const limits = pricePanLimitsRef.current;
    if (pan.panV) {
      const plotH = candlePlotRef.current?.clientHeight ?? chartPanRef.current?.clientHeight ?? 400;
      const chartHeight = Math.max(plotH, 120);
      const dy = clientY - pan.y;
      const delta = (dy / chartHeight) * 1.6;
      setPricePanOffset(clampPanOffset(pan.startPricePan + delta, limits));
    }
    if (pan.panH) {
      const width = chartPanRef.current?.clientWidth ?? 640;
      const chartWidth = Math.max(width - 64, 120);
      const dx = clientX - pan.x;
      const barShift = Math.round(-dx * (viewCountRef.current / chartWidth));
      setViewStart(Math.max(0, Math.min(maxViewStartRef.current, pan.startView + barShift)));
    }
  }, []);

  const onPanStart = (clientX: number, clientY: number) => {
    if (!canPanChart) return;
    panRef.current = {
      x: clientX,
      y: clientY,
      startView: viewStart,
      startPricePan: pricePanOffset,
      panH: canPanH,
      panV: canPanV,
    };
    setPanning(true);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || !canPanChart || drawTool !== 'pan') return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    onPanStart(e.clientX, e.clientY);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!panRef.current) return;
    if (!(e.buttons & 1)) {
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      endPan();
      return;
    }
    applyPanMove(e.clientX, e.clientY);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    endPan();
  };

  const onLostPointerCapture = () => {
    endPan();
  };

  useEffect(() => {
    if (!panning) return;
    const finish = () => endPan();
    const move = (e: PointerEvent) => {
      if (!panRef.current) return;
      if (!(e.buttons & 1)) {
        finish();
        return;
      }
      applyPanMove(e.clientX, e.clientY);
    };
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    window.addEventListener('blur', finish);
    window.addEventListener('pointermove', move);
    return () => {
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      window.removeEventListener('blur', finish);
      window.removeEventListener('pointermove', move);
    };
  }, [panning, endPan, applyPanMove]);

  useEffect(() => {
    const el = chartPanRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (showCandle && e.shiftKey) {
        if (e.deltaY < 0) setPriceZoomIdx((z) => Math.max(PRICE_ZOOM_MIN, z - 1));
        else if (e.deltaY > 0) setPriceZoomIdx((z) => Math.min(PRICE_ZOOM_MAX, z + 1));
        return;
      }
      if (!canZoom) return;
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
  }, [canZoom, primaryLen, showCandle]);

  const first = filteredOhlc[0]?.close ?? chartData[0]?.price ?? 0;
  const last = filteredOhlc[filteredOhlc.length - 1]?.close ?? chartData[chartData.length - 1]?.price ?? 0;
  const up = last >= first;
  const changePct = first ? ((last - first) / first) * 100 : 0;
  const stroke = up ? '#10b981' : '#f43f5e';

  const refresh = () => {
    load();
    if (!import.meta.env.PROD && symbol) {
      fetchChartAnalysis(symbol, rangeMeta.period)
        .then((points) => { if (points.length) setAnalysis(points); })
        .catch(() => setAnalysis([]));
    }
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
                onClick={() => setCandleInterval('week')}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all ${candleInterval === 'week' ? 'bg-white dark:bg-slate-900 text-teal-600 dark:text-teal-400 shadow-sm' : 'text-slate-500'}`}
              >
                Week
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
            <AxisZoomControls
              axis="H"
              zoomIdx={zoomIdx}
              minIdx={0}
              maxIdx={ZOOM_STEPS.length - 1}
              label={formatHorizZoomLabel(zoomIdx)}
              isDefault={zoomIdx === 0}
              onZoomIn={zoomIn}
              onZoomOut={zoomOut}
              onReset={resetZoom}
            />
          )}
          {showCandle && visibleOhlc.length >= 3 && (
            <AxisZoomControls
              axis="Y"
              zoomIdx={priceZoomIdx}
              minIdx={PRICE_ZOOM_MIN}
              maxIdx={PRICE_ZOOM_MAX}
              label={formatPriceZoomLabel(priceZoomIdx, priceFitAll)}
              isDefault={!priceZoomActive}
              onZoomIn={priceZoomIn}
              onZoomOut={priceZoomOut}
              onReset={resetPriceZoom}
              onFitAll={fitAllPrice}
            />
          )}
          {showCandle && visibleOhlc.length >= 3 && (
            <DrawToolsToolbar
              tool={drawTool}
              onToolChange={(t) => {
                setDrawTool(t);
                setDraftDrawing(null);
                if (t !== 'select') setSelectedDrawingId(null);
              }}
              drawingCount={drawings.length}
              hasSelection={!!selectedDrawingId}
              onDeleteSelected={() => {
                if (!selectedDrawingId) return;
                setDrawings((prev) => prev.filter((d) => d.id !== selectedDrawingId));
                setSelectedDrawingId(null);
              }}
              onClearAll={() => {
                setDrawings([]);
                setSelectedDrawingId(null);
                setDraftDrawing(null);
              }}
              disabled={loading}
            />
          )}
          {showCandle && visibleOhlc.length >= 3 && (
            <IndicatorsPanel layers={awaisLayers} onApply={setAwaisLayers} disabled={loading} />
          )}
          {(showCandle || showTechnical || mode === 'line') && (
            <MomentumPanel config={momentumConfig} onApply={setMomentumConfig} disabled={loading} />
          )}
          <button onClick={refresh} disabled={loading} className="p-2 rounded-lg text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors disabled:opacity-40" title="Refresh">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="p-4">
        {!loading && (showCandle || showTechnical || mode === 'line') && (
          <LayerToggleBar
            layers={layers}
            onToggle={toggleLayer}
            hasVolume={hasVolume}
            momentumLabel={(() => {
              const { active, total } = countMomentumEnabled(momentumConfig);
              if (active === 0) return 'Momentum';
              if (active === 1) return activeMomentumTypes(momentumConfig)[0];
              if (active === total) return 'All';
              return `${active}/${total}`;
            })()}
          />
        )}
        <div
          className={`${canPanChart && drawTool === 'pan' ? (panning ? 'cursor-grabbing touch-none' : 'cursor-grab touch-none') : ''}`}
          ref={chartPanRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onLostPointerCapture={onLostPointerCapture}
        >
        {showTechnical ? (
          loading && filteredAnalysis.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-28 text-slate-400">
              <Loader2 size={22} className="animate-spin mb-2" />
              <span className="text-xs font-medium">Loading price history for {symbol}…</span>
            </div>
          ) : filteredAnalysis.length < 2 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-28">Not enough data for technical analysis.</p>
          ) : (
            <BollingerRsiChart
              points={visibleAnalysisWithVol}
              symbol={symbol || ''}
              layers={layers}
              momentumConfig={momentumConfig}
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
            <CandleChart
              bars={visibleOhlc}
              analysis={candleAnalysis}
              layers={layers}
              momentumConfig={momentumConfig}
              momentumSeries={momentumSeriesVisible}
              awaisLayers={awaisLayers}
              awaisData={awaisVisible}
              candleInterval={candleInterval}
              height={CANDLE_CHART_HEIGHT}
              panning={panning}
              canPan={canPanChart && drawTool === 'pan'}
              priceZoomIdx={priceZoomIdx}
              pricePanOffset={pricePanOffset}
              priceFitAll={priceFitAll}
              pricePanLimits={pricePanLimits}
              plotRef={candlePlotRef}
              drawTool={drawTool}
              drawings={drawings}
              draftDrawing={draftDrawing}
              selectedDrawingId={selectedDrawingId}
              onDrawingsChange={setDrawings}
              onDraftChange={setDraftDrawing}
              onSelectDrawing={setSelectedDrawingId}
            />
            {!candleAnalysis.length && candleInterval === 'day' && visibleOhlc.length >= 3 && (
              <p className="text-[10px] text-slate-400 px-1">Not enough data for indicator overlays in this range.</p>
            )}
            {!candleAnalysis.length && (candleInterval === 'month' || candleInterval === 'week') && visibleOhlc.length >= 3 && (
              <p className="text-[10px] text-slate-400 px-1">
                Need more {candleInterval === 'week' ? 'weekly' : 'monthly'} bars for indicator overlays.
              </p>
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
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }} axisLine={false} tickLine={false} minTickGap={40} hide={(layers.volume && hasVolume) || layers.momentum} />
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
            {layers.momentum && momentumVisibleBars.length >= 3 && (
              <LineMomentumPanel
                bars={momentumVisibleBars}
                config={momentumConfig}
                momentumSeries={momentumSeriesVisible}
                showVolume={layers.volume && hasVolume}
              />
            )}
            {layers.volume && hasVolume && visibleOhlc.length > 0 && (
              <LineVolumePanel bars={visibleOhlc} />
            )}
            {!filteredAnalysis.length && mode === 'line' && filteredLine.length < 3 && (
              <p className="text-[10px] text-slate-400 px-1">Not enough price history for indicator overlays.</p>
            )}
          </div>
        )}
        </div>
        {!showTechnical && !showCandle && (
        <p className="text-[10px] text-slate-400 mt-2 px-1">
          {canCandle
            ? 'Daily OHLCV from PSX historical (same source as pypsx_toolkit.download) — open, high, low, close, volume.'
            : 'Close-only fallback from PSX timeseries. Candles need OHLCV from /api/proxy?ohlc=.'}
        </p>
        )}
        {showCandle && canPanChart && (
          <p className="text-[10px] text-slate-400 mt-2 px-1">
            Drag to pan (Pan tool) · Draw toolbar: trend, fib, H/V lines, box · Del removes selected · Scroll zoom time · Shift+scroll zoom price
            {hasAnyPivot(awaisLayers) && ' · Y Targets fits pivot levels'}
            {canPanH && visibleRangeLabel ? ` · ${visibleRangeLabel}` : ''}
          </p>
        )}
        {!showCandle && canPan && (
          <p className="text-[10px] text-slate-400 mt-2 px-1">
            Drag left/right to pan · scroll or +/- to zoom · {visibleRangeLabel}
          </p>
        )}
      </div>
    </div>
  );
};
