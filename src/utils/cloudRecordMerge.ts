type Row = Record<string, any> & { id: string };
export type CloudRecords = { transactions: Row[]; portfolios: Row[]; brokers?: Row[] };

export const TRANSACTION_SYNC_PAUSED = 'Sync paused to protect transactions. This device and Google Drive have changes that cannot be safely combined. Your local records are still here. Download a local copy before reviewing the differences.';

// Ignore object-key order, but keep array order (same-day trade ordering matters).
const stable = (value: any): string => JSON.stringify(value, (_key, item) =>
  item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const same = (a: any, b: any) => stable(a) === stable(b);

export function cloudRecords(data: any): CloudRecords | undefined {
  if (!Array.isArray(data?.transactions) || !Array.isArray(data?.portfolios)) return undefined;
  return JSON.parse(JSON.stringify({ transactions: data.transactions, portfolios: data.portfolios,
    ...(Array.isArray(data.brokers) ? { brokers: data.brokers } : {}) }));
}

export function sameCloudRecords(a: any, b: any) {
  return same(cloudRecords(a), cloudRecords(b));
}

function mergeRows(base: Row[], local: Row[], remote: Row[]): Row[] {
  const index = (rows: Row[]) => {
    const map = new Map<string, Row>();
    for (const row of rows) {
      if (!row || typeof row.id !== 'string' || !row.id || map.has(row.id)) throw new Error(TRANSACTION_SYNC_PAUSED);
      map.set(row.id, row);
    }
    return map;
  };
  const before = index(base), ours = index(local), theirs = index(remote);
  const result: Row[] = [];
  // Retain remote ordering; append distinct local additions in their original order.
  for (const id of new Set([...theirs.keys(), ...ours.keys(), ...before.keys()])) {
    const b = before.get(id), l = ours.get(id), r = theirs.get(id);
    let row: Row | undefined;
    if (same(l, r) || same(l, b)) row = r;
    else if (same(r, b)) row = l;
    else throw new Error(TRANSACTION_SYNC_PAUSED); // Includes edit/delete conflicts.
    if (row) result.push(row);
  }
  return result;
}

/** A shared baseline distinguishes new trades from trades deliberately deleted elsewhere. */
export function mergeCloudRecords(base: CloudRecords | undefined, local: any, remote: any): any {
  if (sameCloudRecords(local, remote)) return remote;
  const ours = cloudRecords(local), theirs = cloudRecords(remote);
  if (!base || !ours || !theirs) throw new Error(TRANSACTION_SYNC_PAUSED);
  const transactions = mergeRows(base.transactions, ours.transactions, theirs.transactions);
  const portfolios = mergeRows(base.portfolios, ours.portfolios, theirs.portfolios);
  const brokers = mergeRows(base.brokers || [], ours.brokers || [], theirs.brokers || []);
  const portfolioIds = new Set(portfolios.map(row => row.id));
  if (transactions.some(row => row.portfolioId && !portfolioIds.has(row.portfolioId))) throw new Error(TRANSACTION_SYNC_PAUSED);
  return { ...remote, transactions, portfolios,
    ...(ours.brokers || theirs.brokers ? { brokers } : {}),
    ...(portfolioIds.has(local.currentPortfolioId) ? { currentPortfolioId: local.currentPortfolioId } : {}) };
}
