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
  const due = iso === normalizeExDateIso(today.toISOString().slice(0, 10));
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

  return Array.from(map.values()).sort((a, b) => {
    const da = normalizeExDateIso(a.bookClosure.replace(/^Ex-Date:\s*/i, '')) || '';
    const db = normalizeExDateIso(b.bookClosure.replace(/^Ex-Date:\s*/i, '')) || '';
    return da.localeCompare(db);
  });
}
