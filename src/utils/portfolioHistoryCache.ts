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

/**
 * The newest saved chart for this portfolio, whatever ledger version it was built
 * from. Shown (clearly labelled) after an edit until a fresh history refresh works,
 * so the chart never goes blank just because a transaction changed.
 */
export function latestSavedHistory(...sets: unknown[]): PerformanceRow[] {
  let bestKey = '';
  let bestTime = -1;
  for (const set of sets) {
    if (!Array.isArray(set)) continue;
    for (const r of set) {
      if (!r || r.method !== PERFORMANCE_METHOD || typeof r.sourceKey !== 'string') continue;
      const t = Date.parse(r.fetchedAt) || 0;
      if (t > bestTime) { bestTime = t; bestKey = r.sourceKey; }
    }
  }
  return bestKey ? mergePortfolioHistory(bestKey, ...sets) : [];
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
/** This device's saved chart for the portfolio, from any ledger version. */
export function readAnyPortfolioHistory(scope: HistoryScope): unknown[] {
  try {
    const id = key(scope, 'daily');
    const entry = id ? JSON.parse(localStorage.getItem(id) || 'null') : null;
    return Array.isArray(entry?.rows) ? entry.rows : [];
  } catch { return []; }
}
export const readPortfolioHistory = (scope: HistoryScope) => matchingHistory(read(scope, 'daily')?.rows, scope.sourceKey);
export const writePortfolioHistory = (scope: HistoryScope, rows: PerformanceRow[]) => write(scope, 'daily', { rows: matchingHistory(rows, scope.sourceKey) });
export function readObservations(scope: HistoryScope, date: string): Observation[] {
  const entry = read(scope, 'intraday');
  return entry?.date === date && Array.isArray(entry.points) ? entry.points.filter((p: Observation) =>
    p && Number.isFinite(p.time) && Number.isFinite(new Date(p.time).getTime()) && Number.isFinite(p.value) &&
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(p.time) === date).slice(-500) : [];
}
export const writeObservations = (scope: HistoryScope, date: string, points: Observation[]) => write(scope, 'intraday', { date, points: points.slice(-500) });
