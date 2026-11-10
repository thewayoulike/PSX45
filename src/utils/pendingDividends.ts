import type { CompanyPayout, DividendAnnouncement, Holding, Transaction } from '../types';

export interface PendingDividend {
  ticker: string;
  /** YYYY-MM-DD */
  exDate: string;
  perShare: number;
  qty: number;
  /** Before withholding tax. */
  expected: number;
  /** Ex-date already passed, but no Dividend entry recorded yet. */
  passed: boolean;
}

const DAY = 86_400_000;
const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayStart = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

const ADDS = new Set(['BUY', 'TRANSFER_IN', 'BONUS', 'RIGHTS']);
const REMOVES = new Set(['SELL', 'TRANSFER_OUT']);

/**
 * Shares that earn a dividend: only those you held before the ex-date.
 * Starts from what you hold now and undoes every buy or sell dated on or
 * after the ex-date (shares bought on the ex-date or later do not qualify;
 * shares sold on the ex-date or later still do).
 */
export function eligibleQtyForExDate(
  currentQty: number,
  ticker: string,
  exDate: string,
  transactions: (Pick<Transaction, 'type' | 'ticker' | 'date'> & { quantity?: number })[],
): number {
  const t = ticker.toUpperCase();
  let q = currentQty;
  for (const x of transactions) {
    if (x.ticker?.toUpperCase() !== t || !(x.date >= exDate)) continue;
    if (ADDS.has(x.type)) q -= x.quantity || 0;
    else if (REMOVES.has(x.type)) q += x.quantity || 0;
  }
  return Math.max(0, q);
}

/**
 * Dividends on shares you hold that are coming soon, or whose ex-date passed
 * recently without a Dividend entry yet. Used to explain a Reinvest Div entered
 * ahead of the dividend itself.
 */
export function pendingDividends(opts: {
  upcoming: CompanyPayout[];
  recent: DividendAnnouncement[];
  holdings: Pick<Holding, 'ticker' | 'quantity'>[];
  transactions: (Pick<Transaction, 'type' | 'ticker' | 'date'> & { quantity?: number })[];
  today?: Date;
  aheadDays?: number;
  backDays?: number;
}): PendingDividend[] {
  const today = dayStart(opts.today ?? new Date());
  const ahead = opts.aheadDays ?? 60;
  const back = opts.backDays ?? 45;
  const held: Record<string, number> = {};
  opts.holdings.forEach(h => { const t = h.ticker.toUpperCase(); held[t] = (held[t] || 0) + h.quantity; });
  const recorded = (ticker: string, exDate: string) =>
    opts.transactions.some(t => t.type === 'DIVIDEND' && t.ticker.toUpperCase() === ticker && t.date >= exDate);

  const out = new Map<string, PendingDividend>();
  const add = (ticker: string, ex: Date, perShare: number) => {
    const t = ticker.toUpperCase();
    if (!held[t] || !(perShare > 0) || isNaN(ex.getTime())) return;
    const days = Math.round((dayStart(ex).getTime() - today.getTime()) / DAY);
    if (days > ahead || days < -back) return;
    const exDate = iso(ex);
    const qty = eligibleQtyForExDate(held[t], t, exDate, opts.transactions);
    if (!qty) return;
    if (recorded(t, exDate)) return;
    out.set(`${t}|${exDate}`, { ticker: t, exDate, perShare, qty, expected: Number((perShare * qty).toFixed(2)), passed: days < 0 });
  };

  for (const p of opts.upcoming) {
    const ex = new Date(String(p.bookClosure || '').replace('Ex-Date:', '').trim());
    const m = String(p.details || '').match(/Rs\.?\s*([\d.,]+)/i);
    add(p.ticker, ex, m ? parseFloat(m[1].replace(/,/g, '')) : 0);
  }
  for (const d of opts.recent) add(d.ticker, new Date(`${d.exDate}T00:00:00`), d.amount);

  return [...out.values()].sort((a, b) => a.exDate.localeCompare(b.exDate));
}
