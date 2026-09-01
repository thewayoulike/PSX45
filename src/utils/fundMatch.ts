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

  const entries = Object.values(catalog);

  const exact = entries.find(f => norm(f.fundName) === nl);
  if (exact) return exact.id;

  // "Meezan Daily Income Fund (MDIP I)" → catalog row whose name starts with that label.
  const prefixHits = entries.filter(f => norm(f.fundName).startsWith(nl));
  if (prefixHits.length === 1) return prefixHits[0].id;
  if (prefixHits.length > 1) {
    prefixHits.sort((a, b) => norm(a.fundName).length - norm(b.fundName).length);
    return prefixHits[0].id;
  }

  const reversePrefix = entries.filter(f => nl.startsWith(norm(f.fundName)));
  if (reversePrefix.length === 1) return reversePrefix[0].id;

  // Distinctive substrings disambiguate MDIP vs Mahana Munafa vs other MDIF share classes.
  if (nl.includes('mdip')) {
    const hit = entries.find(f => norm(f.fundName).includes('mdip i'))
      || entries.find(f => norm(f.fundName).includes('mdip'));
    if (hit) return hit.id;
  }
  if (nl.includes('mahana') || nl.includes('munafa') || nl.includes('mmmp')) {
    const hit = entries.find(f => {
      const fn = norm(f.fundName);
      return fn.includes('mahana') || fn.includes('munafa');
    });
    if (hit) return hit.id;
  }

  const partialMatches = entries.filter(f => {
    const fn = norm(f.fundName);
    return fn.includes(nl) || nl.includes(fn);
  });
  if (partialMatches.length === 1) return partialMatches[0].id;
  if (partialMatches.length > 1) {
    const tokens = nl.split(' ').filter(t => t.length > 2);
    let best: MutualFundRecord | undefined;
    let bestScore = 0;
    for (const f of partialMatches) {
      const fn = norm(f.fundName);
      let score = 0;
      for (const t of tokens) if (fn.includes(t)) score++;
      if (fn.startsWith(nl) || nl.startsWith(fn)) score += 5;
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

  // Convert legs often use catalog ids while imports use legacy slugs — align both.
  for (const t of transactions) {
    if (!isFundTicker(t.ticker)) continue;
    if (map.get(t.ticker) === t.ticker && catalog[t.ticker]) continue;
    const notes = t.notes || '';
    if (/^Convert (to|from) /i.test(notes)) continue;
    const label = displayNames[t.ticker] || formatTransactionLabel(t.ticker, displayNames, notes);
    const matched = matchCatalogByLabel(label, catalog);
    if (matched) map.set(t.ticker, matched);
  }

  return map;
}

export function canonicalFundTicker(ticker: string, map: Map<string, string>): string {
  if (!isFundTicker(ticker)) return ticker;
  return map.get(ticker) || ticker;
}
