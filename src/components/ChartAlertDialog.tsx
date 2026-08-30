import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, X } from 'lucide-react';
import { getSession } from '../services/auth';
import { SetAlert } from './SetAlert';

interface Props {
  symbol: string;
  /** Price the user clicked on the chart axis; pre-fills the target field. */
  price: number;
  /** Latest traded price, used to derive above/below direction. */
  currentPrice: number;
  onClose: () => void;
  onSaved: (message: string) => void;
}

const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const ChartAlertDialog: React.FC<Props> = ({ symbol, price, currentPrice, onClose, onSaved }) => {
  const [canSaveAlerts, setCanSaveAlerts] = useState(false);
  const [target, setTarget] = useState<number | ''>(price);

  useEffect(() => {
    let alive = true;
    getSession()
      .then((s) => { if (alive) setCanSaveAlerts(!!s); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const effective = typeof target === 'number' && Number.isFinite(target) && target > 0 ? target : price;
  const above = currentPrice > 0 && effective > currentPrice;
  const distancePct = currentPrice > 0 ? ((effective - currentPrice) / currentPrice) * 100 : null;

  // Portalled to <body> so chart pointer-capture can't swallow clicks inside the dialog.
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-500/10 rounded-2xl flex items-center justify-center border border-indigo-100 dark:border-indigo-500/20 shrink-0">
              <Bell size={18} className="text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h4 className="text-lg font-display font-black text-slate-900 dark:text-white tracking-tight leading-tight">
                Set Price Alert
              </h4>
              <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-0.5">
                {symbol} · last Rs. {fmt(currentPrice)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mb-4 flex items-center gap-2 text-[11px] font-bold">
          <span
            className={`px-2.5 py-1 rounded-lg border ${
              above
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-500/10 dark:border-emerald-500/25 dark:text-emerald-400'
                : 'bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-500/10 dark:border-rose-500/25 dark:text-rose-400'
            }`}
          >
            {above ? 'Above — target' : 'Below — stop loss'}
          </span>
          {distancePct != null && (
            <span className="text-slate-500 dark:text-slate-400 tabular-nums">
              {distancePct >= 0 ? '+' : ''}{distancePct.toFixed(2)}% from last price
            </span>
          )}
        </div>

        <SetAlert
          ticker={symbol}
          currentPrice={currentPrice}
          canSaveAlerts={canSaveAlerts}
          initialTarget={price}
          variant="bare"
          onTargetChange={setTarget}
          onSaved={(msg) => {
            onSaved(msg);
            setTimeout(onClose, 900);
          }}
        />

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
