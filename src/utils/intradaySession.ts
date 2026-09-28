export type TradeTick = { time: number; price: number; volume: number };
export type SessionBar = { time: number; open: number; high: number; low: number; close: number; volume: number };

/** Trade prints from the exchange intraday tape: [unix seconds, price, volume]. */
export function parseIntradayTicks(raw: string): TradeTick[] {
  let parsed: { data?: unknown };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed?.data)) return [];
  const ticks: TradeTick[] = [];
  for (const row of parsed.data) {
    if (!Array.isArray(row) || row.length < 2) continue;
    const time = Number(row[0]) * 1000;
    const price = Number(row[1]);
    const volume = Number(row[2]) || 0;
    if (time > 0 && price > 0) ticks.push({ time, price, volume });
  }
  return ticks;
}

/** Group prints into candles. `intervalMs` is the candle size, for example 5 minutes. */
export function candlesFromTicks(ticks: TradeTick[], intervalMs: number): SessionBar[] {
  if (intervalMs <= 0) return [];
  const ordered = ticks.filter((tick) => tick.time > 0 && tick.price > 0).slice().sort((a, b) => a.time - b.time);
  const buckets = new Map<number, SessionBar>();
  for (const tick of ordered) {
    const time = Math.floor(tick.time / intervalMs) * intervalMs;
    const bar = buckets.get(time);
    if (!bar) {
      buckets.set(time, { time, open: tick.price, high: tick.price, low: tick.price, close: tick.price, volume: tick.volume });
    } else {
      bar.high = Math.max(bar.high, tick.price);
      bar.low = Math.min(bar.low, tick.price);
      bar.close = tick.price;
      bar.volume += tick.volume;
    }
  }
  return [...buckets.values()];
}

/** Keep history, then add only candles that start after its last bar. */
export function appendNewerBars<T extends { time: number }>(existing: T[], extra: T[]): T[] {
  const last = existing.reduce((max, bar) => Math.max(max, bar.time), 0);
  return existing.concat(extra.filter((bar) => bar.time > last).sort((a, b) => a.time - b.time));
}
