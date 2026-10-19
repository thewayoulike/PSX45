export const COMMODITY_IDS = ['gold', 'silver', 'copper', 'wti'] as const;
export type CommodityId = typeof COMMODITY_IDS[number];
export const COMMODITY_NAMES = { gold: 'Gold', silver: 'Silver', copper: 'Copper', wti: 'Crude Oil (WTI)' };
export const COMMODITY_RANGES = ['1W', '1M', '3M', '6M', '1Y', '3Y', '5Y', 'All'] as const;
export type CommodityRange = typeof COMMODITY_RANGES[number];
export type CommodityPoint = { date: string; close: number };
export type CommoditySeries = {
  id: CommodityId; name: string; symbol: string; unit: string; price: number | null; previousClose?: number | null;
  high?: number | null; low?: number | null; asOf?: string; date?: string; contract?: string;
  source?: string; sourceUrl?: string; stale: boolean; history: CommodityPoint[];
};
export function commodityPercent(price: number | null | undefined, previous: number | null | undefined) {
  return price != null && previous != null && Number.isFinite(price) && Number.isFinite(previous) && previous > 0 ? (price / previous - 1) * 100 : null;
}
export function commodityCutoff(date: string, range: CommodityRange) {
  if (range === 'All') return null;
  const now = new Date(`${date}T00:00:00Z`);
  if (range === '1W') now.setUTCDate(now.getUTCDate() - 7);
  else {
    const months = ({ '1M': 1, '3M': 3, '6M': 6, '1Y': 12, '3Y': 36, '5Y': 60 } as const)[range];
    const d = now.getUTCDate(); now.setUTCDate(1); now.setUTCMonth(now.getUTCMonth() - months);
    now.setUTCDate(Math.min(d, new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate()));
  }
  return now.toISOString().slice(0, 10);
}
export function commodityBaseline(series: CommoditySeries | undefined, range: CommodityRange) {
  if (!series?.date || !series.history.length) return null;
  const cutoff = commodityCutoff(series.date, range);
  if (!cutoff) return series.history[0];
  const point = [...series.history].reverse().find(point => point.date <= cutoff);
  // Holidays/weekends can use the preceding close; a large history gap cannot.
  return point && Date.parse(cutoff) - Date.parse(point.date) <= 7 * 86400000 ? point : null;
}
export function commodityReturn(series: CommoditySeries | undefined, range: CommodityRange | '1D') {
  return commodityPercent(series?.price, range === '1D' ? series?.previousClose : commodityBaseline(series, range)?.close);
}
export function commodityWindow(series: CommoditySeries | undefined, range: CommodityRange) {
  if (!series?.date) return [];
  const first = commodityBaseline(series, range)?.date || commodityCutoff(series.date, range);
  return series.history.filter(point => !first || point.date >= first);
}
export const commodityNumber = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? '—' : value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const commodityPercentLabel = (value: number | null) => value == null ? '—' : `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(2)}%`;
export const commodityDate = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
