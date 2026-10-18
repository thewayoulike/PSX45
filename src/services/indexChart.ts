export type IndexPoint = { time: number; price: number };

/** Include the last close at/before the period boundary, including holidays. */
export function indexPeriod<T extends IndexPoint>(history: T[], months: number | null): T[] {
  const last = history.at(-1);
  if (!last) return [];
  if (months == null) return history;
  const cutoff = new Date(last.time);
  const day = cutoff.getUTCDate();
  cutoff.setUTCDate(1);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
  const monthDays = new Date(Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth() + 1, 0)).getUTCDate();
  cutoff.setUTCDate(Math.min(day, monthDays));
  const next = history.findIndex(point => point.time >= cutoff.getTime());
  if (next < 0) return [];
  const start = history[next].time === cutoff.getTime() ? next : Math.max(0, next - 1);
  return history.slice(start);
}

export type IndexBar = IndexPoint & { open: number; high: number; low: number; close: number; volume: number; volumeAvailable: boolean; endTime?: number };
export function parseIndexBars(raw: unknown): IndexBar[] {
  const unique = new Map<number, IndexBar>();
  for (const row of Array.isArray((raw as { bars?: unknown })?.bars) ? (raw as { bars: Record<string, unknown>[] }).bars : []) {
    if (!row || typeof row !== 'object') continue;
    const [time, open, high, low, close] = [row.time, row.open, row.high, row.low, row.close].map(Number);
    if (![time, open, high, low, close].every(v => Number.isFinite(v) && v > 0) || high < low) continue;
    const volumeAvailable = row.volumeAvailable !== false && row.volume != null && row.volume !== '' && Number.isFinite(Number(row.volume)) && Number(row.volume) >= 0;
    unique.set(time, { time, open, high, low, close, price: close, volume: volumeAvailable ? Number(row.volume) : 0, volumeAvailable });
  }
  return [...unique.values()].sort((a, b) => a.time - b.time);
}
export function aggregateIndexBars(bars: IndexBar[], interval: '1D' | '1W' | '1M'): IndexBar[] {
  if (interval === '1D') return bars;
  const groups = new Map<string, IndexBar>();
  for (const bar of bars) {
    const date = new Date(bar.time);
    if (interval === '1W') date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
    const key = date.toISOString().slice(0, interval === '1M' ? 7 : 10);
    const first = groups.get(key);
    if (!first) groups.set(key, { ...bar, endTime: bar.time });
    else groups.set(key, { ...first, high: Math.max(first.high, bar.high), low: Math.min(first.low, bar.low), close: bar.close, price: bar.close,
      volume: first.volume + bar.volume, volumeAvailable: first.volumeAvailable && bar.volumeAvailable, endTime: bar.time });
  }
  return [...groups.values()];
}
