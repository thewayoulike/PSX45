import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { todayPK } from '../utils/dates';
import {
  buildCorporateTransaction,
  previewBonus,
  previewRights,
  previewSplit,
  type PositionPreview,
} from '../utils/corporateActions';
import type { CorporateActionDraft } from './corporateActionDraft';

const rs = (n: number) => `Rs. ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const shares = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 4 });

export const CorporateActionModal: React.FC<{
  draft: CorporateActionDraft;
  onClose: () => void;
  onConfirm: (tx: ReturnType<typeof buildCorporateTransaction>) => void;
}> = ({ draft, onClose, onConfirm }) => {
  const [kind, setKind] = useState(draft.kind || 'bonus');
  const [bonusPercent, setBonusPercent] = useState(draft.bonusPercent && draft.bonusPercent > 0 ? String(draft.bonusPercent) : '10');
  const [ratio, setRatio] = useState('2');
  const [rightsShares, setRightsShares] = useState('');
  const [pricePaid, setPricePaid] = useState('');
  const [date, setDate] = useState(todayPK());

  const preview = useMemo(() => {
    try {
      if (draft.shares <= 0) return { error: 'You have no shares of this stock in this portfolio.' };
      if (kind === 'bonus') return { value: previewBonus(draft.shares, draft.cost, Number(bonusPercent)) };
      if (kind === 'split') return { value: previewSplit(draft.shares, draft.cost, Number(ratio)) };
      return { value: previewRights(draft.shares, draft.cost, Number(rightsShares), Number(pricePaid)) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Check the numbers.' };
    }
  }, [bonusPercent, draft.cost, draft.shares, kind, pricePaid, ratio, rightsShares]);

  const save = () => {
    if (!('value' in preview) || !preview.value) return;
    onConfirm(buildCorporateTransaction({
      kind,
      ticker: draft.ticker,
      date,
      broker: draft.broker,
      brokerId: draft.brokerId,
      sharesHeld: draft.shares,
      totalCost: draft.cost,
      bonusPercent: Number(bonusPercent),
      newSharesForEachOld: Number(ratio),
      rightsShares: Number(rightsShares),
      pricePaid: Number(pricePaid),
    }));
  };

  const ready = 'value' in preview && !!preview.value;

  return (
    <div className="mobile-dialog-overlay mobile-dialog-full fixed inset-0 bg-slate-900/40 backdrop-blur-md z-[60] flex items-start justify-center p-4 pt-16 md:pt-24">
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/70 dark:border-slate-800 shadow-xl">
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
          <div>
            <h3 className="font-display font-black text-lg text-slate-900 dark:text-white">Bonus, split, or rights</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {draft.ticker}{draft.broker ? ` · ${draft.broker}` : ''} · {shares(draft.shares)} shares · cost {rs(draft.cost)}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 pb-5 space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {(['bonus', 'split', 'rights'] as const).map(option => (
              <button
                key={option}
                type="button"
                onClick={() => setKind(option)}
                className={`py-2 rounded-xl text-xs font-bold capitalize ${kind === option ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}
              >
                {option}
              </button>
            ))}
          </div>

          {kind === 'bonus' && (
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">
              Bonus percent
              <input value={bonusPercent} onChange={e => setBonusPercent(e.target.value)} type="number" min="0" step="any" className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm font-bold text-slate-800 dark:text-slate-100" />
            </label>
          )}
          {kind === 'split' && (
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">
              New shares for each share you hold
              <input value={ratio} onChange={e => setRatio(e.target.value)} type="number" min="1" step="any" className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm font-bold text-slate-800 dark:text-slate-100" />
            </label>
          )}
          {kind === 'rights' && (
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">
                Shares you paid for
                <input value={rightsShares} onChange={e => setRightsShares(e.target.value)} type="number" min="0" step="any" className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm font-bold text-slate-800 dark:text-slate-100" />
              </label>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">
                Price paid
                <input value={pricePaid} onChange={e => setPricePaid(e.target.value)} type="number" min="0" step="any" className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm font-bold text-slate-800 dark:text-slate-100" />
              </label>
            </div>
          )}

          <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">
            Date
            <input value={date} onChange={e => setDate(e.target.value)} type="date" className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm font-bold text-slate-800 dark:text-slate-100" />
          </label>

          {'error' in preview ? (
            <p className="text-sm text-rose-600 dark:text-rose-400">{preview.error}</p>
          ) : (
            <PreviewCard preview={preview.value} />
          )}

          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {kind === 'rights'
              ? 'Only the shares you actually paid for are added. Cash goes down by that amount. Nothing is saved until you confirm.'
              : 'Total cost stays the same, so the average changes. Cash does not move. Nothing is saved until you confirm.'}
          </p>

          <button
            type="button"
            disabled={!ready}
            onClick={save}
            className="w-full py-3 rounded-2xl bg-emerald-600 text-white text-sm font-bold disabled:opacity-40"
          >
            Confirm and save
          </button>
        </div>
      </div>
    </div>
  );
};

const PreviewCard: React.FC<{ preview: PositionPreview }> = ({ preview }) => (
  <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-4 grid grid-cols-2 gap-3 text-sm">
    <Stat label="Shares" value={`${shares(preview.sharesNow)} → ${shares(preview.sharesAfter)}`} />
    <Stat label="Added" value={shares(preview.sharesAdded)} />
    <Stat label="Total cost" value={rs(preview.costAfter)} />
    <Stat label="Average" value={`${rs(preview.avgNow)} → ${rs(preview.avgAfter)}`} />
    <Stat label="Cash change" value={preview.cashChange === 0 ? 'None' : rs(preview.cashChange)} />
  </div>
);

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</div>
    <div className="font-bold tabular-nums text-slate-800 dark:text-slate-100">{value}</div>
  </div>
);
