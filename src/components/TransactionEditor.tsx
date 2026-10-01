import React, { useEffect, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { loadTransactionForm } from './transactionFormLoader';
import type { TransactionFormProps } from './TransactionForm';

/** A failed tool download must not unmount the portfolio or interrupt its pending backup. */
export function TransactionEditor(props: TransactionFormProps) {
  const [Form, setForm] = useState<typeof import('./TransactionForm')['TransactionForm'] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!props.isOpen) return;
    let active = true;
    setFailed(false);
    void loadTransactionForm().then(
      module => { if (active) setForm(() => module.TransactionForm); },
      () => { if (active) setFailed(true); },
    );
    return () => { active = false; };
  }, [attempt, props.isOpen]);
  useEffect(() => { if (props.isOpen && !Form) dialog.current?.showModal(); }, [props.isOpen, Form]);
  if (!props.isOpen) return null;
  if (Form) return <Form {...props} />;
  return <dialog ref={dialog} aria-labelledby="transaction-loader-title" onCancel={props.onClose}
    className="w-[calc(100%_-_2rem)] max-w-md rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-xl backdrop:bg-slate-950/40 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
    <div className="flex items-center justify-between gap-3"><h2 id="transaction-loader-title" className="text-lg font-bold">{failed ? 'Add Transaction could not open' : 'Opening Add Transaction…'}</h2><button type="button" onClick={props.onClose} aria-label="Close transaction panel" className="p-3 rounded-lg"><X size={20} /></button></div>
    {failed ? <><p role="alert" className="mt-3 text-sm leading-relaxed">The transaction form could not download. Your portfolio remains open, and your saved records and pending backup have not been cleared.</p><p className="mt-3 text-sm leading-relaxed text-slate-500 dark:text-slate-400">Check your connection and retry. If it still fails, close this panel and reopen PSX Tracker after your backup finishes.</p><div className="mt-5 flex gap-3"><button type="button" onClick={() => { setFailed(false); setAttempt(value => value + 1); }} className="rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white">Retry opening</button><button type="button" onClick={props.onClose} className="rounded-xl border border-slate-300 dark:border-slate-600 px-4 py-3">Close</button></div></> : <p role="status" className="mt-4 flex items-center gap-2 text-sm"><Loader2 size={18} className="animate-spin" />Loading the form. You can close this panel while it loads.</p>}
  </dialog>;
}
