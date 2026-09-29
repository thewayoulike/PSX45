export interface MoverRow {
  ticker: string;
  price: number;
  ldcp?: number;
  change: number;
  volume: number;
  high: number;
  low: number;
  listedIn?: string;
}

export type MoverIndex = 'KSE100' | 'KMI30';
export type MoverDir = 'gainers' | 'losers';

/** Index membership from the market-watch "LISTED IN" cell. KSE100PR is not KSE-100. */
export function listedOnIndex(listedIn: string | undefined, index: MoverIndex): boolean {
  return (listedIn || '')
    .split(',')
    .map(tag => tag.trim().toUpperCase())
    .includes(index);
}

export function selectTopMovers(
  rows: MoverRow[],
  index: MoverIndex,
  dir: MoverDir,
  limit = 10,
): MoverRow[] {
  const tagged = rows.filter(row => listedOnIndex(row.listedIn, index));
  const hasTags = rows.some(row => (row.listedIn || '').trim().length > 0);
  const pool = hasTags ? tagged : rows;
  return pool
    .filter(row => Number.isFinite(row.change))
    .sort((a, b) => dir === 'gainers' ? b.change - a.change : a.change - b.change)
    .slice(0, limit);
}
