import React from 'react';
import { CheckCircle2, DownloadCloud, FileText, Loader2, Paperclip } from 'lucide-react';
import type { EmailImportStatus } from '../utils/emailImportHistory';

export function EmailAttachmentButton({ filename, size, status, disabled, onSelect, textSource = false }: {
  filename: string; size?: number; status?: EmailImportStatus; disabled: boolean; onSelect: () => void; textSource?: boolean;
}) {
  const complete = status?.state === 'complete';
  return (
    <button type="button" onClick={onSelect} disabled={disabled}
      className="w-full flex flex-wrap items-center justify-between gap-x-3 gap-y-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 hover:border-emerald-500 hover:bg-emerald-50/50 dark:hover:bg-emerald-500/10 p-3 rounded-xl group transition-colors text-left shadow-sm disabled:opacity-60">
      <span className="flex flex-1 items-center gap-2 min-w-0 basis-48">
        {textSource ? <FileText size={16} className="text-slate-400 shrink-0" /> : <Paperclip size={16} className="text-slate-400 shrink-0" />}
        <span className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate" title={filename}>{filename}</span>
        {size !== undefined && <span className="text-[10px] text-slate-400 shrink-0">({Math.round(size / 1024)} KB)</span>}
      </span>
      <span className="flex items-center gap-2 shrink-0">
        <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold ${complete
          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300'
          : status ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300'
          : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300'}`}>
          {complete && <CheckCircle2 size={12} aria-hidden="true" />}
          {complete ? 'Already added' : status ? `Partly added · ${status.added}/${status.total} rows` : 'Not tracked'}
        </span>
        {disabled ? <Loader2 size={14} className="animate-spin text-slate-400" aria-hidden="true" /> : <DownloadCloud size={14} className="text-emerald-600 dark:text-emerald-400" aria-hidden="true" />}
      </span>
    </button>
  );
}
