import { cachedMarketFetch } from './marketCache';
import { isFundTicker } from '../utils/fundId';
import type { PsxCorporateAction } from '../utils/missingCorporateActions';
import { setExtraHolidays } from '../features/tradingLab/psxCalendar';

// Exchange archive data via pyPSX. Every visitor shares one API budget on the
// server, so results are kept in this browser for a day and reused.

const DAY = 24 * 60 * 60 * 1000;

function readStore<T>(key: string, maxAge: number): T | null {
  try {
    const entry = JSON.parse(localStorage.getItem(key) || 'null');
    return entry && Date.now() - entry.at < maxAge ? entry.value as T : null;
  } catch { return null; }
}
function writeStore(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), value })); } catch { /* storage full or blocked */ }
}

async function getJson(url: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await cachedMarketFetch(url, () => fetch(url, { signal: AbortSignal.timeout(40000) }));
    if (!res.ok) return null;
    const json = await res.json();
    return json && typeof json === 'object' && !json.error ? json : null;
  } catch { return null; }
}

const stockSymbols = (symbols: string[]) =>
  [...new Set(symbols.map(s => s.toUpperCase().replace(/^PSX:/, '').trim()))]
    .filter(s => /^[A-Z0-9][A-Z0-9.-]{0,19}$/.test(s) && !isFundTicker(s)).sort();

/** Bonus, split and rights events for each symbol. Symbols that fail are left out. */
export async function fetchCorporateActions(symbols: string[]): Promise<Record<string, PsxCorporateAction[]>> {
  const out: Record<string, PsxCorporateAction[]> = {};
  const todo: string[] = [];
  for (const s of stockSymbols(symbols)) {
    const hit = readStore<PsxCorporateAction[]>(`psx_corp_actions_v1:${s}`, DAY);
    if (hit) out[s] = hit; else todo.push(s);
  }
  for (let i = 0; i < todo.length; i += 10) {
    const batch = todo.slice(i, i + 10);
    const json = await getJson(`/api/pypsx?mode=actions&symbols=${encodeURIComponent(batch.join(','))}`);
    const actions = (json?.actions || {}) as Record<string, PsxCorporateAction[]>;
    for (const s of batch) {
      if (!Array.isArray(actions[s])) continue;
      out[s] = actions[s];
      writeStore(`psx_corp_actions_v1:${s}`, actions[s]);
    }
  }
  return out;
}

/** Old company codes that the exchange now lists under a new code, e.g. { LINDE: 'PAKOXY' }. */
export async function fetchRenamedTickers(symbols: string[]): Promise<Record<string, string>> {
  const list = stockSymbols(symbols);
  if (!list.length) return {};
  const key = `psx_renamed_v1:${list.join(',')}`;
  const hit = readStore<Record<string, string>>(key, 7 * DAY);
  if (hit) return hit;
  const out: Record<string, string> = {};
  for (let i = 0; i < list.length; i += 10) {
    const json = await getJson(`/api/pypsx?mode=resolve&symbols=${encodeURIComponent(list.slice(i, i + 10).join(','))}`);
    if (!json) return out; // try again next visit rather than caching a failure
    Object.assign(out, json.resolved || {});
  }
  writeStore(key, out);
  return out;
}

/** Load this year's exchange holidays into the market clock. Safe to call on every start. */
export async function loadPsxHolidays(year = new Date().getFullYear()): Promise<string[]> {
  const key = `psx_holidays_v1:${year}`;
  let days = readStore<string[]>(key, DAY);
  if (!days) {
    const json = await getJson(`/api/pypsx?mode=calendar&year=${year}`);
    const rows = Array.isArray(json?.holidays) ? json!.holidays as { date?: string }[] : null;
    if (!rows) return [];
    days = rows.map(r => String(r.date || '')).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d));
    writeStore(key, days);
  }
  setExtraHolidays(days);
  return days;
}
