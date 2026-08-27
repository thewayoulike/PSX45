import React, { useEffect, useMemo, useState } from 'react';
import { Activity, X } from 'lucide-react';
import type { OhlcBar } from '../services/psxData';
import {
  DEFAULT_MOMENTUM_CONFIG,
  MOMENTUM_TYPES,
  MomentumConfig,
  MomentumIndicatorType,
  activeMomentumTypes,
  cloneMomentumConfig,
  computeMomentumSeries,
  countMomentumEnabled,
  momentumPanelLabel,
  setAllMomentumEnabled,
} from '../utils/momentumIndicators';

export const CANDLE_CHART_HEIGHT = 520;
export const MOMENTUM_PANEL_HEIGHT = 168;
export const MOMENTUM_MACD_HEIGHT = 188;
export const VOLUME_PANEL_HEIGHT = 148;

function makeOscillatorScale(domainMin: number, domainMax: number, top: number, innerH: number) {
  const span = domainMax - domainMin || 1;
  return (v: number) => top + ((domainMax - v) / span) * innerH;
}

function oscillatorDomain(lo: number, hi: number, pad = 10): { min: number; max: number } {
  return { min: Math.max(0, lo - pad), max: Math.min(100, hi + pad) };
}

type PanelTab = 'inputs' | 'style';

function polylinePath(values: (number | null | undefined)[], xAt: (i: number) => number, yAt: (v: number) => number): string {
  let d = '';
  values.forEach((v, i) => {
    if (v == null || !Number.isFinite(v)) return;
    d += `${d ? ' L' : 'M'} ${xAt(i)} ${yAt(v)}`;
  });
  return d;
}

function NumberInput({
  label,
  value,
  onChange,
  min = 1,
  max = 500,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <label className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 text-[11px]">
      <span className="font-semibold text-slate-600 dark:text-slate-300">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || min)))}
        className="w-16 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-semibold tabular-nums text-right"
      />
    </label>
  );
}

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 text-[11px]">
      <span className="font-semibold text-slate-600 dark:text-slate-300">{label}</span>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-8 h-6 rounded border border-slate-200 dark:border-slate-700 cursor-pointer"
      />
    </label>
  );
}

function MomentumPanelContent({
  draft,
  setDraft,
  tab,
}: {
  draft: MomentumConfig;
  setDraft: React.Dispatch<React.SetStateAction<MomentumConfig>>;
  tab: PanelTab;
}) {
  const patch = <K extends keyof MomentumConfig>(key: K, value: MomentumConfig[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const toggleType = (type: MomentumIndicatorType) => {
    setDraft((prev) => ({
      ...prev,
      enabled: { ...prev.enabled, [type]: !prev.enabled[type] },
    }));
  };

  if (tab === 'inputs') {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2 px-2 py-1 border-b border-slate-100 dark:border-slate-800">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Show on chart</p>
          <span className="inline-flex items-center gap-1">
            <button type="button" onClick={() => patch('enabled', setAllMomentumEnabled(true))} className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-500/10">All</button>
            <span className="text-slate-300">·</span>
            <button type="button" onClick={() => patch('enabled', setAllMomentumEnabled(false))} className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">None</button>
          </span>
        </div>
        {MOMENTUM_TYPES.map((type) => (
          <label key={type} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer text-[11px] font-semibold text-slate-700 dark:text-slate-200">
            <input type="checkbox" checked={draft.enabled[type]} onChange={() => toggleType(type)} className="rounded border-slate-300 text-purple-600 focus:ring-purple-500" />
            {type}
          </label>
        ))}

        {draft.enabled.RSI && (
          <div className="border-t border-slate-100 dark:border-slate-800 pt-2">
            <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">RSI Settings</p>
            <NumberInput label="RSI Length" value={draft.rsi.length} onChange={(v) => patch('rsi', { ...draft.rsi, length: v })} />
            <NumberInput label="Overbought" value={draft.rsi.overbought} onChange={(v) => patch('rsi', { ...draft.rsi, overbought: v })} min={1} max={100} />
            <NumberInput label="Oversold" value={draft.rsi.oversold} onChange={(v) => patch('rsi', { ...draft.rsi, oversold: v })} min={1} max={100} />
            <label className="flex items-center gap-2 px-2 py-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-200">
              <input type="checkbox" checked={draft.rsi.showSmoothing} onChange={() => patch('rsi', { ...draft.rsi, showSmoothing: !draft.rsi.showSmoothing })} className="rounded border-slate-300 text-purple-600 focus:ring-purple-500" />
              Show Smoothing MA
            </label>
            {draft.rsi.showSmoothing && (
              <>
                <label className="flex items-center justify-between gap-2 px-2 py-1.5 text-[11px]">
                  <span className="font-semibold text-slate-600 dark:text-slate-300">Smoothing Type</span>
                  <select value={draft.rsi.smoothingType} onChange={(e) => patch('rsi', { ...draft.rsi, smoothingType: e.target.value as 'SMA' | 'EMA' })} className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-bold">
                    <option value="SMA">SMA</option>
                    <option value="EMA">EMA</option>
                  </select>
                </label>
                <NumberInput label="Smoothing Length" value={draft.rsi.smoothingLength} onChange={(v) => patch('rsi', { ...draft.rsi, smoothingLength: v })} />
              </>
            )}
          </div>
        )}

        {draft.enabled.MACD && (
          <div className="border-t border-slate-100 dark:border-slate-800 pt-2">
            <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">MACD Settings</p>
            <NumberInput label="Fast Length" value={draft.macd.fast} onChange={(v) => patch('macd', { ...draft.macd, fast: v })} />
            <NumberInput label="Slow Length" value={draft.macd.slow} onChange={(v) => patch('macd', { ...draft.macd, slow: v })} />
            <NumberInput label="Signal Length" value={draft.macd.signal} onChange={(v) => patch('macd', { ...draft.macd, signal: v })} />
          </div>
        )}

        {draft.enabled.Stochastic && (
          <div className="border-t border-slate-100 dark:border-slate-800 pt-2">
            <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Stochastic Settings</p>
            <NumberInput label="%K Length" value={draft.stochastic.kLength} onChange={(v) => patch('stochastic', { ...draft.stochastic, kLength: v })} />
            <NumberInput label="%D Length" value={draft.stochastic.dLength} onChange={(v) => patch('stochastic', { ...draft.stochastic, dLength: v })} />
            <NumberInput label="Smoothing" value={draft.stochastic.smooth} onChange={(v) => patch('stochastic', { ...draft.stochastic, smooth: v })} />
            <NumberInput label="Overbought" value={draft.stochastic.overbought} onChange={(v) => patch('stochastic', { ...draft.stochastic, overbought: v })} min={1} max={100} />
            <NumberInput label="Oversold" value={draft.stochastic.oversold} onChange={(v) => patch('stochastic', { ...draft.stochastic, oversold: v })} min={1} max={100} />
          </div>
        )}

        {draft.enabled.ADX && (
          <div className="border-t border-slate-100 dark:border-slate-800 pt-2">
            <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">ADX Settings</p>
            <NumberInput label="ADX Length" value={draft.adx.adxLength} onChange={(v) => patch('adx', { ...draft.adx, adxLength: v })} />
            <NumberInput label="DI Length" value={draft.adx.diLength} onChange={(v) => patch('adx', { ...draft.adx, diLength: v })} />
            <NumberInput label="Trend Threshold" value={draft.adx.threshold} onChange={(v) => patch('adx', { ...draft.adx, threshold: v })} min={1} max={100} />
          </div>
        )}
      </div>
    );
  }

  const enabled = activeMomentumTypes(draft);
  if (!enabled.length) {
    return <p className="px-2 py-4 text-[11px] text-slate-400">Enable at least one indicator on the Inputs tab.</p>;
  }

  return (
    <div className="space-y-3">
      {draft.enabled.RSI && (
        <>
          <p className="px-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">RSI</p>
          <ColorInput label="RSI Line" value={draft.rsi.color} onChange={(v) => patch('rsi', { ...draft.rsi, color: v })} />
          {draft.rsi.showSmoothing && (
            <ColorInput label="Smoothing MA" value={draft.rsi.smoothingColor} onChange={(v) => patch('rsi', { ...draft.rsi, smoothingColor: v })} />
          )}
        </>
      )}
      {draft.enabled.MACD && (
        <>
          <p className="px-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">MACD</p>
          <ColorInput label="MACD Line" value={draft.macd.lineColor} onChange={(v) => patch('macd', { ...draft.macd, lineColor: v })} />
          <ColorInput label="Signal Line" value={draft.macd.signalColor} onChange={(v) => patch('macd', { ...draft.macd, signalColor: v })} />
          <ColorInput label="Above Zero - Rising" value={draft.macd.histAboveRising} onChange={(v) => patch('macd', { ...draft.macd, histAboveRising: v })} />
          <ColorInput label="Above Zero - Falling" value={draft.macd.histAboveFalling} onChange={(v) => patch('macd', { ...draft.macd, histAboveFalling: v })} />
          <ColorInput label="Below Zero - Rising" value={draft.macd.histBelowRising} onChange={(v) => patch('macd', { ...draft.macd, histBelowRising: v })} />
          <ColorInput label="Below Zero - Falling" value={draft.macd.histBelowFalling} onChange={(v) => patch('macd', { ...draft.macd, histBelowFalling: v })} />
        </>
      )}
      {draft.enabled.Stochastic && (
        <>
          <p className="px-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Stochastic</p>
          <ColorInput label="%K Color" value={draft.stochastic.kColor} onChange={(v) => patch('stochastic', { ...draft.stochastic, kColor: v })} />
          <ColorInput label="%D Color" value={draft.stochastic.dColor} onChange={(v) => patch('stochastic', { ...draft.stochastic, dColor: v })} />
        </>
      )}
      {draft.enabled.ADX && (
        <>
          <p className="px-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">ADX</p>
          <ColorInput label="ADX Line" value={draft.adx.color} onChange={(v) => patch('adx', { ...draft.adx, color: v })} />
        </>
      )}
    </div>
  );
}

export const MomentumPanel: React.FC<{
  config: MomentumConfig;
  onApply: (config: MomentumConfig) => void;
  disabled?: boolean;
}> = ({ config, onApply, disabled }) => {
  const { active, total } = countMomentumEnabled(config);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<PanelTab>('inputs');
  const [draft, setDraft] = useState(() => cloneMomentumConfig(config));

  useEffect(() => {
    if (open) {
      setDraft(cloneMomentumConfig(config));
      setTab('inputs');
    }
  }, [open, config]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-[11px] font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 shadow-sm hover:border-purple-300 dark:hover:border-purple-600 transition-colors disabled:opacity-40"
        title="Momentum panel settings"
      >
        <Activity size={14} className="text-purple-600" />
        Momentum
        <span className="text-[10px] font-bold text-slate-400 tabular-nums">{active}/{total}</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Momentum panel settings">
          <button type="button" className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" aria-label="Close" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-[380px] max-h-[min(520px,90vh)] bg-white dark:bg-slate-900 shadow-2xl rounded-2xl border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-800 shrink-0">
              <div className="flex items-center gap-2">
                <Activity size={16} className="text-purple-600" />
                <h4 className="text-sm font-black text-slate-900 dark:text-white">Momentum Selector</h4>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800">
                <X size={16} />
              </button>
            </div>
            <div className="flex border-b border-slate-200 dark:border-slate-800 shrink-0">
              {(['inputs', 'style'] as PanelTab[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`flex-1 px-3 py-2 text-[11px] font-bold capitalize transition-colors ${
                    tab === t ? 'text-purple-600 border-b-2 border-purple-500 bg-purple-50/50 dark:bg-purple-500/10' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              <MomentumPanelContent draft={draft} setDraft={setDraft} tab={tab} />
            </div>
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-slate-200 dark:border-slate-800 shrink-0">
              <button
                type="button"
                onClick={() => setDraft(cloneMomentumConfig(DEFAULT_MOMENTUM_CONFIG))}
                className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Defaults
              </button>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setOpen(false)} className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800">Cancel</button>
                <button
                  type="button"
                  onClick={() => { onApply(cloneMomentumConfig(draft)); setOpen(false); }}
                  className="px-4 py-1.5 rounded-lg text-[11px] font-bold bg-purple-600 text-white hover:bg-purple-700"
                >
                  Ok
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export const MomentumMiniChart: React.FC<{
  type: MomentumIndicatorType;
  bars: OhlcBar[];
  config: MomentumConfig;
  series?: ReturnType<typeof computeMomentumSeries>;
  slot: number;
  padL: number;
  width: number;
  height?: number;
  showXLabels?: boolean;
  hoverX?: number | null;
  hoverIdx?: number | null;
  plotMouseHandlers?: { onMouseMove: (e: React.MouseEvent<SVGSVGElement>) => void; onMouseLeave: () => void };
}> = ({ type, bars, config, series: seriesProp, slot, padL, width, height, showXLabels = false, hoverX = null, hoverIdx = null, plotMouseHandlers }) => {
  const computed = useMemo(() => computeMomentumSeries(bars, config), [bars, config]);
  const series = seriesProp ?? computed;
  const panelHeight = height ?? (type === 'MACD' ? MOMENTUM_MACD_HEIGHT : MOMENTUM_PANEL_HEIGHT);
  const pad = { t: 12, r: 56, b: 24, l: 52 };
  const innerH = panelHeight - pad.t - pad.b;
  const xAt = (i: number) => padL + i * slot + slot / 2;
  const label = momentumPanelLabel(config, type);
  const crosshair = hoverX != null ? (
    <line x1={hoverX} x2={hoverX} y1={pad.t} y2={pad.t + innerH} stroke="#94a3b8" strokeWidth={1} strokeDasharray="4 4" opacity={0.85} pointerEvents="none" />
  ) : null;

  if (type === 'RSI') {
    const { min: yMin, max: yMax } = oscillatorDomain(config.rsi.oversold, config.rsi.overbought, 12);
    const yRsi = makeOscillatorScale(yMin, yMax, pad.t, innerH);
    const refLevels = [config.rsi.overbought, 50, config.rsi.oversold].filter((lvl) => lvl >= yMin && lvl <= yMax);
    const lines = refLevels.map((lvl) => ({
      lvl,
      color: lvl === config.rsi.overbought ? '#ef4444' : lvl === config.rsi.oversold ? '#22c55e' : '#94a3b8',
      dotted: lvl === 50,
    }));
    return (
      <div>
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1 px-1">{label}</div>
        <svg width={width} height={panelHeight} className="overflow-visible" {...plotMouseHandlers}>
          {lines.map(({ lvl, color, dotted }) => (
            <g key={lvl}>
              <line x1={padL} x2={width - pad.r} y1={yRsi(lvl)} y2={yRsi(lvl)} stroke={color} strokeOpacity={lvl === 50 ? 0.35 : 0.85} strokeDasharray={dotted ? '2 4' : '4 3'} strokeWidth={1} />
              <text x={width - 8} y={yRsi(lvl) + 3} textAnchor="end" fontSize={10} fill="#475569" fontWeight={700}>{lvl}</text>
            </g>
          ))}
          <path d={polylinePath(series.map((p) => p.rsi), xAt, yRsi)} fill="none" stroke={config.rsi.color} strokeWidth={2} />
          {config.rsi.showSmoothing && (
            <path d={polylinePath(series.map((p) => p.rsiSmooth), xAt, yRsi)} fill="none" stroke={config.rsi.smoothingColor} strokeWidth={1} />
          )}
          {crosshair}
          {hoverIdx != null && series[hoverIdx]?.rsi != null && (
            <>
              <rect x={width - 44} y={yRsi(series[hoverIdx]!.rsi!) - 10} width={38} height={16} rx={4} fill="#1e293b" />
              <text x={width - 8} y={yRsi(series[hoverIdx]!.rsi!) + 4} textAnchor="end" fontSize={9} fill="#f8fafc" fontWeight={700}>
                {series[hoverIdx]!.rsi!.toFixed(1)}
              </text>
            </>
          )}
        </svg>
      </div>
    );
  }

  if (type === 'Stochastic') {
    const { min: yMin, max: yMax } = oscillatorDomain(config.stochastic.oversold, config.stochastic.overbought, 12);
    const ySt = makeOscillatorScale(yMin, yMax, pad.t, innerH);
    return (
      <div>
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1 px-1">{label}</div>
        <svg width={width} height={panelHeight} className="overflow-visible" {...plotMouseHandlers}>
          {[config.stochastic.overbought, config.stochastic.oversold].filter((lvl) => lvl >= yMin && lvl <= yMax).map((lvl) => (
            <g key={lvl}>
              <line x1={padL} x2={width - pad.r} y1={ySt(lvl)} y2={ySt(lvl)} stroke={lvl >= 50 ? '#ef4444' : '#22c55e'} strokeOpacity={0.85} strokeDasharray="4 3" strokeWidth={1} />
              <text x={width - 8} y={ySt(lvl) + 3} textAnchor="end" fontSize={10} fill="#475569" fontWeight={700}>{lvl}</text>
            </g>
          ))}
          <path d={polylinePath(series.map((p) => p.stochK), xAt, ySt)} fill="none" stroke={config.stochastic.kColor} strokeWidth={2} />
          <path d={polylinePath(series.map((p) => p.stochD), xAt, ySt)} fill="none" stroke={config.stochastic.dColor} strokeWidth={1} />
          {crosshair}
        </svg>
      </div>
    );
  }

  if (type === 'ADX') {
    const yMax = Math.min(100, Math.max(config.adx.threshold * 2, 50));
    const yAdx = makeOscillatorScale(0, yMax, pad.t, innerH);
    return (
      <div>
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1 px-1">{label}</div>
        <svg width={width} height={panelHeight} className="overflow-visible" {...plotMouseHandlers}>
          <line x1={padL} x2={width - pad.r} y1={yAdx(config.adx.threshold)} y2={yAdx(config.adx.threshold)} stroke={config.adx.color} strokeOpacity={0.85} strokeDasharray="4 3" strokeWidth={1} />
          <text x={width - 8} y={yAdx(config.adx.threshold) + 3} textAnchor="end" fontSize={10} fill="#475569" fontWeight={700}>{config.adx.threshold}</text>
          <text x={width - 8} y={pad.t + 4} textAnchor="end" fontSize={9} fill="#475569" fontWeight={700}>{yMax}</text>
          <path d={polylinePath(series.map((p) => p.adx), xAt, yAdx)} fill="none" stroke={config.adx.color} strokeWidth={2} />
          {crosshair}
        </svg>
      </div>
    );
  }

  // MACD
  const barW = Math.max(2, Math.min(8, slot * 0.55));
  const nums: number[] = [0];
  series.forEach((p) => {
    if (p.macd != null) nums.push(p.macd);
    if (p.macdSignal != null) nums.push(p.macdSignal);
    if (p.macdHist != null) nums.push(p.macdHist);
  });
  const minV = Math.min(...nums);
  const maxV = Math.max(...nums);
  const span = maxV - minV || 1;
  const yMin = minV - span * 0.08;
  const yMax = maxV + span * 0.08;
  const yScale = (v: number) => pad.t + ((yMax - v) / (yMax - yMin)) * innerH;
  const zeroY = yScale(0);

  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1 px-1">{label}</div>
      <svg width={width} height={panelHeight} className="overflow-visible" {...plotMouseHandlers}>
        <line x1={padL} x2={width - pad.r} y1={zeroY} y2={zeroY} stroke="#94a3b8" strokeOpacity={0.6} strokeWidth={0.5} />
        {series.map((p, i) => {
          if (p.macdHist == null) return null;
          const x = xAt(i);
          const y = yScale(p.macdHist);
          const top = Math.min(y, zeroY);
          const h = Math.max(1, Math.abs(y - zeroY));
          return <rect key={i} x={x - barW / 2} y={top} width={barW} height={h} fill={p.macdHistColor ?? '#64748b'} rx={0.5} />;
        })}
        <path d={polylinePath(series.map((p) => p.macd), xAt, yScale)} fill="none" stroke={config.macd.lineColor} strokeWidth={2} />
        <path d={polylinePath(series.map((p) => p.macdSignal), xAt, yScale)} fill="none" stroke={config.macd.signalColor} strokeWidth={1} />
        {crosshair}
        {showXLabels && bars.length > 0 && [0, Math.floor(bars.length / 2), bars.length - 1].map((i) => (
          <text key={i} x={xAt(i)} y={panelHeight - 4} textAnchor="middle" fontSize={10} fill="#94a3b8" fontWeight={600}>
            {new Date(bars[i].time).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </text>
        ))}
      </svg>
    </div>
  );
};

export function momentumHoverText(config: MomentumConfig, point: ReturnType<typeof computeMomentumSeries>[number] | undefined): string | null {
  if (!point) return null;
  const parts: string[] = [];
  if (config.enabled.RSI && point.rsi != null) parts.push(`RSI ${point.rsi.toFixed(1)}`);
  if (config.enabled.MACD && point.macd != null) parts.push(`MACD ${point.macd.toFixed(3)}`);
  if (config.enabled.Stochastic && point.stochK != null) parts.push(`Stoch ${point.stochK.toFixed(1)}`);
  if (config.enabled.ADX && point.adx != null) parts.push(`ADX ${point.adx.toFixed(1)}`);
  return parts.length ? parts.join(' · ') : null;
}
