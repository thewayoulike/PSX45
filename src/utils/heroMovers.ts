import { selectTopMovers, type MoverRow } from './topMovers';

export interface HeroMover {
  ticker: string;
  pct: number;
  up: boolean;
}

/** KSE-100 top 10 gainers and top 10 losers, alternating so the two lists mix. */
export function mixTopMovers(rows: MoverRow[]): HeroMover[] {
  const gainers = selectTopMovers(rows, 'KSE100', 'gainers', 10).filter(row => row.change > 0);
  const losers = selectTopMovers(rows, 'KSE100', 'losers', 10).filter(row => row.change < 0);
  const mixed: HeroMover[] = [];
  const count = Math.max(gainers.length, losers.length);
  for (let i = 0; i < count; i++) {
    if (gainers[i]) mixed.push({ ticker: gainers[i].ticker, pct: gainers[i].change, up: true });
    if (losers[i]) mixed.push({ ticker: losers[i].ticker, pct: losers[i].change, up: false });
  }
  return mixed;
}

/**
 * Phone roster. The first `limit` ids are on screen.
 * When one of those leaves, it moves to the back and the next id steps on.
 * An id that is already waiting does not change the line.
 */
export function rotateOnScreen(queue: readonly number[], leaving: number, limit: number): number[] {
  const cap = Math.max(0, Math.min(limit, queue.length));
  if (!queue.slice(0, cap).includes(leaving)) return [...queue];
  const next = queue.filter(id => id !== leaving);
  next.push(leaving);
  return next;
}

/** One candle when both names moved the same way. A mixed pair shows both colors. */
export function jointCandleSides(aUp: boolean, bUp: boolean): Array<'up' | 'down'> {
  if (aUp === bUp) return [aUp ? 'up' : 'down'];
  return ['up', 'down'];
}
