import React, { useEffect, useState } from 'react';
import { Spline, X } from 'lucide-react';
import {
  AutoTrendlineSettings,
  DEFAULT_AUTO_TRENDLINES,
  cloneAutoTrendlineSettings,
} from '../utils/autoTrendlines';

export function AutoTrendlinesPanelContent({
  draft,
  patch,
}: {
  draft: AutoTrendlineSettings;
  patch: (p: Partial<AutoTrendlineSettings>) => void;
}) {
  return (
    <div className="p-3 space-y-3 max-h-[min(520px,70vh)] overflow-y-auto">
      <label className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
        <input
          type="checkbox"
          checked={draft.enabled}
          onChange={() => patch({ enabled: !draft.enabled })}
          className="rounded border-slate-300 text-slate-900 focus:ring-slate-500"
        />
        <span className="text-[12px] font-bold text-slate-800 dark:text-slate-100">Enable auto trendlines</span>
      </label>

      <div className="border-t border-slate-100 dark:border-slate-800 pt-2 space-y-1">
        <p className="px-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Lines</p>
        <label className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.showResistance}
            onChange={() => patch({ showResistance: !draft.showResistance })}
            className="rounded border-slate-300"
          />
          <span className="w-3 h-3 rounded-sm border border-slate-300" style={{ background: draft.resistanceColor }} />
          <span className="text-[11px] font-semibold flex-1">Resistance</span>
          <input
            type="color"
            value={draft.resistanceColor}
            onChange={(e) => patch({ resistanceColor: e.target.value })}
            className="w-8 h-6 rounded border border-slate-200 dark:border-slate-700 cursor-pointer"
            title="Resistance color"
          />
        </label>
        <label className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.showSupport}
            onChange={() => patch({ showSupport: !draft.showSupport })}
            className="rounded border-slate-300"
          />
          <span className="w-3 h-3 rounded-sm border border-slate-300" style={{ background: draft.supportColor }} />
          <span className="text-[11px] font-semibold flex-1">Support</span>
          <input
            type="color"
            value={draft.supportColor}
            onChange={(e) => patch({ supportColor: e.target.value })}
            className="w-8 h-6 rounded border border-slate-200 dark:border-slate-700 cursor-pointer"
            title="Support color"
          />
        </label>
      </div>

      <div className="border-t border-slate-100 dark:border-slate-800 pt-2 space-y-2">
        <p className="px-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Inputs</p>
        <label className="flex items-center justify-between gap-3 px-2 py-1.5">
          <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">Pivot strength</span>
          <input
            type="number"
            min={2}
            max={50}
            value={draft.pivotLength}
            onChange={(e) =>
              patch({ pivotLength: Math.max(2, Math.min(50, Number(e.target.value) || 2)) })
            }
            className="w-16 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-bold tabular-nums"
          />
        </label>
        <label className="flex items-center justify-between gap-3 px-2 py-1.5">
          <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">Min bars between</span>
          <input
            type="number"
            min={5}
            max={200}
            value={draft.minBarsBetween}
            onChange={(e) =>
              patch({ minBarsBetween: Math.max(5, Math.min(200, Number(e.target.value) || 5)) })
            }
            className="w-16 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-bold tabular-nums"
            title="Prefer longer structural swing pairs"
          />
        </label>
        <label className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.extendRight}
            onChange={() => patch({ extendRight: !draft.extendRight })}
            className="rounded border-slate-300"
          />
          <span className="text-[11px] font-semibold">Extend lines right</span>
        </label>
        <label className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.breakAndRebuild}
            onChange={() => patch({ breakAndRebuild: !draft.breakAndRebuild })}
            className="rounded border-slate-300"
          />
          <span className="text-[11px] font-semibold">Break &amp; rebuild</span>
        </label>
        <p className="px-2 text-[10px] text-slate-400 leading-snug">
          Draws longer structural lines (not just the last two swings). When price closes through a line, rebuilds from an earlier unbroken pair.
        </p>
      </div>
    </div>
  );
}

export const AutoTrendlinesPanel: React.FC<{
  settings: AutoTrendlineSettings;
  onApply: (next: AutoTrendlineSettings) => void;
  disabled?: boolean;
}> = ({ settings, onApply, disabled }) => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => cloneAutoTrendlineSettings(settings));

  useEffect(() => {
    if (open) setDraft(cloneAutoTrendlineSettings(settings));
  }, [open, settings]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const patch = (p: Partial<AutoTrendlineSettings>) => setDraft((d) => ({ ...d, ...p }));

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-[11px] font-bold border shadow-sm transition-colors disabled:opacity-40 ${
          settings.enabled
            ? 'border-slate-800 bg-slate-900 text-white dark:border-slate-200 dark:bg-white dark:text-slate-900'
            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:border-slate-400'
        }`}
        title="Auto trendlines"
      >
        <Spline size={14} />
        Trendlines
        {settings.enabled && (
          <span className="text-[9px] font-black uppercase tracking-wider opacity-80">On</span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
            aria-label="Close"
            onClick={() => setOpen(false)}
          />
          <div className="relative w-full max-w-[360px] bg-white dark:bg-slate-900 shadow-2xl rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Spline size={16} className="text-slate-800 dark:text-slate-100" />
                <h4 className="text-sm font-black text-slate-900 dark:text-white">Auto Trendlines</h4>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            <AutoTrendlinesPanelContent draft={draft} patch={patch} />

            <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setDraft(cloneAutoTrendlineSettings(DEFAULT_AUTO_TRENDLINES))}
                className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Defaults
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onApply(cloneAutoTrendlineSettings(draft));
                    setOpen(false);
                  }}
                  className="px-4 py-1.5 rounded-lg text-[11px] font-bold bg-slate-900 text-white dark:bg-white dark:text-slate-900 hover:opacity-90"
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
