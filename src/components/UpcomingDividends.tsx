import React, { useMemo, useState, useEffect } from 'react';
import { Holding } from '../types';
import { fetchMarketWideDividends } from '../services/financials';
import { Coins, CalendarClock, Loader2 } from 'lucide-react';

interface Props {
  holdings: Holding[];
  days?: number; // window, default 30
}

const rs0 = (n: number) => `Rs. ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const rs2 = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const UpcomingDividends: React.FC<Props> = ({ holdings, days = 30 }) => {
  const [payouts, setPayouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Pull the market-wide dividend sheet (same source as Future X-Dates).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await fetchMarketWideDividends();
        if (alive) setPayouts(data || []);
      } catch { /* ignore */ }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  // Total quantity you hold per ticker (across brokers).
  const heldQty = useMemo(() => {
    const m: Record<string, number> = {};
    holdings.forEach(h => { m[h.ticker] = (m[h.ticker] || 0) + h.quantity; });
    return m;
  }, [holdings]);

  const { rows, total } = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const list = (payouts || [])
      .map((p: any) => {
        const qty = heldQty[p.ticker] || 0;
        const ex = new Date(String(p.bookClosure || '').replace('Ex-Date:', '').trim());
        ex.setHours(0, 0, 0, 0);
        const daysTo = Math.ceil((ex.getTime() - today.getTime()) / 864e5);
        const m = String(p.details || '').match(/Rs\.?\s*([\d.,]+)/i);
        const perShare = m ? parseFloat(m[1].replace(/,/g, '')) : 0;
        return { ticker: p.ticker, ex, daysTo, perShare, qty, expected: perShare * qty };
      })
      .filter((r: any) => r.qty > 0 && !isNaN(r.ex.getTime()) && r.daysTo >= 0 && r.daysTo <= days)
      .sort((a: any, b: any) => a.ex.getTime() - b.ex.getTime());
    return { rows: list, total: list.reduce((s: number, r: any) => s + r.expected, 0) };
  }, [payouts, heldQty, days]);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 shadow-card dark:shadow-card-dark p-5 flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-display font-black text-slate-900 dark:text-white uppercase tracking-widest flex items-center gap-2">
          <CalendarClock size={16} className="text-indigo-500" /> Upcoming Dividends
        </h3>
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Next {days}d</span>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center py-10 text-slate-400">
          <Loader2 size={22} className="animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-8 text-center">
          <Coins size={28} className="text-slate-300 dark:text-slate-600 mb-2" />
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">No dividends for your holdings in the next {days} days.</p>
          <p className="text-[11px] text-slate-400 mt-1">Reads your Future X-Dates sheet — sign in to Google if it's blank.</p>
        </div>
      ) : (
        <>
          <div className="divide-y divide-slate-50 dark:divide-slate-800/60 flex-1">
            {rows.map((d: any, i: number) => (
              <div key={`${d.ticker}-${i}`} className="flex items-center gap-3 py-2.5">
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="font-display font-black text-slate-800 dark:text-white text-sm truncate">{d.ticker}</span>
                  <span className="text-[10px] text-slate-400 font-semibold">Ex-date {d.ex.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} · in {d.daysTo}d</span>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">+{rs0(d.expected)}</div>
                  <div className="text-[10px] text-slate-400 tabular-nums">Rs. {rs2(d.perShare)}/sh × {d.qty.toLocaleString()}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Expected income</span>
            <span className="text-base font-display font-black text-emerald-600 dark:text-emerald-400 tabular-nums">+{rs0(total)}</span>
          </div>
        </>
      )}
    </div>
  );
};
