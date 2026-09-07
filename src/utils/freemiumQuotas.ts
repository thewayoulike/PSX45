/** Daily + lifetime Free-plan usage counters (Pakistan calendar day). localStorage v1. */

const CHART_KEY_PREFIX = 'psx_quota_charts_';
const DAILY_KEY_PREFIX = 'psx_quota_daily_';
const PROFILE_KEY = 'psx_free_profiles';

export function karachiDayKey(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

function chartStorageKey(day = karachiDayKey()): string {
  return `${CHART_KEY_PREFIX}${day}`;
}

function readChartSymbols(day = karachiDayKey()): string[] {
  const parsed = readJson<unknown>(chartStorageKey(day), []);
  if (!Array.isArray(parsed)) return [];
  return parsed.map((s) => String(s).toUpperCase()).filter(Boolean);
}

function writeChartSymbols(symbols: string[], day = karachiDayKey()): void {
  writeJson(chartStorageKey(day), symbols);
}

export function peekChartViewsToday(): string[] {
  return readChartSymbols();
}

/**
 * Record a chart symbol-view for Free quotas.
 * Unique symbols per Karachi day. Paid (`limit === Infinity`) skips persistence.
 */
export function tryRecordChartView(
  symbol: string,
  limit: number,
): { ok: boolean; used: number; remaining: number } {
  const sym = (symbol || '').trim().toUpperCase();
  if (!sym) return { ok: false, used: 0, remaining: 0 };

  if (!Number.isFinite(limit) || limit === Number.POSITIVE_INFINITY) {
    return { ok: true, used: 0, remaining: Number.POSITIVE_INFINITY };
  }

  const max = Math.max(0, Math.floor(limit));
  const current = readChartSymbols();
  if (current.includes(sym)) {
    return { ok: true, used: current.length, remaining: Math.max(0, max - current.length) };
  }
  if (current.length >= max) {
    return { ok: false, used: current.length, remaining: 0 };
  }
  const next = [...current, sym];
  writeChartSymbols(next);
  return { ok: true, used: next.length, remaining: Math.max(0, max - next.length) };
}

/** Increment a named daily counter (export, signals, scan, ai, fairValue). */
export function consumeDailyQuota(
  name: string,
  limit: number,
): { ok: boolean; used: number; remaining: number } {
  if (!Number.isFinite(limit) || limit === Number.POSITIVE_INFINITY) {
    return { ok: true, used: 0, remaining: Number.POSITIVE_INFINITY };
  }
  const max = Math.max(0, Math.floor(limit));
  const key = `${DAILY_KEY_PREFIX}${name}_${karachiDayKey()}`;
  const used = Number(readJson<number>(key, 0)) || 0;
  if (used >= max) {
    return { ok: false, used, remaining: 0 };
  }
  const next = used + 1;
  writeJson(key, next);
  return { ok: true, used: next, remaining: Math.max(0, max - next) };
}

export function peekDailyQuota(name: string): number {
  const key = `${DAILY_KEY_PREFIX}${name}_${karachiDayKey()}`;
  return Number(readJson<number>(key, 0)) || 0;
}

/** Lifetime Free stock-profile browse set (up to `limit` unique tickers). */
export function peekProfileOpens(): string[] {
  const parsed = readJson<unknown>(PROFILE_KEY, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.map((s) => String(s).toUpperCase()).filter(Boolean);
}

export function tryRecordProfileOpen(
  ticker: string,
  limit: number,
): { ok: boolean; used: number; remaining: number } {
  const sym = (ticker || '').trim().toUpperCase();
  if (!sym) return { ok: false, used: 0, remaining: 0 };

  if (!Number.isFinite(limit) || limit === Number.POSITIVE_INFINITY) {
    return { ok: true, used: 0, remaining: Number.POSITIVE_INFINITY };
  }

  const max = Math.max(0, Math.floor(limit));
  const current = peekProfileOpens();
  if (current.includes(sym)) {
    return { ok: true, used: current.length, remaining: Math.max(0, max - current.length) };
  }
  if (current.length >= max) {
    return { ok: false, used: current.length, remaining: 0 };
  }
  const next = [...current, sym];
  writeJson(PROFILE_KEY, next);
  return { ok: true, used: next.length, remaining: Math.max(0, max - next.length) };
}

/** Filter import rows to first-3 entitlement, filling empty slots in first-seen order. */
export function filterImportTickersForFree<T extends { ticker?: string }>(
  rows: T[],
  alreadyEntitled: string[],
  limit: number,
): { accepted: T[]; skipped: T[] } {
  const entitled = new Set(alreadyEntitled.map((s) => s.toUpperCase()));
  const accepted: T[] = [];
  const skipped: T[] = [];
  for (const row of rows) {
    const sym = (row.ticker || '').trim().toUpperCase();
    if (!sym) {
      accepted.push(row);
      continue;
    }
    if (entitled.has(sym)) {
      accepted.push(row);
      continue;
    }
    if (entitled.size < limit) {
      entitled.add(sym);
      accepted.push(row);
      continue;
    }
    skipped.push(row);
  }
  return { accepted, skipped };
}
