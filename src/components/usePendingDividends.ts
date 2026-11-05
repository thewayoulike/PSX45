import { useEffect, useState } from 'react';
import type { Holding, Transaction } from '../types';
import { fetchDividendsForScan, fetchUpcomingXDates } from '../services/financials';
import { pendingDividends, type PendingDividend } from '../utils/pendingDividends';

/**
 * Upcoming (or just-passed, not yet recorded) dividends on held shares.
 * Only fetches while `enabled`, so the dashboard makes no extra calls normally.
 */
export function usePendingDividends(enabled: boolean, holdings: Holding[], transactions: Transaction[]): PendingDividend[] | null {
  const [list, setList] = useState<PendingDividend[] | null>(null);
  const tickersKey = holdings.map(h => h.ticker).sort().join(',');
  const txKey = transactions.filter(t => t.type === 'DIVIDEND').map(t => `${t.ticker}@${t.date}`).join(',');

  useEffect(() => {
    if (!enabled || !tickersKey) { setList(null); return; }
    let alive = true;
    (async () => {
      const [upcoming, recent] = await Promise.all([
        fetchUpcomingXDates(tickersKey.split(','), []).catch(() => []),
        fetchDividendsForScan(2).catch(() => []),
      ]);
      if (alive) setList(pendingDividends({ upcoming, recent, holdings, transactions }));
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, tickersKey, txKey]);

  return list;
}
