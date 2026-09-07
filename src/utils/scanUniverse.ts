import { KSE100_SET, KMI30_SET } from '../services/indices';

export interface ScanCandidate {
  symbol: string;
  current: number;
  ldcp: number;
  changePct: number;
  volume: number;
}

export interface BuildScanUniverseOpts {
  watchlist?: string[];
  /** For universe === 'SYMBOL' */
  symbol?: string;
}

/**
 * Pick scan candidates from a liquidity-ranked market-watch list.
 * Universe: KSE100 | KMI30 | WATCHLIST | ALL | SYMBOL | numeric top-N (e.g. "40").
 */
export function buildScanUniverse<T extends ScanCandidate>(
  candidates: T[],
  universe: string,
  opts: BuildScanUniverseOpts = {},
): T[] {
  const u = (universe || '').trim().toUpperCase();

  if (u === 'KSE100') return candidates.filter((c) => KSE100_SET.has(c.symbol));
  if (u === 'KMI30') return candidates.filter((c) => KMI30_SET.has(c.symbol));
  if (u === 'ALL') return candidates;

  if (u === 'WATCHLIST') {
    const wl = new Set((opts.watchlist || []).map((s) => s.trim().toUpperCase()).filter(Boolean));
    return candidates.filter((c) => wl.has(c.symbol));
  }

  if (u === 'SYMBOL') {
    const sym = (opts.symbol || '').trim().toUpperCase();
    if (!sym) return [];
    const hit = candidates.find((c) => c.symbol === sym);
    if (hit) return [hit];
    // Not in today's market-watch HTML — still allow a single-name scan via history.
    return [{
      symbol: sym,
      current: 0,
      ldcp: 0,
      changePct: 0,
      volume: 0,
    } as T];
  }

  const n = Number(universe) || 40;
  return candidates.slice(0, n);
}
