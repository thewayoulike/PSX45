import type { CompanyFinancials, CompanyFundamentalSection, CompanyRatios } from '../services/financials';

/** Split toolkit values like `193,247,740 | 186,708,958`. */
export function parsePipeSeries(raw: string | null | undefined): string[] {
  const s = (raw || '').trim();
  if (!s || s === '-') return [];
  return s
    .split('|')
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Column headers: prefer real years; else FY / FY-1 … */
export function periodLabels(count: number, years?: string[] | null): string[] {
  if (years && years.length >= count) {
    return years.slice(0, count);
  }
  if (years && years.length > 0) {
    const out = years.slice();
    while (out.length < count) out.push(`FY-${out.length}`);
    return out.slice(0, count);
  }
  return Array.from({ length: count }, (_, i) => (i === 0 ? 'FY' : `FY-${i}`));
}

function pickMetric(map: Record<string, string>, keys: string[]): string[] {
  for (const k of keys) {
    const hit = Object.keys(map).find((m) => m.toLowerCase() === k.toLowerCase());
    if (hit) return parsePipeSeries(map[hit]);
  }
  for (const k of keys) {
    const hit = Object.keys(map).find((m) => m.toLowerCase().includes(k.toLowerCase()));
    if (hit) return parsePipeSeries(map[hit]);
  }
  return [];
}

/** Build financial statement rows from toolkit metric → pipe-series map. */
export function rowsToFinancials(
  map: Record<string, string>,
  years?: string[] | null
): CompanyFinancials[] {
  const sales = pickMetric(map, ['Sales', 'Revenue']);
  const income = pickMetric(map, ['Total Income']);
  const profit = pickMetric(map, ['Profit after Taxation', 'Profit After Tax', 'Net Profit']);
  const eps = pickMetric(map, ['EPS', 'Earnings per share']);
  const n = Math.max(sales.length, income.length, profit.length, eps.length);
  if (n === 0) return [];
  const labels = periodLabels(n, years);
  return labels.map((year, i) => ({
    year,
    sales: sales[i] || '-',
    totalIncome: income[i] || '-',
    profitAfterTax: profit[i] || '-',
    eps: eps[i] || '-',
  }));
}

/** Build ratio rows from toolkit Ratios category map. */
export function rowsToRatios(map: Record<string, string>, years?: string[] | null): CompanyRatios[] {
  const gpm = pickMetric(map, ['Gross Profit Margin']);
  const npm = pickMetric(map, ['Net Profit Margin']);
  const growth = pickMetric(map, ['EPS Growth']);
  const peg = pickMetric(map, ['PEG']);
  const n = Math.max(gpm.length, npm.length, growth.length, peg.length);
  if (n === 0) return [];
  const labels = periodLabels(n, years);
  return labels.map((year, i) => ({
    year,
    grossProfitMargin: gpm[i] || '-',
    netProfitMargin: npm[i] || '-',
    epsGrowth: growth[i] || '-',
    peg: peg[i] || '-',
  }));
}

export function parsePercentValue(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const s = String(raw).replace(/,/g, '').trim();
  if (!s || s === '-') return null;
  // Prefer the number immediately before % (handles "(1Y)-27.94%")
  const beforePct = s.match(/(-?\d+(?:\.\d+)?)\s*%/);
  if (beforePct) {
    const n = parseFloat(beforePct[1]);
    return Number.isFinite(n) ? n : null;
  }
  const m = s.match(/-?\d+(?:\.\d+)?/g);
  if (!m || !m.length) return null;
  const n = parseFloat(m[m.length - 1]);
  return Number.isFinite(n) ? n : null;
}

export interface EquitySnapshot {
  marketCapRaw: string | null;
  shares: string | null;
  freeFloatShares: string | null;
  freeFloatPct: string | null;
  website: string | null;
}

export function equitySnapshotFromSections(sections: CompanyFundamentalSection[]): EquitySnapshot {
  const items = (cat: string) => sections.find((s) => s.category === cat)?.items || [];
  const equity = items('Equity Profile');
  const profile = items('Profile');

  const marketCapRaw = equity.find((i) => /market\s*cap/i.test(i.label))?.value || null;
  const shares = equity.find((i) => /^shares$/i.test(i.label.trim()))?.value || null;
  const floatItems = equity.filter((i) => /free\s*float/i.test(i.label));
  const freeFloatPct = floatItems.find((i) => String(i.value).includes('%'))?.value || null;
  const freeFloatShares =
    floatItems.find((i) => !String(i.value).includes('%'))?.value || null;
  const website = profile.find((i) => /website/i.test(i.label))?.value || null;

  return { marketCapRaw, shares, freeFloatShares, freeFloatPct, website };
}

/** Format a large PKR amount; when unitIsThousands, value is already in 000's. */
export function formatCompactPkAmount(
  raw: string | null | undefined,
  opts?: { unitIsThousands?: boolean }
): string {
  if (!raw) return '—';
  const n = parseFloat(String(raw).replace(/,/g, ''));
  if (!Number.isFinite(n)) return String(raw);
  const full = opts?.unitIsThousands ? n * 1000 : n;
  const abs = Math.abs(full);
  if (abs >= 1e12) return `${(full / 1e12).toFixed(1)} T`;
  if (abs >= 1e9) return `${(full / 1e9).toFixed(0)} B`;
  if (abs >= 1e6) return `${(full / 1e6).toFixed(1)} M`;
  return full.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

/** Metric map from a fundamentals section's items (label → value). */
export function sectionToMetricMap(section: CompanyFundamentalSection | undefined): Record<string, string> {
  const map: Record<string, string> = {};
  for (const item of section?.items || []) {
    if (item.label && item.value) map[item.label] = item.value;
  }
  return map;
}
