import React, { useState } from 'react';
import { explainFundCash, explainFundValue, explainNetInvested, type CashExplainTx } from '../utils/fundNumberExplain';

const rs = (n: number) => `Rs. ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const FundNumberPanel: React.FC<{
  holdings: { name: string; units: number; avgNav: number; nav: number }[];
  transactions: CashExplainTx[];
  fundValue: number;
  cash: number;
  netInvested: number;
}> = ({ holdings, transactions, fundValue, cash, netInvested }) => {
  const [open, setOpen] = useState(true);
  const value = explainFundValue(holdings);
  const cashLines = explainFundCash(transactions);
  const invested = explainNetInvested(transactions, netInvested);
  const valueDrift = fundValue - value.total;
  const cashDrift = cash - cashLines.total;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 shadow-card dark:shadow-card-dark p-5">
      <button type="button" onClick={() => setOpen(v => !v)} className="w-full flex items-center justify-between gap-3 text-left">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Funds</div>
          <h3 className="font-display font-black text-lg text-slate-900 dark:text-white">Why this number</h3>
        </div>
        <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <Block title="Fund value" total={rs(fundValue)} detail={`Cost ${rs(value.cost)} · gain ${rs(value.gain)}`}>
            {value.lines.map(line => (
              <Row key={line.label} label={line.label} amount={rs(line.amount)} note={line.note} />
            ))}
            {Math.abs(valueDrift) > 0.5 && <Row label="Rounding" amount={rs(valueDrift)} />}
          </Block>
          <Block title="Cash balance" total={rs(cash)}>
            {cashLines.lines.map(line => (
              <Row
                key={line.label}
                label={line.label}
                amount={line.countsInTotal ? rs(line.amount) : 'Not cash'}
                note={line.note}
              />
            ))}
            {Math.abs(cashDrift) > 0.5 && <Row label="Other cash movements" amount={rs(cashDrift)} />}
          </Block>
          <Block title="Net invested" total={rs(invested.total)}>
            {invested.lines.map(line => (
              <Row key={line.label} label={line.label} amount={rs(line.amount)} note={line.note} />
            ))}
          </Block>
        </div>
      )}
    </div>
  );
};

const Block: React.FC<{ title: string; total: string; detail?: string; children: React.ReactNode }> = ({ title, total, detail, children }) => (
  <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-4">
    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{title}</div>
    <div className="font-display font-black text-xl tabular-nums text-slate-900 dark:text-white">{total}</div>
    {detail && <div className="text-[11px] text-slate-500 mt-0.5">{detail}</div>}
    <div className="mt-3 space-y-2">{children}</div>
  </div>
);

const Row: React.FC<{ label: string; amount: string; note?: string }> = ({ label, amount, note }) => (
  <div className="text-xs">
    <div className="flex items-start justify-between gap-3">
      <span className="text-slate-600 dark:text-slate-300">{label}</span>
      <span className="font-bold tabular-nums text-slate-800 dark:text-slate-100 text-right">{amount}</span>
    </div>
    {note && <p className="text-[10px] text-slate-400 mt-0.5">{note}</p>}
  </div>
);
