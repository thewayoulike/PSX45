import { PERFORMANCE_METHOD, type PerformanceRow } from './stockPerformance';

// Separate from the active session: kept on logout, read only for the signed-in
// account and an exact ledger version. Never restore another account's chart.
export const PORTFOLIO_HISTORY_PREFIX = 'psx_portfolio_history_v1:';
export type HistoryScope = { account: string; portfolio: string; sourceKey: string };
export type Observation = { time: number; value: number };
const key = (scope: HistoryScope, kind: string) => scope.account.trim()
  ? `${PORTFOLIO_HISTORY_PREFIX}${encodeURIComponent(scope.account.trim().toLowerCase())}:${encodeURIComponent(scope.portfolio)}:${kind}` : null;

export function matchingHistory(rows: unknown, sourceKey: string): PerformanceRow[] {
  return Array.isArray(rows) ? rows.filter(r => r && r.method === PERFORMANCE_METHOD && r.sourceKey === sourceKey &&
    /^\d{4}-\d{2}-\d{2}$/.test(r.rawDate) && Number.isFinite(Date.parse(r.rawDate)) &&
    (r.netWorth == null || typeof r.netWorth === 'number' && Number.isFinite(r.netWorth))) : [];
}

/** Retain older coverage and good saved valuations when a refresh is incomplete. */
export function mergePortfolioHistory(sourceKey: string, ...sets: unknown[]): PerformanceRow[] {
  const rows = new Map<string, PerformanceRow>();
  for (const set of sets) for (const row of matchingHistory(set, sourceKey)) {
    const old = rows.get(row.rawDate);
    if (!old || (old.netWorth == null && row.netWorth != null) ||
      ((row.netWorth != null || old.netWorth == null) && (Date.parse(row.fetchedAt) || 0) >= (Date.parse(old.fetchedAt) || 0))) rows.set(row.rawDate, row);
  }
  return [...rows.values()].sort((a, b) => a.rawDate.localeCompare(b.rawDate));
}

function read(scope: HistoryScope, kind: string) {
  try {
    const id = key(scope, kind);
    const entry = id ? JSON.parse(localStorage.getItem(id) || 'null') : null;
    return entry?.sourceKey === scope.sourceKey ? entry : null;
  } catch { return null; }
}
function write(scope: HistoryScope, kind: string, data: object): boolean {
  try {
    const id = key(scope, kind);
    if (!id) return false;
    localStorage.setItem(id, JSON.stringify({ sourceKey: scope.sourceKey, ...data }));
    return true;
  } catch { return false; }
}
export const readPortfolioHistory = (scope: HistoryScope) => matchingHistory(read(scope, 'daily')?.rows, scope.sourceKey);
export const writePortfolioHistory = (scope: HistoryScope, rows: PerformanceRow[]) => write(scope, 'daily', { rows: matchingHistory(rows, scope.sourceKey) });
export function readObservations(scope: HistoryScope, date: string): Observation[] {
  const entry = read(scope, 'intraday');
  return entry?.date === date && Array.isArray(entry.points) ? entry.points.filter((p: Observation) =>
    Number.isFinite(p.time) && Number.isFinite(p.value) && new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(p.time) === date).slice(-500) : [];
}
export const writeObservations = (scope: HistoryScope, date: string, points: Observation[]) => write(scope, 'intraday', { date, points: points.slice(-500) });
