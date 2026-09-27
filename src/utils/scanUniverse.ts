import { KSE100_SET, KMI30_SET } from '../services/indices';
import { isFundTicker } from './fundId';

/** Input must already be scoped to the active portfolio (or combined view). */
export function holdingScanSymbols(holdings: { ticker: string; quantity: number }[]): string[] {
  return [...new Set(holdings.filter(h => Number.isFinite(h.quantity) && h.quantity > 0)
    .map(h => h.ticker.trim().toUpperCase()).filter(s => s && !isFundTicker(s)))];
}

export interface ScanCandidate {
  symbol: string;
  current: number;
  ldcp: number;
  changePct: number;
  volume: number;
}

export interface BuildScanUniverseOpts {
  watchlist?: string[];
  holdings?: string[];
  /** For universe === 'SYMBOL' */
  symbol?: string;
}

/**
 * Pick scan candidates from a liquidity-ranked market-watch list.
 * Universe: KSE100 | KMI30 | WATCHLIST | HOLDINGS | ALL | SYMBOL | numeric top-N.
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

  if (u === 'HOLDINGS') {
    const symbols = [...new Set((opts.holdings || []).map(s => s.trim().toUpperCase()).filter(s => s && !isFundTicker(s)))];
    // Retain held stocks absent from today's snapshot; the scan can use history.
    return symbols.map(symbol => candidates.find(c => c.symbol === symbol) || ({
      symbol, current: 0, ldcp: NaN, changePct: NaN, volume: NaN,
    } as T));
  }

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
