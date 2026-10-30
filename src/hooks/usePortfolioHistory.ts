import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Transaction } from '../types';
import { fetchStockHistory } from '../services/psxData';
import { formatDatePK } from '../utils/dates';
import { buildPerformanceHistory, stockTransactions, type PerformanceRow, type HistoryPoint } from '../utils/stockPerformance';
import { mergePortfolioHistory, readPortfolioHistory, writePortfolioHistory, type HistoryScope } from '../utils/portfolioHistoryCache';

/** Shared by portfolio value, daily P&L and benchmark cards, even if a card is hidden. */
export function usePortfolioHistory(scope: HistoryScope, transactions: Transaction[], saved: PerformanceRow[], enabled: boolean,
  onSave: (rows: PerformanceRow[]) => void) {
  const identity = JSON.stringify([scope.account.trim().toLowerCase(), scope.portfolio, scope.sourceKey]);
  const cached = useMemo(() => readPortfolioHistory(scope), [identity]);
  const [result, setResult] = useState<{ identity: string; rows?: PerformanceRow[]; loading?: boolean; error?: string }>({ identity });
  const rows = useMemo(() => scope.account ? mergePortfolioHistory(scope.sourceKey, cached, saved, result.identity === identity ? result.rows : []) : [],
    [identity, cached, saved, result]);
  const inputs = useRef({ scope, transactions, rows, onSave });
  inputs.current = { scope, transactions, rows, onSave };
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    if (!enabled || !scope.account) return;
    const run = ++generation.current;
    const input = inputs.current;
    const savedNotice = input.rows.some(row => row.netWorth != null) ? ' Saved values are still shown.' : '';
    setResult(prev => ({ identity, rows: prev.identity === identity ? prev.rows : undefined, loading: true }));
    try {
      const tickers = [...new Set(['KSE100', 'KMI30', ...stockTransactions(input.transactions).map(t => t.ticker)])];
      const history: Record<string, HistoryPoint[]> = {};
      let next = 0;
      await Promise.all(Array.from({ length: Math.min(4, tickers.length) }, async () => {
        while (next < tickers.length && generation.current === run) {
          const ticker = tickers[next++];
          try {
            // MAX uses all daily records supplied by PSX, with no 30-day clipping.
            const data = await fetchStockHistory(ticker, 'MAX');
            history[ticker] = data.length > 1 ? data.map(d => ({ ...d, dateStr: formatDatePK(new Date(d.time)) })) : [];
          } catch { history[ticker] = []; }
        }
      }));
      if (generation.current !== run || inputs.current.scope.account !== input.scope.account ||
        inputs.current.scope.portfolio !== input.scope.portfolio || inputs.current.scope.sourceKey !== input.scope.sourceKey) return;
      if ((history.KSE100 || []).length < 2) throw new Error(`History refresh is unavailable.${savedNotice} Try Refresh history again.`);
      const fresh = buildPerformanceHistory(input.transactions, history, new Date(), null);
      if (!fresh.some(row => row.netWorth != null)) throw new Error(`Prices needed for portfolio history are unavailable.${savedNotice}`);
      const merged = mergePortfolioHistory(input.scope.sourceKey, input.rows, inputs.current.rows, fresh);
      const stored = writePortfolioHistory(input.scope, merged);
      input.onSave(merged);
      const missing = fresh.some(r => r.netWorth == null);
      setResult({ identity, rows: merged, error: !stored ? 'This device could not save chart history. Your chart remains open; check available storage.' :
        missing ? 'Some historical prices are unavailable. Saved values are kept where available.' : undefined });
    } catch (e) {
      if (generation.current === run) setResult(prev => ({ ...prev, identity, loading: false, error: e instanceof Error ? e.message : `Could not refresh history.${savedNotice}` }));
    }
  }, [identity, enabled]);
  useEffect(() => {
    void refresh();
    return () => { generation.current++; };
  }, [refresh]);
  return { rows, loading: enabled && result.identity === identity && !!result.loading,
    error: result.identity === identity ? result.error : undefined, refresh };
}
