import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Layers } from 'lucide-react';
import {
  AWAIS_BB_OPTIONS,
  AWAIS_ICHI_OPTIONS,
  AWAIS_MA_LINES,
  AWAIS_PIVOT_OPTIONS,
  AWAIS_SUPERTREND_OPTIONS,
  AwaisLayers,
  AwaisOverlayData,
  BbKey,
  IchimokuKey,
  MaPeriod,
  PivotLabel,
  SupertrendKey,
  countAwaisActiveLayers,
  ichimokuPlottedSpans,
} from '../utils/awaisIndicators';

function PanelSection({
  title,
  children,
  bordered,
}: {
  title: string;
  children: React.ReactNode;
  bordered?: boolean;
}) {
  return (
    <>
      <p
        className={`text-[10px] font-bold uppercase tracking-widest text-slate-400 px-2 pt-2 pb-1 ${
          bordered ? 'border-t border-slate-100 dark:border-slate-800 mt-1' : ''
        }`}
      >
        {title}
      </p>
      {children}
    </>
  );
}

function PanelCheckbox({
  checked,
  onChange,
  color,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  color: string;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer text-[11px] font-semibold text-slate-700 dark:text-slate-200">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
      />
      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
      {label}
    </label>
  );
}

export const AwaisPanelDropdown: React.FC<{
  layers: AwaisLayers;
  onToggleMa: (period: MaPeriod) => void;
  onToggleBb: (key: BbKey) => void;
  onToggleSupertrend: (key: SupertrendKey) => void;
  onTogglePivot: (label: PivotLabel) => void;
  onToggleIchimoku: (key: IchimokuKey) => void;
  disabled?: boolean;
}> = ({ layers, onToggleMa, onToggleBb, onToggleSupertrend, onTogglePivot, onToggleIchimoku, disabled }) => {
  const { active, total } = countAwaisActiveLayers(layers);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div className="relative mb-3 px-1" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-[11px] font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 shadow-sm hover:border-teal-300 dark:hover:border-teal-600 transition-colors disabled:opacity-40"
      >
        <Layers size={14} className="text-teal-600" />
        Indicators
        <span className="text-[10px] font-bold text-slate-400 tabular-nums">
          {active}/{total}
        </span>
        <ChevronDown size={14} className="text-slate-400" />
      </button>
      {open && (
        <div className="absolute left-1 top-full mt-1 z-30 min-w-[260px] max-h-[70vh] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg p-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 px-2 py-1">Control Panel</p>

          <PanelSection title="MA / EMA Lines">
            {AWAIS_MA_LINES.map((ma) => (
              <PanelCheckbox
                key={ma.period}
                checked={layers.maLines[ma.period]}
                onChange={() => onToggleMa(ma.period)}
                color={ma.color}
                label={`${ma.label} SMA`}
              />
            ))}
          </PanelSection>

          <PanelSection title="Bollinger Bands" bordered>
            {AWAIS_BB_OPTIONS.map((opt) => (
              <PanelCheckbox
                key={opt.key}
                checked={layers.bb[opt.key]}
                onChange={() => onToggleBb(opt.key)}
                color={opt.color}
                label={opt.label}
              />
            ))}
          </PanelSection>

          <PanelSection title="Supertrend" bordered>
            {AWAIS_SUPERTREND_OPTIONS.map((opt) => (
              <PanelCheckbox
                key={opt.key}
                checked={layers.supertrend[opt.key]}
                onChange={() => onToggleSupertrend(opt.key)}
                color={opt.color}
                label={opt.label}
              />
            ))}
          </PanelSection>

          <PanelSection title="Pivot Levels" bordered>
            {AWAIS_PIVOT_OPTIONS.map((opt) => (
              <PanelCheckbox
                key={opt.key}
                checked={layers.pivot[opt.key]}
                onChange={() => onTogglePivot(opt.key)}
                color={opt.color}
                label={opt.label}
              />
            ))}
          </PanelSection>

          <PanelSection title="Ichimoku Cloud" bordered>
            {AWAIS_ICHI_OPTIONS.map((opt) => (
              <PanelCheckbox
                key={opt.key}
                checked={layers.ichimoku[opt.key]}
                onChange={() => onToggleIchimoku(opt.key)}
                color={opt.color}
                label={opt.label}
              />
            ))}
          </PanelSection>
        </div>
      )}
    </div>
  );
};

function segmentedPath(
  values: (number | null | undefined)[],
  xAt: (i: number) => number,
  yAt: (v: number) => number
): string {
  let d = '';
  let open = false;
  values.forEach((v, i) => {
    if (v == null || !Number.isFinite(v)) {
      open = false;
      return;
    }
    const x = xAt(i);
    const y = yAt(v);
    if (!open) {
      d += `${d ? ' M' : 'M'} ${x} ${y}`;
      open = true;
    } else {
      d += ` L ${x} ${y}`;
    }
  });
  return d;
}

function cloudFillPath(
  top: (number | null)[],
  bottom: (number | null)[],
  xAt: (i: number) => number,
  yAt: (v: number) => number
): string {
  const fwd: string[] = [];
  const back: string[] = [];
  for (let i = 0; i < top.length; i++) {
    const a = top[i];
    const b = bottom[i];
    if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) continue;
    fwd.push(`${xAt(i)},${yAt(a)}`);
    back.unshift(`${xAt(i)},${yAt(b)}`);
  }
  if (fwd.length < 2) return '';
  return `M ${fwd.join(' L ')} L ${back.join(' L ')} Z`;
}

export const AwaisSvgOverlays: React.FC<{
  data: AwaisOverlayData;
  layers: AwaisLayers;
  barCount: number;
  xAt: (i: number) => number;
  yScale: (v: number) => number;
  plotOffset: number;
  width: number;
  padRight: number;
}> = ({ data, layers, barCount, xAt, yScale, plotOffset, width, padRight }) => {
  const { spanA, spanB } = ichimokuPlottedSpans(data.ichimoku, barCount);
  const bbUpper = data.bb.upper.slice(0, barCount);
  const bbMiddle = data.bb.middle.slice(0, barCount);
  const bbLower = data.bb.lower.slice(0, barCount);
  const stUp = data.supertrend.up.slice(0, barCount);
  const stDown = data.supertrend.down.slice(0, barCount);

  return (
    <>
      {layers.ichimoku.cloud && (
        <path d={cloudFillPath(spanA, spanB, xAt, yScale)} fill="#43A047" fillOpacity={0.12} />
      )}
      {layers.ichimoku.spanA && (
        <path d={segmentedPath(spanA, xAt, yScale)} fill="none" stroke="#A5D6A7" strokeWidth={1} />
      )}
      {layers.ichimoku.spanB && (
        <path d={segmentedPath(spanB, xAt, yScale)} fill="none" stroke="#EF9A9A" strokeWidth={1} />
      )}
      {layers.ichimoku.conversion && (
        <path
          d={segmentedPath(data.ichimoku.conversion.slice(0, barCount), xAt, yScale)}
          fill="none"
          stroke="#2962FF"
          strokeWidth={1}
        />
      )}
      {layers.ichimoku.base && (
        <path
          d={segmentedPath(data.ichimoku.base.slice(0, barCount), xAt, yScale)}
          fill="none"
          stroke="#B71C1C"
          strokeWidth={1}
        />
      )}

      {layers.bb.fill && (
        <path d={cloudFillPath(bbUpper, bbLower, xAt, yScale)} fill="#f9f9f9" fillOpacity={0.35} />
      )}
      {layers.bb.upper && (
        <path
          d={segmentedPath(bbUpper, xAt, yScale)}
          fill="none"
          stroke="#2962FF"
          strokeWidth={1}
          strokeDasharray="4 3"
        />
      )}
      {layers.bb.middle && (
        <path d={segmentedPath(bbMiddle, xAt, yScale)} fill="none" stroke="#100c09" strokeWidth={1} />
      )}
      {layers.bb.lower && (
        <path
          d={segmentedPath(bbLower, xAt, yScale)}
          fill="none"
          stroke="#2962FF"
          strokeWidth={1}
          strokeDasharray="4 3"
        />
      )}

      {data.maLines
        .filter((ma) => layers.maLines[ma.period as MaPeriod])
        .map((ma) => (
          <path
            key={ma.period}
            d={segmentedPath(ma.values.slice(0, barCount), xAt, yScale)}
            fill="none"
            stroke={ma.color}
            strokeWidth={2}
          />
        ))}

      {layers.supertrend.up && (
        <path d={segmentedPath(stUp, xAt, yScale)} fill="none" stroke="#22c55e" strokeWidth={2} />
      )}
      {layers.supertrend.down && (
        <path d={segmentedPath(stDown, xAt, yScale)} fill="none" stroke="#ef4444" strokeWidth={2} />
      )}

      {data.pivots
        .filter((pv) => layers.pivot[pv.label as PivotLabel])
        .map((pv) => (
          <g key={pv.label}>
            <line
              x1={plotOffset}
              x2={width - padRight}
              y1={yScale(pv.value)}
              y2={yScale(pv.value)}
              stroke="#FB8C00"
              strokeWidth={1}
              strokeDasharray="6 4"
              strokeOpacity={0.85}
            />
            <text
              x={width - padRight - 4}
              y={yScale(pv.value) - 3}
              textAnchor="end"
              fontSize={9}
              fill="#FB8C00"
              fontWeight={700}
            >
              {pv.label} {pv.value.toFixed(2)}
            </text>
          </g>
        ))}
    </>
  );
};
