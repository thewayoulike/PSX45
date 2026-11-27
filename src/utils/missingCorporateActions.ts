import type { Transaction } from '../types';
import { stockBalances } from './stockPerformance';

/** One bonus, split or rights event from the exchange archive (via pyPSX). */
export type PsxCorporateAction = {
  exDate: string;
  kind: string[];
  bonusPercent?: number | null;
  rightPercent?: number | null;
  rightPrice?: number;
  splitRatio?: number | null;
  applied?: boolean;
};

export type MissingAction = {
  key: string;
  ticker: string;
  broker?: string;
  brokerId?: string;
  exDate: string;
  kind: 'bonus' | 'split' | 'rights';
  /** Shares held the day before the ex-date, in this broker account. */
  sharesHeld: number;
  bonusPercent?: number;
  splitRatio?: number;
  rightPercent?: number;
  rightPrice?: number;
};

const TYPE_FOR = { bonus: 'BONUS', split: 'SPLIT', rights: 'RIGHTS' } as const;
/** A user's own entry within this many days of the ex-date counts as recorded (credit dates lag). */
const MATCH_WINDOW_DAYS = 45;

const dayDiff = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000;
const accountOf = (t: Pick<Transaction, 'broker' | 'brokerId'>) => t.brokerId || t.broker || '';

export const missingActionKey = (ticker: string, account: string, exDate: string, kind: string) =>
  [ticker.toUpperCase(), account, exDate, kind].join('|');

/**
 * Bonus, split and rights events on stocks the user held at the ex-date, with no
 * matching entry in that broker account. Events the exchange quarantined
 * (applied = false) are skipped, and so is anything before the first purchase.
 */
export function findMissingActions(
  transactions: Transaction[],
  actionsBySymbol: Record<string, PsxCorporateAction[]>,
  today: string,
  dismissed: Set<string> = new Set(),
): MissingAction[] {
  const out: MissingAction[] = [];
  for (const [symbol, actions] of Object.entries(actionsBySymbol)) {
    const ticker = symbol.toUpperCase();
    const own = transactions.filter(t => (t.ticker || '').toUpperCase() === ticker);
    if (!own.length) continue;
    const accounts = new Map<string, { broker?: string; brokerId?: string }>();
    for (const t of own) if (!accounts.has(accountOf(t))) accounts.set(accountOf(t), { broker: t.broker, brokerId: t.brokerId });
    for (const action of actions) {
      if (action.applied === false || !action.exDate || action.exDate > today) continue;
      const kinds = new Set(action.kind);
      const events: Array<'bonus' | 'split' | 'rights'> = [];
      if (kinds.has('split')) events.push('split');
      if (kinds.has('bonus') && (action.bonusPercent ?? 0) > 0) events.push('bonus');
      if (kinds.has('right') && (action.rightPercent ?? 0) > 0) events.push('rights');
      for (const kind of events) {
        for (const [account, info] of accounts) {
          const key = missingActionKey(ticker, account, action.exDate, kind);
          if (dismissed.has(key)) continue;
          const inAccount = own.filter(t => accountOf(t) === account);
          const held = stockBalances(inAccount, action.exDate, false)[ticker] ?? 0;
          if (held <= 0.0001) continue;
          const recorded = inAccount.some(t => t.type === TYPE_FOR[kind] && dayDiff(t.date, action.exDate) <= MATCH_WINDOW_DAYS);
          if (recorded) continue;
          out.push({
            key, ticker, broker: info.broker, brokerId: info.brokerId, exDate: action.exDate, kind, sharesHeld: held,
            ...(kind === 'bonus' ? { bonusPercent: action.bonusPercent ?? undefined } : {}),
            ...(kind === 'split' && action.splitRatio ? { splitRatio: action.splitRatio } : {}),
            ...(kind === 'rights' ? { rightPercent: action.rightPercent ?? undefined, rightPrice: action.rightPrice } : {}),
          });
        }
      }
    }
  }
  return out.sort((a, b) => b.exDate.localeCompare(a.exDate));
}

/** Plain description, e.g. "10% bonus shares" or "2-for-1 split". */
export function describeMissingAction(a: MissingAction): string {
  if (a.kind === 'bonus') return `${a.bonusPercent}% bonus shares`;
  if (a.kind === 'split') return a.splitRatio ? `${a.splitRatio}-for-1 split` : 'Share split';
  return `${a.rightPercent}% rights issue${a.rightPrice ? ` at Rs ${a.rightPrice}` : ''}`;
}
