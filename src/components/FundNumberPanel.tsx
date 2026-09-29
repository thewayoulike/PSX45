import React from 'react';
import { HoverPopover } from './HoverPopover';

export const ExplainHint: React.FC<{
  label: string;
  title: string;
  total: string;
  detail?: string;
  lines: { label: string; amount: string; note?: string }[];
}> = ({ label, title, total, detail, lines }) => (
  <HoverPopover
    label={label}
    align="start"
    triggerClassName="explain-hint inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-[11px] font-black normal-case leading-none tracking-normal text-slate-500 hover:border-emerald-500 hover:text-emerald-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-emerald-400"
    panelClassName="z-[200] w-80 max-w-[calc(100vw-1.5rem)] max-h-[min(24rem,70vh)] overflow-y-auto overscroll-contain custom-scrollbar rounded-2xl border border-slate-200/80 bg-white p-4 text-left normal-case tracking-normal shadow-xl dark:border-slate-700 dark:bg-slate-900"
    panel={(
      <>
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{title}</div>
        <div className="font-display font-black text-lg tabular-nums text-slate-900 dark:text-white">{total}</div>
        {detail && <div className="mt-0.5 text-[11px] text-slate-500">{detail}</div>}
        <div className="mt-3 space-y-2">
          {lines.length === 0 && <p className="text-xs text-slate-500">Nothing in this figure yet.</p>}
          {lines.map((line, index) => (
            <div key={`${line.label}-${index}`} className="text-xs">
              <div className="flex items-start justify-between gap-3">
                <span className="text-slate-600 dark:text-slate-300">{line.label}</span>
                <span className="text-right font-bold tabular-nums text-slate-800 dark:text-slate-100">{line.amount}</span>
              </div>
              {line.note && <p className="mt-0.5 text-[10px] text-slate-400">{line.note}</p>}
            </div>
          ))}
        </div>
      </>
    )}
  >
    ?
  </HoverPopover>
);
