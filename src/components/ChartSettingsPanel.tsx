import React, { useEffect, useState } from 'react';
import { Layers, X } from 'lucide-react';
import { IndicatorsPanelContent } from './AwaisChartOverlays';
import { AutoTrendlinesPanelContent } from './AutoTrendlinesPanel';
import { MomentumPanelContent } from './MomentumPanel';
import {
  AwaisLayers,
  DEFAULT_AWAIS_LAYERS,
  cloneAwaisLayers,
} from '../utils/awaisIndicators';
import {
  DEFAULT_MOMENTUM_CONFIG,
  MomentumConfig,
  cloneMomentumConfig,
} from '../utils/momentumIndicators';
import {
  AutoTrendlineSettings,
  DEFAULT_AUTO_TRENDLINES,
  cloneAutoTrendlineSettings,
} from '../utils/autoTrendlines';
import {
  ChartExtras,
  DEFAULT_CHART_EXTRAS,
  applyEmaTrioPreset,
  cloneChartExtras,
} from '../utils/chartExtras';
import type { ChartLayerToggles } from '../services/chartSettingsStorage';

type SettingsTab = 'overlays' | 'trendlines' | 'momentum' | 'structure' | 'volume' | 'signals';
type OverlayPanelTab = 'inputs' | 'style' | 'visibility';
type MomentumPanelTab = 'inputs' | 'style';

const DEFAULT_LAYERS: ChartLayerToggles = { volume: true, momentum: true };

const MAIN_TABS: { id: SettingsTab; label: string }[] = [
  { id: 'overlays', label: 'Overlays' },
  { id: 'trendlines', label: 'Trendlines' },
  { id: 'momentum', label: 'Momentum' },
  { id: 'structure', label: 'Structure' },
  { id: 'volume', label: 'Volume' },
  { id: 'signals', label: 'Signals' },
];

const OVERLAY_TABS: { id: OverlayPanelTab; label: string }[] = [
  { id: 'inputs', label: 'Inputs' },
  { id: 'style', label: 'Style' },
  { id: 'visibility', label: 'Visibility' },
];

const MOMENTUM_TABS: { id: MomentumPanelTab; label: string }[] = [
  { id: 'inputs', label: 'Inputs' },
  { id: 'style', label: 'Style' },
];

const STRUCTURE_OPTIONS: { key: keyof ChartExtras; label: string }[] = [
  { key: 'swingMarkers', label: 'Swing highs/lows' },
  { key: 'marketStructure', label: 'Market structure HH/HL/LH/LL' },
  { key: 'consolidationZones', label: 'Consolidation zones' },
];

const VOLUME_OPTIONS: { key: keyof ChartExtras; label: string; hint?: string }[] = [
  { key: 'volumeSpike', label: 'Volume spike' },
  {
    key: 'volumeConfirmBreaks',
    label: 'Volume confirmation on breaks',
    hint: 'Dims breakout arrows without a volume spike. Also turns on breakout markers.',
  },
];

const SIGNAL_OPTIONS: { key: keyof ChartExtras; label: string; hint?: string }[] = [
  {
    key: 'breakoutMarkers',
    label: 'Breakout/breakdown markers',
    hint: 'Green/red arrows when price closes through auto trendlines',
  },
  { key: 'rsiDivergence', label: 'RSI divergence', hint: 'Requires RSI enabled in Momentum' },
  { key: 'atrPane', label: 'ATR pane' },
  { key: 'vwap', label: 'VWAP' },
  { key: 'candlePatterns', label: 'Candlestick patterns', hint: 'Hover D/H/E markers for names' },
  { key: 'emaTrio', label: 'EMA 20/50/200 preset' },
];

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
      {children}
    </p>
  );
}

function OptionCheckbox({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex items-start gap-2.5 px-2 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="mt-0.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
      />
      <span className="min-w-0">
        <span className="block text-[11px] font-semibold text-slate-700 dark:text-slate-200">{label}</span>
        {hint && <span className="block text-[10px] text-slate-400 leading-snug">{hint}</span>}
      </span>
    </label>
  );
}

function SubTabs<T extends string>({
  tabs,
  active,
  onSelect,
  accent,
}: {
  tabs: { id: T; label: string }[];
  active: T;
  onSelect: (id: T) => void;
  accent: 'teal' | 'purple';
}) {
  return (
    <div className="flex border-b border-slate-200 dark:border-slate-800 shrink-0">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onSelect(t.id)}
          className={`flex-1 px-3 py-2 text-[11px] font-bold transition-colors ${
            active === t.id
              ? accent === 'teal'
                ? 'text-teal-600 border-b-2 border-teal-500 bg-teal-50/50 dark:bg-teal-500/10'
                : 'text-purple-600 border-b-2 border-purple-500 bg-purple-50/50 dark:bg-purple-500/10'
              : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export const ChartSettingsPanel: React.FC<{
  disabled?: boolean;
  rangeLabel?: string;
  layers: ChartLayerToggles;
  awaisLayers: AwaisLayers;
  momentumConfig: MomentumConfig;
  autoTrendlines: AutoTrendlineSettings;
  chartExtras: ChartExtras;
  onApply: (next: {
    layers: ChartLayerToggles;
    awaisLayers: AwaisLayers;
    momentumConfig: MomentumConfig;
    autoTrendlines: AutoTrendlineSettings;
    chartExtras: ChartExtras;
  }) => void;
}> = ({
  disabled,
  rangeLabel,
  layers,
  awaisLayers,
  momentumConfig,
  autoTrendlines,
  chartExtras,
  onApply,
}) => {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<SettingsTab>('overlays');
  const [overlayTab, setOverlayTab] = useState<OverlayPanelTab>('inputs');
  const [momentumTab, setMomentumTab] = useState<MomentumPanelTab>('inputs');
  const [draftLayers, setDraftLayers] = useState<ChartLayerToggles>(() => ({ ...layers }));
  const [draftAwais, setDraftAwais] = useState(() => cloneAwaisLayers(awaisLayers));
  const [draftMomentum, setDraftMomentum] = useState(() => cloneMomentumConfig(momentumConfig));
  const [draftAutoTrendlines, setDraftAutoTrendlines] = useState(() =>
    cloneAutoTrendlineSettings(autoTrendlines)
  );
  const [draftExtras, setDraftExtras] = useState(() => cloneChartExtras(chartExtras));

  useEffect(() => {
    if (!open) return;
    setDraftLayers({ ...layers });
    setDraftAwais(cloneAwaisLayers(awaisLayers));
    setDraftMomentum(cloneMomentumConfig(momentumConfig));
    setDraftAutoTrendlines(cloneAutoTrendlineSettings(autoTrendlines));
    setDraftExtras(cloneChartExtras(chartExtras));
    setTab('overlays');
    setOverlayTab('inputs');
    setMomentumTab('inputs');
  }, [open, layers, awaisLayers, momentumConfig, autoTrendlines, chartExtras]);

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

  const patchAutoTrendlines = (patch: Partial<AutoTrendlineSettings>) => {
    setDraftAutoTrendlines((prev) => ({ ...prev, ...patch }));
  };

  const toggleExtra = (key: keyof ChartExtras) => {
    setDraftExtras((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const resetDefaults = () => {
    setDraftLayers({ ...DEFAULT_LAYERS });
    setDraftAwais(cloneAwaisLayers(DEFAULT_AWAIS_LAYERS));
    setDraftMomentum(cloneMomentumConfig(DEFAULT_MOMENTUM_CONFIG));
    setDraftAutoTrendlines(cloneAutoTrendlineSettings(DEFAULT_AUTO_TRENDLINES));
    setDraftExtras(cloneChartExtras(DEFAULT_CHART_EXTRAS));
  };

  const applyDraft = () => {
    const nextExtras = cloneChartExtras(draftExtras);
    const nextAwais = nextExtras.emaTrio ? applyEmaTrioPreset(draftAwais) : cloneAwaisLayers(draftAwais);
    onApply({
      layers: { ...draftLayers },
      awaisLayers: nextAwais,
      momentumConfig: cloneMomentumConfig(draftMomentum),
      autoTrendlines: cloneAutoTrendlineSettings(draftAutoTrendlines),
      chartExtras: nextExtras,
    });
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-[11px] font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 shadow-sm hover:border-sky-300 dark:hover:border-sky-600 transition-colors disabled:opacity-40"
        title="Chart settings"
      >
        <Layers size={14} className="text-sky-600" />
        Chart
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Chart settings"
        >
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
            aria-label="Close chart settings"
            onClick={() => setOpen(false)}
          />

          <div className="relative w-full max-w-[460px] max-h-[min(680px,90vh)] bg-white dark:bg-slate-900 shadow-2xl rounded-2xl border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-800 shrink-0">
              <div className="flex items-center gap-2">
                <Layers size={16} className="text-sky-600" />
                <div>
                  <h4 className="text-sm font-black text-slate-900 dark:text-white">Chart Settings</h4>
                  {rangeLabel && (
                    <p className="text-[10px] font-bold text-slate-400">{rangeLabel}</p>
                  )}
                </div>
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

            <div className="flex overflow-x-auto border-b border-slate-200 dark:border-slate-800 shrink-0">
              {MAIN_TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`px-3 py-2 text-[11px] font-bold whitespace-nowrap transition-colors ${
                    tab === t.id
                      ? 'text-sky-600 border-b-2 border-sky-500 bg-sky-50/50 dark:bg-sky-500/10'
                      : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {tab === 'overlays' && (
              <SubTabs tabs={OVERLAY_TABS} active={overlayTab} onSelect={setOverlayTab} accent="teal" />
            )}
            {tab === 'momentum' && (
              <SubTabs tabs={MOMENTUM_TABS} active={momentumTab} onSelect={setMomentumTab} accent="purple" />
            )}

            <div className="flex-1 overflow-y-auto p-2">
              {tab === 'overlays' && (
                <IndicatorsPanelContent draft={draftAwais} setDraft={setDraftAwais} tab={overlayTab} />
              )}
              {tab === 'trendlines' && (
                <AutoTrendlinesPanelContent draft={draftAutoTrendlines} patch={patchAutoTrendlines} />
              )}
              {tab === 'momentum' && (
                <MomentumPanelContent draft={draftMomentum} setDraft={setDraftMomentum} tab={momentumTab} />
              )}
              {tab === 'structure' && (
                <div className="space-y-1">
                  <SectionTitle>Structure</SectionTitle>
                  {STRUCTURE_OPTIONS.map((opt) => (
                    <OptionCheckbox
                      key={opt.key}
                      checked={draftExtras[opt.key]}
                      onChange={() => toggleExtra(opt.key)}
                      label={opt.label}
                    />
                  ))}
                </div>
              )}
              {tab === 'volume' && (
                <div className="space-y-1">
                  <SectionTitle>Volume</SectionTitle>
                  <OptionCheckbox
                    checked={draftLayers.volume}
                    onChange={() => setDraftLayers((prev) => ({ ...prev, volume: !prev.volume }))}
                    label="Show volume panel"
                    hint="Controls the existing volume layer when these settings are applied."
                  />
                  {VOLUME_OPTIONS.map((opt) => (
                    <OptionCheckbox
                      key={opt.key}
                      checked={draftExtras[opt.key]}
                      onChange={() => toggleExtra(opt.key)}
                      label={opt.label}
                      hint={opt.hint}
                    />
                  ))}
                </div>
              )}
              {tab === 'signals' && (
                <div className="space-y-1">
                  <SectionTitle>Signals</SectionTitle>
                  {SIGNAL_OPTIONS.map((opt) => (
                    <OptionCheckbox
                      key={opt.key}
                      checked={draftExtras[opt.key]}
                      onChange={() => toggleExtra(opt.key)}
                      label={opt.label}
                      hint={opt.hint}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-slate-200 dark:border-slate-800 shrink-0">
              <button
                type="button"
                onClick={resetDefaults}
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
                  onClick={applyDraft}
                  className="px-4 py-1.5 rounded-lg text-[11px] font-bold bg-sky-600 text-white hover:bg-sky-700 transition-colors"
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
