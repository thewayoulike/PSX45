import type { CompanyPayout } from '../types';
import type { DividendHistoryRow, LatestDividendInfo } from '../services/financials';

export type DividendSnapshot = {
  symbol: string;
  latestDividend: LatestDividendInfo | null;
  dividendHistory?: DividendHistoryRow[];
};

const pad = (n: number) => String(n).padStart(2, '0');

/** Parse assorted ex-date strings into YYYY-MM-DD (local calendar). */
export function normalizeExDateIso(raw: string | null | undefined): string | null {
  const s = String(raw ?? '').trim();
  if (!s || s === '-' || /^n\/?a$/i.test(s)) return null;

  // Already ISO-ish
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    return `${iso[1]}-${pad(Number(iso[2]))}-${pad(Number(iso[3]))}`;
  }

  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function startOfToday(): Date {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t;
}

/** Local calendar date as YYYY-MM-DD. toISOString() is UTC, a day behind before 05:00 in Pakistan. */
function localIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isUpcomingIso(iso: string, today = startOfToday()): boolean {
  const d = new Date(`${iso}T00:00:00`);
  if (isNaN(d.getTime())) return false;
  return d.getTime() >= today.getTime();
}

function cashToDetails(cash: string | null | undefined): string {
  const raw = String(cash ?? '').trim();
  if (!raw || raw === '-') return '-';
  const m = raw.replace(/,/g, '').match(/([\d.]+)/);
  if (!m) return `Div: ${raw}`;
  const n = parseFloat(m[1]);
  if (isNaN(n) || n <= 0) return '-';
  return `Div: Rs. ${n.toFixed(2)}`;
}

export function payoutDedupeKey(p: CompanyPayout): string | null {
  const ticker = (p.ticker || '').toUpperCase().trim();
  const iso = normalizeExDateIso(String(p.bookClosure || '').replace(/^Ex-Date:\s*/i, ''));
  if (!ticker || !iso) return null;
  return `${ticker}|${iso}`;
}

export function uniqueTickers(...lists: Array<string[] | undefined | null>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const list of lists) {
    for (const raw of list || []) {
      const t = String(raw || '')
        .toUpperCase()
        .replace(/^PSX:/, '')
        .trim();
      if (!t || seen.has(t)) continue;
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

function rowToPayout(
  ticker: string,
  exRaw: string,
  cash: string | null | undefined,
  today = startOfToday()
): CompanyPayout | null {
  const iso = normalizeExDateIso(exRaw);
  if (!iso || !isUpcomingIso(iso, today)) return null;
  const due = iso === localIsoDate(today);
  return {
    ticker,
    announceDate: '-',
    financialResult: '-',
    details: cashToDetails(cash),
    bookClosure: `Ex-Date: ${iso}`,
    isUpcoming: true,
    ...(due ? { isDueToday: true } : {}),
  } as CompanyPayout & { isDueToday?: boolean };
}

/** Map pyPSX dividend snapshot → upcoming CompanyPayout rows (deduped). */
export function companyInfoToUpcomingPayouts(info: DividendSnapshot): CompanyPayout[] {
  const ticker = (info.symbol || '').toUpperCase().trim();
  if (!ticker) return [];
  const today = startOfToday();
  const byKey = new Map<string, CompanyPayout>();

  const push = (p: CompanyPayout | null) => {
    if (!p) return;
    const key = payoutDedupeKey(p);
    if (!key || byKey.has(key)) return;
    byKey.set(key, p);
  };

  if (info.latestDividend?.exDividendDate) {
    push(
      rowToPayout(
        ticker,
        info.latestDividend.exDividendDate,
        info.latestDividend.cashAmount || info.latestDividend.annualDividend,
        today
      )
    );
  }

  for (const h of info.dividendHistory || []) {
    push(rowToPayout(ticker, h.exDividendDate, h.cashAmount, today));
  }

  return Array.from(byKey.values());
}

function exIso(p: CompanyPayout): string | null {
  return normalizeExDateIso(String(p.bookClosure || '').replace(/^Ex-Date:\s*/i, ''));
}

function cashRupees(details: string | undefined): number | null {
  const m = String(details || '').replace(/,/g, '').match(/Rs\.?\s*([\d.]+)/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

function isoDay(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

function hasExtra(value: string | undefined): boolean {
  return !!value && value !== '-' && value !== '0' && value !== '0%';
}

/**
 * The sheet sometimes stores the last cum-date, while pyPSX stores the first day
 * of book closure. Same cash amount within a week is one dividend.
 * Keep the later date (book-closure start) and any bonus or right from either row.
 */
function collapseSameDividend(rows: CompanyPayout[]): CompanyPayout[] {
  const byTicker = new Map<string, CompanyPayout[]>();
  for (const row of rows) {
    const ticker = row.ticker.toUpperCase();
    const list = byTicker.get(ticker) || [];
    list.push(row);
    byTicker.set(ticker, list);
  }
  const out: CompanyPayout[] = [];
  for (const list of byTicker.values()) {
    const sorted = [...list].sort((a, b) => (exIso(a) || '').localeCompare(exIso(b) || ''));
    const kept: CompanyPayout[] = [];
    for (const row of sorted) {
      const prev = kept[kept.length - 1];
      const prevIso = prev ? exIso(prev) : null;
      const rowIso = exIso(row);
      const prevCash = prev ? cashRupees(prev.details) : null;
      const rowCash = cashRupees(row.details);
      const days = prevIso && rowIso ? isoDay(rowIso) - isoDay(prevIso) : 99;
      if (prev && prevCash != null && prevCash === rowCash && days >= 1 && days <= 7) {
        kept[kept.length - 1] = {
          ...row,
          bonus: hasExtra(row.bonus) ? row.bonus : prev.bonus,
          right: hasExtra(row.right) ? row.right : prev.right,
        };
      } else {
        kept.push(row);
      }
    }
    out.push(...kept);
  }
  return out.sort((a, b) => (exIso(a) || '').localeCompare(exIso(b) || ''));
}

/** Sheet wins on ticker|exDate conflicts; result sorted soonest-first. */
export function mergeXDatePayouts(
  sheet: CompanyPayout[],
  pypsx: CompanyPayout[]
): CompanyPayout[] {
  const map = new Map<string, CompanyPayout>();

  for (const p of sheet || []) {
    const key = payoutDedupeKey(p);
    if (!key) continue;
    map.set(key, { ...p, ticker: p.ticker.toUpperCase().trim() });
  }
  for (const p of pypsx || []) {
    const key = payoutDedupeKey(p);
    if (!key || map.has(key)) continue;
    map.set(key, { ...p, ticker: p.ticker.toUpperCase().trim() });
  }

  return collapseSameDividend(Array.from(map.values()));
}
