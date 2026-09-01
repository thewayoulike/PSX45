import { isFundTicker, makeFundId } from './fundId';
import type { Holding } from '../types';
import { MutualFundRecord } from '../services/mufapData';
import { formatTransactionLabel } from './fundDisplay';

/** AMC statement short codes → keywords to match catalog fund names. */
const FUND_CODE_HINTS: Record<string, string[]> = {
  AMMF: ['al meezan mutual fund'],
  KMIF: ['kse meezan index fund'],
  MDIP: ['mdip i'],
  'MDIF-MMMP': ['meezan daily income fund', 'munafa plan', 'mahana'],
  MIF: ['meezan islamic fund'],
  MIIF: ['meezan islamic income fund'],
  MSF: ['meezan strategic allocation'],
  MEF: ['meezan energy fund'],
  MCF: ['meezan cash fund'],
  MAAF: ['meezan asset allocation'],
  MBF: ['meezan balanced fund'],
};

const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Resolve an AMC fund code / name to a catalog MF: id (best effort). */
export function resolveFundFromScan(
  fundCode: string,
  fundName: string | undefined,
  catalog: Record<string, MutualFundRecord>
): { id: string; record: MutualFundRecord | null } {
  const code = (fundCode || '').trim().toUpperCase();
  const entries = Object.values(catalog);

  if (fundName) {
    const target = norm(fundName);
    const exact = entries.find(f => norm(f.fundName) === target);
    if (exact) return { id: exact.id, record: exact };
    const partial = entries.find(f => target.includes(norm(f.fundName)) || norm(f.fundName).includes(target));
    if (partial) return { id: partial.id, record: partial };
  }

  const hints = FUND_CODE_HINTS[code] || [norm(code)];
  for (const hint of hints) {
    const hit = entries.find(f => norm(f.fundName).includes(hint));
    if (hit) return { id: hit.id, record: hit };
  }

  if (fundName) {
    const slug = makeFundId('Unknown', fundName);
    return { id: slug, record: null };
  }
  return { id: `MF:${code.toLowerCase()}`, record: null };
}

const matchCatalogByLabel = (
  label: string,
  catalog: Record<string, MutualFundRecord>
): string | undefined => {
  const nl = norm(label);
  if (!nl) return undefined;
  const exact = Object.values(catalog).find(f => norm(f.fundName) === nl);
  if (exact) return exact.id;
  const partialMatches = Object.values(catalog).filter(f => {
    const fn = norm(f.fundName);
    return fn.includes(nl) || nl.includes(fn);
  });
  if (partialMatches.length === 1) return partialMatches[0].id;
  if (partialMatches.length > 1) {
    // Disambiguate MDIP vs Mahana Munafa etc. — pick the closest name length match.
    let best: MutualFundRecord | undefined;
    let bestScore = 0;
    for (const f of partialMatches) {
      const fn = norm(f.fundName);
      if (fn === nl) return f.id;
      const score = fn.startsWith(nl) || nl.startsWith(fn)
        ? Math.min(fn.length, nl.length)
        : 0;
      if (score > bestScore) { bestScore = score; best = f; }
    }
    if (best && bestScore > 0) return best.id;
  }
  return undefined;
};

/** Prefer an existing holding ticker so converts merge with legacy import ids. */
export function resolveHeldFundTicker(
  catalogId: string,
  catalog: Record<string, MutualFundRecord>,
  holdings: Holding[]
): string {
  if (holdings.some(h => h.ticker === catalogId && h.quantity > 0)) return catalogId;
  const rec = catalog[catalogId];
  if (!rec) return catalogId;
  const target = norm(rec.fundName);
  for (const h of holdings) {
    if (!isFundTicker(h.ticker) || h.quantity <= 0) continue;
    const cat = catalog[h.ticker];
    if (cat && norm(cat.fundName) === target) return h.ticker;
    const label = formatTransactionLabel(h.ticker, {}, undefined);
    if (norm(label) === target || norm(label).includes(target) || target.includes(norm(label))) return h.ticker;
  }
  const byLabel = matchCatalogByLabel(rec.fundName, catalog);
  if (byLabel) {
    const held = holdings.find(h => h.ticker === byLabel && h.quantity > 0);
    if (held) return held.ticker;
  }
  return catalogId;
}

/** Map legacy/import tickers to catalog ids so holdings stay on one row per fund. */
export function buildFundTickerCanonicalMap(
  transactions: { ticker: string; notes?: string }[],
  catalog: Record<string, MutualFundRecord>,
  displayNames: Record<string, string> = {}
): Map<string, string> {
  const map = new Map<string, string>();
  for (const id of Object.keys(catalog)) map.set(id, id);

  const tickers = new Set<string>();
  transactions.forEach(t => { if (isFundTicker(t.ticker)) tickers.add(t.ticker); });

  for (const ticker of tickers) {
    if (map.get(ticker) === ticker) continue;
    const notes = transactions.find(t => t.ticker === ticker)?.notes;
    const label = displayNames[ticker] || formatTransactionLabel(ticker, displayNames, notes);
    map.set(ticker, matchCatalogByLabel(label, catalog) || ticker);
  }
  return map;
}

export function canonicalFundTicker(ticker: string, map: Map<string, string>): string {
  if (!isFundTicker(ticker)) return ticker;
  return map.get(ticker) || ticker;
}
