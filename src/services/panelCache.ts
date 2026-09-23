const STORAGE_KEY = 'psx_market_panels';
export const PANEL_CACHE_EVENT = 'psx-panel-cache';
export const PANEL_CACHE_HYDRATED_EVENT = 'psx-panel-cache-hydrated';

const DEFAULT_LIMITS: Record<string, number> = {
  dividends: 8,
  profile: 24,
  filings: 24,
  meetings: 2,
  movers: 4,
};

const DEFAULT_MAX_ENTRY_CHARS = 80_000;
const DEFAULT_MAX_TOTAL_CHARS = 400_000;

export interface PanelEntry<T = unknown> {
  savedAt: string;
  data: T;
}

type PanelCache = Record<string, PanelEntry>;

export const panelKeys = {
  dividends(tickers: string[], watch: string[] = []) {
    const held = [...tickers].map((t) => t.toUpperCase()).sort().join(',');
    const watched = [...watch].map((t) => t.toUpperCase()).sort().join(',');
    return `dividends:${held}|${watched}`;
  },
  profile(ticker: string) {
    return `profile:${ticker.toUpperCase()}`;
  },
  filings(ticker: string) {
    return `filings:${ticker.toUpperCase()}`;
  },
  meetings() {
    return 'meetings:market';
  },
  movers(index: string) {
    return `movers:${index}`;
  },
};

function familyOf(key: string) {
  return key.split(':')[0] || key;
}

function readAll(storage: Storage): PanelCache {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as PanelCache;
  } catch {
    return {};
  }
}

function writeAll(storage: Storage, cache: PanelCache) {
  const payload = JSON.stringify(cache);
  try {
    storage.setItem(STORAGE_KEY, payload);
  } catch {
    const oldest = Object.keys(cache).sort((a, b) => (cache[a].savedAt < cache[b].savedAt ? -1 : 1)).slice(0, 8);
    for (const key of oldest) delete cache[key];
    try { storage.setItem(STORAGE_KEY, JSON.stringify(cache)); } catch { /* keep the on-screen copy */ }
  }
}

function reviveMeeting<T extends { date?: unknown }>(row: T): T {
  if (row && typeof row.date === 'string') return { ...row, date: new Date(row.date) };
  return row;
}

function revive(key: string, data: unknown): unknown {
  if (key.startsWith('meetings:') && Array.isArray(data)) return data.map((row) => reviveMeeting(row));
  if (key.startsWith('filings:') && data && typeof data === 'object') {
    const row = data as { meeting?: { date?: unknown } | null };
    if (row.meeting && typeof row.meeting.date === 'string') {
      return { ...row, meeting: reviveMeeting(row.meeting) };
    }
  }
  return data;
}

function trim(cache: PanelCache, limits: Record<string, number>) {
  const byFamily = new Map<string, string[]>();
  for (const key of Object.keys(cache)) {
    const family = familyOf(key);
    const list = byFamily.get(family) || [];
    list.push(key);
    byFamily.set(family, list);
  }
  for (const [family, keys] of byFamily) {
    const cap = limits[family] ?? DEFAULT_LIMITS[family] ?? 24;
    keys.sort((a, b) => (cache[b].savedAt > cache[a].savedAt ? 1 : cache[b].savedAt < cache[a].savedAt ? -1 : 0));
    for (const key of keys.slice(cap)) delete cache[key];
  }
  return cache;
}

export function readPanel<T>(key: string, storage: Storage = localStorage): PanelEntry<T> | null {
  const entry = readAll(storage)[key];
  if (!entry || typeof entry.savedAt !== 'string' || !('data' in entry)) return null;
  return { savedAt: entry.savedAt, data: revive(key, entry.data) as T };
}

export function savePanel(
  key: string,
  data: unknown,
  storage: Storage = localStorage,
  now: () => string = () => new Date().toISOString(),
  limits?: Record<string, number>,
): boolean {
  const cache = readAll(storage);
  const previous = cache[key];
  if (previous && JSON.stringify(previous.data) === JSON.stringify(data)) return false;
  if (Array.isArray(data) && data.length === 0 && Array.isArray(previous?.data) && previous.data.length > 0) return false;
  cache[key] = { savedAt: now(), data };
  writeAll(storage, trim(cache, { ...DEFAULT_LIMITS, ...limits }));
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(PANEL_CACHE_EVENT));
  return true;
}

export function applyDrivePanelCache(incoming: unknown, storage: Storage = localStorage) {
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) return;
  const cache = readAll(storage);
  let changed = false;
  for (const [key, entry] of Object.entries(incoming as PanelCache)) {
    if (!entry || typeof entry.savedAt !== 'string' || !('data' in entry)) continue;
    const current = cache[key];
    if (current && current.savedAt >= entry.savedAt) continue;
    cache[key] = { savedAt: entry.savedAt, data: entry.data };
    changed = true;
  }
  if (!changed) return;
  writeAll(storage, trim(cache, DEFAULT_LIMITS));
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(PANEL_CACHE_HYDRATED_EVENT));
}

export function exportPanelCacheForDrive(
  storage: Storage = localStorage,
  options: { maxEntryChars?: number; maxTotalChars?: number } = {},
): PanelCache {
  const maxEntry = options.maxEntryChars ?? DEFAULT_MAX_ENTRY_CHARS;
  const maxTotal = options.maxTotalChars ?? DEFAULT_MAX_TOTAL_CHARS;
  const cache = readAll(storage);
  const keys = Object.keys(cache).sort((a, b) => (cache[b].savedAt > cache[a].savedAt ? 1 : -1));
  const out: PanelCache = {};
  let total = 2;
  for (const key of keys) {
    const entry = cache[key];
    const packed = JSON.stringify({ [key]: entry });
    if (packed.length > maxEntry) continue;
    if (total + packed.length > maxTotal) continue;
    out[key] = entry;
    total += packed.length;
  }
  return out;
}
