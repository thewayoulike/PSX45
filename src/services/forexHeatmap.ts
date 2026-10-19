export const FX_CURRENCIES = [
  { code: 'EUR', name: 'Euro', flag: 'eu' }, { code: 'USD', name: 'US Dollar', flag: 'us' },
  { code: 'JPY', name: 'Japanese Yen', flag: 'jp' }, { code: 'GBP', name: 'British Pound', flag: 'gb' },
  { code: 'CHF', name: 'Swiss Franc', flag: 'ch' }, { code: 'AUD', name: 'Australian Dollar', flag: 'au' },
  { code: 'CAD', name: 'Canadian Dollar', flag: 'ca' }, { code: 'NZD', name: 'New Zealand Dollar', flag: 'nz' },
  { code: 'CNY', name: 'Chinese Yuan', flag: 'cn' }, { code: 'PKR', name: 'Pakistani Rupee', flag: 'pk' },
] as const;
export const FX_PERIODS = ['1D', '1W', '1M', '1Y'] as const;
export type FxPeriod = typeof FX_PERIODS[number];
export type FxSnapshot = { date: string; rates: Record<string, number> };
export type ForexHeatmapData = {
  current: FxSnapshot;
  comparisons: Record<FxPeriod, FxSnapshot | null>;
  requestedDates: Record<FxPeriod, string>;
};
export function fxCrossRate(snapshot: FxSnapshot | null | undefined, base: string, quote: string): number | null {
  const b = snapshot?.rates[base], q = snapshot?.rates[quote];
  if (!(b! > 0) || !(q! > 0) || !Number.isFinite(b) || !Number.isFinite(q)) return null;
  const rate = q! / b!;
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}
export function fxCrossChange(current: FxSnapshot | undefined, previous: FxSnapshot | null | undefined, base: string, quote: string): number | null {
  const now = fxCrossRate(current, base, quote), before = fxCrossRate(previous, base, quote);
  if (now == null || before == null) return null;
  const change = (now / before - 1) * 100;
  return Number.isFinite(change) ? change : null;
}
export function fxChangeLabel(value: number | null): string {
  if (value == null) return '—';
  if (Math.abs(value) < 0.005) return '0.00%';
  return `${value > 0 ? '+' : '−'}${Math.abs(value).toFixed(2)}%`;
}
