import React, { useState, useEffect } from 'react';
import { Layers, X } from 'lucide-react';
import {
  AWAIS_BB_OPTIONS,
  AWAIS_ICHI_OPTIONS,
  AWAIS_PIVOT_OPTIONS,
  AWAIS_SUPERTREND_OPTIONS,
  DEFAULT_AWAIS_LAYERS,
  MA_SLOTS,
  MA_TYPES,
  AwaisLayerGroup,
  AwaisLayers,
  AwaisOverlayData,
  BbKey,
  IchimokuKey,
  MaSlot,
  MaType,
  PivotLabel,
  SupertrendKey,
  cloneAwaisLayers,
  countAwaisActiveLayers,
  ichimokuPlottedSpans,
  isMaSeriesVisible,
  maSlotLabel,
  setAwaisGroupEnabled,
} from '../utils/awaisIndicators';

function BulkToggleButtons({
  onSelectAll,
  onSelectNone,
}: {
  onSelectAll: () => void;
  onSelectNone: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 shrink-0">
      <button
        type="button"
        onClick={onSelectAll}
        className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-500/10 transition-colors"
      >
        All
      </button>
      <span className="text-slate-300 dark:text-slate-600">·</span>
      <button
        type="button"
        onClick={onSelectNone}
        className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
      >
        None
      </button>
    </span>
  );
}

function PanelSection({
  title,
  children,
  bordered,
  onSelectAll,
  onSelectNone,
}: {
  title: string;
  children: React.ReactNode;
  bordered?: boolean;
  onSelectAll?: () => void;
  onSelectNone?: () => void;
}) {
  return (
    <>
      <div
        className={`flex items-center justify-between gap-2 px-2 pt-2 pb-1 ${
          bordered ? 'border-t border-slate-100 dark:border-slate-800 mt-1' : ''
        }`}
      >
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{title}</p>
        {onSelectAll && onSelectNone && (
          <BulkToggleButtons onSelectAll={onSelectAll} onSelectNone={onSelectNone} />
        )}
      </div>
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

type PanelTab = 'inputs' | 'style' | 'visibility';

function IndicatorsPanelContent({
  draft,
  setDraft,
  tab,
}: {
  draft: AwaisLayers;
  setDraft: React.Dispatch<React.SetStateAction<AwaisLayers>>;
  tab: PanelTab;
}) {
  const setGroup = (group: AwaisLayerGroup, enabled: boolean) => {
    setDraft((prev) => setAwaisGroupEnabled(prev, group, enabled));
  };

  const toggleMa = (slot: MaSlot) => {
    setDraft((prev) => ({
      ...prev,
      groups: { ...prev.groups, ema: true },
      maLines: {
        ...prev.maLines,
        [slot]: { ...prev.maLines[slot], enabled: !prev.maLines[slot].enabled },
      },
    }));
  };

  const updateMa = (slot: MaSlot, patch: Partial<(typeof draft.maLines)[MaSlot]>) => {
    setDraft((prev) => ({
      ...prev,
      maLines: { ...prev.maLines, [slot]: { ...prev.maLines[slot], ...patch } },
    }));
  };

  const toggleBb = (key: BbKey) => {
    setDraft((prev) => ({
      ...prev,
      groups: { ...prev.groups, bb: true },
      bb: { ...prev.bb, [key]: !prev.bb[key] },
    }));
  };

  const toggleSupertrend = (key: SupertrendKey) => {
    setDraft((prev) => ({
      ...prev,
      groups: { ...prev.groups, supertrend: true },
      supertrend: { ...prev.supertrend, [key]: !prev.supertrend[key] },
    }));
  };

  const togglePivot = (label: PivotLabel) => {
    setDraft((prev) => ({
      ...prev,
      groups: { ...prev.groups, pivot: true },
      pivot: { ...prev.pivot, [label]: !prev.pivot[label] },
    }));
  };

  const toggleIchimoku = (key: IchimokuKey) => {
    setDraft((prev) => ({
      ...prev,
      groups: { ...prev.groups, ichimoku: true },
      ichimoku: { ...prev.ichimoku, [key]: !prev.ichimoku[key] },
    }));
  };

  const toggleGroupMaster = (key: keyof AwaisLayers['groups']) => {
    setDraft((prev) => {
      const enabled = !prev.groups[key];
      return setAwaisGroupEnabled(prev, key, enabled);
    });
  };

  if (tab === 'inputs') {
    return (
      <>
        <div className="flex items-center justify-between gap-2 px-2 py-1 border-b border-slate-100 dark:border-slate-800 mb-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Master toggles</p>
          <BulkToggleButtons onSelectAll={() => setGroup('all', true)} onSelectNone={() => setGroup('all', false)} />
        </div>
        {(['ema', 'bb', 'supertrend', 'pivot', 'ichimoku'] as const).map((key) => (
          <PanelCheckbox
            key={key}
            checked={draft.groups[key]}
            onChange={() => toggleGroupMaster(key)}
            color="#14b8a6"
            label={key === 'ema' ? 'Moving Averages' : key.charAt(0).toUpperCase() + key.slice(1)}
          />
        ))}
        <PanelSection
          title="MA Lines"
          bordered
          onSelectAll={() => setGroup('ema', true)}
          onSelectNone={() => setGroup('ema', false)}
        >
          {MA_SLOTS.map((slot) => {
            const cfg = draft.maLines[slot];
            return (
              <div key={slot} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800">
                <input
                  type="checkbox"
                  checked={cfg.enabled}
                  onChange={() => toggleMa(slot)}
                  className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 shrink-0"
                />
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cfg.color }} />
                <span className="text-[10px] font-bold text-slate-500 w-8 shrink-0">{maSlotLabel(slot)}</span>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={cfg.period}
                  onChange={(e) => updateMa(slot, { period: Math.max(1, Math.min(500, Number(e.target.value) || 1)) })}
                  className="w-14 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-semibold tabular-nums"
                />
                <select
                  value={cfg.type}
                  onChange={(e) => updateMa(slot, { type: e.target.value as MaType })}
                  className="flex-1 min-w-0 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-semibold"
                >
                  {MA_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </PanelSection>
      </>
    );
  }

  if (tab === 'style') {
    return (
      <PanelSection title="MA Colors">
        {MA_SLOTS.map((slot) => {
          const cfg = draft.maLines[slot];
          return (
            <label
              key={slot}
              className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer text-[11px] font-semibold text-slate-700 dark:text-slate-200"
            >
              <span className="w-16 shrink-0">{maSlotLabel(slot)}</span>
              <input
                type="color"
                value={cfg.color}
                onChange={(e) => updateMa(slot, { color: e.target.value })}
                className="w-8 h-6 rounded border border-slate-200 dark:border-slate-700 cursor-pointer"
              />
              <span className="text-[10px] text-slate-400 tabular-nums">{cfg.period} {cfg.type}</span>
            </label>
          );
        })}
      </PanelSection>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between gap-2 px-2 py-1 border-b border-slate-100 dark:border-slate-800 mb-1">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Visibility</p>
        <BulkToggleButtons onSelectAll={() => setGroup('all', true)} onSelectNone={() => setGroup('all', false)} />
      </div>

      <PanelSection
        title="MA / EMA Lines"
        onSelectAll={() => setGroup('ema', true)}
        onSelectNone={() => setGroup('ema', false)}
      >
        {MA_SLOTS.map((slot) => {
          const cfg = draft.maLines[slot];
          return (
            <PanelCheckbox
              key={slot}
              checked={cfg.enabled}
              onChange={() => toggleMa(slot)}
              color={cfg.color}
              label={`${cfg.period} ${cfg.type}`}
            />
          );
        })}
      </PanelSection>

      <PanelSection
        title="Bollinger Bands"
        bordered
        onSelectAll={() => setGroup('bb', true)}
        onSelectNone={() => setGroup('bb', false)}
      >
        {AWAIS_BB_OPTIONS.map((opt) => (
          <PanelCheckbox
            key={opt.key}
            checked={draft.bb[opt.key]}
            onChange={() => toggleBb(opt.key)}
            color={opt.color}
            label={opt.label}
          />
        ))}
      </PanelSection>

      <PanelSection
        title="Supertrend"
        bordered
        onSelectAll={() => setGroup('supertrend', true)}
        onSelectNone={() => setGroup('supertrend', false)}
      >
        {AWAIS_SUPERTREND_OPTIONS.map((opt) => (
          <PanelCheckbox
            key={opt.key}
            checked={draft.supertrend[opt.key]}
            onChange={() => toggleSupertrend(opt.key)}
            color={opt.color}
            label={opt.label}
          />
        ))}
      </PanelSection>

      <PanelSection
        title="Pivot Levels"
        bordered
        onSelectAll={() => setGroup('pivot', true)}
        onSelectNone={() => setGroup('pivot', false)}
      >
        {AWAIS_PIVOT_OPTIONS.map((opt) => (
          <PanelCheckbox
            key={opt.key}
            checked={draft.pivot[opt.key]}
            onChange={() => togglePivot(opt.key)}
            color={opt.color}
            label={opt.label}
          />
        ))}
      </PanelSection>

      <PanelSection
        title="Ichimoku Cloud"
        bordered
        onSelectAll={() => setGroup('ichimoku', true)}
        onSelectNone={() => setGroup('ichimoku', false)}
      >
        {AWAIS_ICHI_OPTIONS.map((opt) => (
          <PanelCheckbox
            key={opt.key}
            checked={draft.ichimoku[opt.key]}
            onChange={() => toggleIchimoku(opt.key)}
            color={opt.color}
            label={opt.label}
          />
        ))}
      </PanelSection>
    </>
  );
}

/** Toolbar button + settings modal for chart indicator toggles. */
export const IndicatorsPanel: React.FC<{
  layers: AwaisLayers;
  onApply: (layers: AwaisLayers) => void;
  disabled?: boolean;
}> = ({ layers, onApply, disabled }) => {
  const { active, total } = countAwaisActiveLayers(layers);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<PanelTab>('inputs');
  const [draft, setDraft] = useState(() => cloneAwaisLayers(layers));

  useEffect(() => {
    if (open) {
      setDraft(cloneAwaisLayers(layers));
      setTab('inputs');
    }
  }, [open, layers]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  const handleApply = () => {
    onApply(cloneAwaisLayers(draft));
    setOpen(false);
  };

  const tabs: { id: PanelTab; label: string }[] = [
    { id: 'inputs', label: 'Inputs' },
    { id: 'style', label: 'Style' },
    { id: 'visibility', label: 'Visibility' },
  ];

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-[11px] font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 shadow-sm hover:border-teal-300 dark:hover:border-teal-600 transition-colors disabled:opacity-40"
        title="Chart indicators"
      >
        <Layers size={14} className="text-teal-600" />
        Indicators
        <span className="text-[10px] font-bold text-slate-400 tabular-nums">
          {active}/{total}
        </span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Chart indicators">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
            aria-label="Close indicators"
            onClick={() => setOpen(false)}
          />
          <div className="relative w-full max-w-[380px] max-h-[min(560px,90vh)] bg-white dark:bg-slate-900 shadow-2xl rounded-2xl border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-800 shrink-0">
              <div className="flex items-center gap-2">
                <Layers size={16} className="text-teal-600" />
                <h4 className="text-sm font-black text-slate-900 dark:text-white">Indicators</h4>
                <span className="text-[10px] font-bold text-slate-400 tabular-nums">{active}/{total}</span>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex border-b border-slate-200 dark:border-slate-800 shrink-0">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`flex-1 px-3 py-2 text-[11px] font-bold transition-colors ${
                    tab === t.id
                      ? 'text-teal-600 border-b-2 border-teal-500 bg-teal-50/50 dark:bg-teal-500/10'
                      : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              <IndicatorsPanelContent draft={draft} setDraft={setDraft} tab={tab} />
            </div>

            <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-slate-200 dark:border-slate-800 shrink-0">
              <button
                type="button"
                onClick={() => setDraft(cloneAwaisLayers(DEFAULT_AWAIS_LAYERS))}
                className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Defaults
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleApply}
                  className="px-4 py-1.5 rounded-lg text-[11px] font-bold bg-teal-600 text-white hover:bg-teal-700 transition-colors"
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

/** @deprecated use IndicatorsPanel */
export const AwaisPanelDropdown = IndicatorsPanel;

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
  hidePivotLabels?: boolean;
}> = ({ data, layers, barCount, xAt, yScale, plotOffset, width, padRight, hidePivotLabels = false }) => {
  const { spanA, spanB } = ichimokuPlottedSpans(data.ichimoku, barCount);
  const bbUpper = data.bb.upper.slice(0, barCount);
  const bbMiddle = data.bb.middle.slice(0, barCount);
  const bbLower = data.bb.lower.slice(0, barCount);
  const stUp = data.supertrend.up.slice(0, barCount);
  const stDown = data.supertrend.down.slice(0, barCount);
  const showIchi = layers.groups.ichimoku;
  const showBb = layers.groups.bb;
  const showSt = layers.groups.supertrend;
  const showPivot = layers.groups.pivot;

  return (
    <>
      {showIchi && layers.ichimoku.cloud && (
        <path d={cloudFillPath(spanA, spanB, xAt, yScale)} fill="#43A047" fillOpacity={0.12} />
      )}
      {showIchi && layers.ichimoku.spanA && (
        <path d={segmentedPath(spanA, xAt, yScale)} fill="none" stroke="#A5D6A7" strokeWidth={1} />
      )}
      {showIchi && layers.ichimoku.spanB && (
        <path d={segmentedPath(spanB, xAt, yScale)} fill="none" stroke="#EF9A9A" strokeWidth={1} />
      )}
      {showIchi && layers.ichimoku.conversion && (
        <path
          d={segmentedPath(data.ichimoku.conversion.slice(0, barCount), xAt, yScale)}
          fill="none"
          stroke="#2962FF"
          strokeWidth={1}
        />
      )}
      {showIchi && layers.ichimoku.base && (
        <path
          d={segmentedPath(data.ichimoku.base.slice(0, barCount), xAt, yScale)}
          fill="none"
          stroke="#B71C1C"
          strokeWidth={1}
        />
      )}

      {showBb && layers.bb.fill && (
        <path d={cloudFillPath(bbUpper, bbLower, xAt, yScale)} fill="#f9f9f9" fillOpacity={0.35} />
      )}
      {showBb && layers.bb.upper && (
        <path
          d={segmentedPath(bbUpper, xAt, yScale)}
          fill="none"
          stroke="#2962FF"
          strokeWidth={1}
          strokeDasharray="4 3"
        />
      )}
      {showBb && layers.bb.middle && (
        <path d={segmentedPath(bbMiddle, xAt, yScale)} fill="none" stroke="#100c09" strokeWidth={1} />
      )}
      {showBb && layers.bb.lower && (
        <path
          d={segmentedPath(bbLower, xAt, yScale)}
          fill="none"
          stroke="#2962FF"
          strokeWidth={1}
          strokeDasharray="4 3"
        />
      )}

      {data.maLines
        .filter((ma) => isMaSeriesVisible(layers, ma.slot))
        .map((ma) => (
          <path
            key={ma.slot}
            d={segmentedPath(ma.values.slice(0, barCount), xAt, yScale)}
            fill="none"
            stroke={ma.color}
            strokeWidth={2}
          />
        ))}

      {showSt && layers.supertrend.up && (
        <path d={segmentedPath(stUp, xAt, yScale)} fill="none" stroke="#22c55e" strokeWidth={2} />
      )}
      {showSt && layers.supertrend.down && (
        <path d={segmentedPath(stDown, xAt, yScale)} fill="none" stroke="#ef4444" strokeWidth={2} />
      )}

      {showPivot &&
        data.pivots
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
              {!hidePivotLabels && (
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
              )}
            </g>
          ))}
    </>
  );
};

export const AwaisPivotLabels: React.FC<{
  data: AwaisOverlayData;
  layers: AwaisLayers;
  yScale: (v: number) => number;
  width: number;
  padRight: number;
}> = ({ data, layers, yScale, width, padRight }) => {
  if (!layers.groups.pivot) return null;
  return (
    <>
      {data.pivots
        .filter((pv) => layers.pivot[pv.label as PivotLabel])
        .map((pv) => {
          const y = yScale(pv.value);
          return (
            <text
              key={pv.label}
              x={width - padRight - 4}
              y={y - 3}
              textAnchor="end"
              fontSize={9}
              fill="#FB8C00"
              fontWeight={700}
            >
              {pv.label} {pv.value.toFixed(2)}
            </text>
          );
        })}
    </>
  );
};
