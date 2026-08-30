import React from 'react';

export interface PaneLegendItem {
  label: string;
  color?: string;
  value?: string;
}

/** TradingView-style pane legend: indicator name plus live values, pinned top-left of the plot. */
export const PaneLegend: React.FC<{ items: PaneLegendItem[] }> = ({ items }) => (
  <div className="absolute top-0.5 left-2 z-10 pointer-events-none flex items-center gap-2.5 text-[11px] leading-none tabular-nums">
    {items.map((it, i) => (
      <span key={i} className="flex items-center gap-1">
        <span className="font-semibold text-slate-500 dark:text-slate-400">{it.label}</span>
        {it.value != null && (
          <span className="font-semibold" style={{ color: it.color }}>{it.value}</span>
        )}
      </span>
    ))}
  </div>
);
