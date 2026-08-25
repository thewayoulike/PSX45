import { makeFundId } from './fundId';
import { MutualFundRecord } from '../services/mufapData';

/** AMC statement short codes → keywords to match catalog fund names. */
const FUND_CODE_HINTS: Record<string, string[]> = {
  AMMF: ['al meezan mutual fund'],
  KMIF: ['kse meezan index fund'],
  MDIP: ['meezan daily income fund'],
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
