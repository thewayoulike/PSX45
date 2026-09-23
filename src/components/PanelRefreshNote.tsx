import React from 'react';

export function PanelRefreshNote({ updating, failed }: { updating: boolean; failed: boolean }) {
  if (updating) return <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Updating…</span>;
  if (failed) return <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400">Couldn't refresh</span>;
  return null;
}
