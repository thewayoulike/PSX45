import { makeFundId } from '../utils/fundId';

export interface MutualFundRecord {
  id: string;
  sector: string;
  amc: string;
  fundName: string;
  category: string;
  inceptionDate?: string;
  offer: number;
  repurchase: number;
  nav: number;
  validityDate: string;
  frontEndLoad: number;
  backEndLoad: number;
}

export const MUFAP_NAV_URL = 'https://www.mufap.com.pk/Industry/IndustryStatDaily?tab=3';
export const FUND_CATALOG_STORAGE_KEY = 'psx_fund_catalog';
export const FUND_CATALOG_UPDATED_KEY = 'psx_fund_catalog_updated';

const parseNum = (raw: string): number => {
  const n = parseFloat((raw || '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
};

/** Parse a MUFAP NAV table row (14 columns). */
const rowToFund = (cells: string[]): MutualFundRecord | null => {
  if (cells.length < 8) return null;
  const sector = (cells[0] || '').trim();
  const amc = (cells[1] || '').trim();
  const fundName = (cells[2] || '').trim();
  const category = (cells[3] || '').trim();
  if (!amc || !fundName || sector === 'Sector') return null;

  const offer = parseNum(cells[5] || '');
  const repurchase = parseNum(cells[6] || '');
  const nav = parseNum(cells[7] || '') || repurchase || offer;
  if (nav <= 0) return null;

  return {
    id: makeFundId(amc, fundName, category),
    sector,
    amc,
    fundName,
    category,
    inceptionDate: (cells[4] || '').trim() || undefined,
    offer: offer || nav,
    repurchase: repurchase || nav,
    nav,
    validityDate: (cells[8] || '').trim(),
    frontEndLoad: parseNum(cells[9] || ''),
    backEndLoad: parseNum(cells[10] || ''),
  };
};

/** Parse HTML table from MUFAP NAV page. */
export const parseMufapNavHtml = (html: string): MutualFundRecord[] => {
  const funds: MutualFundRecord[] = [];
  const seen = new Set<string>();

  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('table tr').forEach(tr => {
      const cells = Array.from(tr.querySelectorAll('td, th')).map(el => el.textContent?.trim() || '');
      if (cells.length < 8) return;
      const fund = rowToFund(cells);
      if (fund && !seen.has(fund.id)) {
        seen.add(fund.id);
        funds.push(fund);
      }
    });
  } catch {
    /* fall through to pipe-table parser */
  }

  if (funds.length > 0) return funds;

  // Markdown / pipe-delimited fallback (some proxies strip tags)
  const lines = html.split(/\r?\n/);
  for (const line of lines) {
    if (!line.includes('|')) continue;
    const cells = line.split('|').map(c => c.trim()).filter(Boolean);
    if (cells.length < 8) continue;
    const fund = rowToFund(cells);
    if (fund && !seen.has(fund.id)) {
      seen.add(fund.id);
      funds.push(fund);
    }
  }

  return funds;
};

export const loadCachedFundCatalog = (): Record<string, MutualFundRecord> => {
  try {
    const saved = localStorage.getItem(FUND_CATALOG_STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch { /* ignore */ }
  return {};
};

export const saveFundCatalog = (catalog: Record<string, MutualFundRecord>) => {
  try {
    localStorage.setItem(FUND_CATALOG_STORAGE_KEY, JSON.stringify(catalog));
    localStorage.setItem(FUND_CATALOG_UPDATED_KEY, new Date().toISOString());
  } catch { /* ignore */ }
};

type CatalogPayload = {
  catalog: Record<string, MutualFundRecord>;
  reportDate?: string | null;
  updatedAt?: string | null;
  source?: string;
  count?: number;
};

let embeddedCatalogPromise: Promise<CatalogPayload> | null = null;

/** Catalog baked into the JS bundle — works even when /api and /data routes 404. */
const loadEmbeddedCatalog = (): Promise<CatalogPayload> => {
  if (!embeddedCatalogPromise) {
    embeddedCatalogPromise = import('../../data/fund-nav-catalog.json').then(m => m.default as CatalogPayload);
  }
  return embeddedCatalogPromise;
};

/** Preload catalog from localStorage or embedded bundle (no network). */
export const ensureFundCatalogLoaded = async (): Promise<Record<string, MutualFundRecord>> => {
  const cached = loadCachedFundCatalog();
  if (Object.keys(cached).length > 0) return cached;
  const data = await loadEmbeddedCatalog();
  saveFundCatalog(data.catalog);
  return data.catalog;
};

const parsePayload = (data: CatalogPayload, source?: string) => {
  if (!data?.catalog || Object.keys(data.catalog).length === 0) {
    throw new Error('Fund NAV catalog is empty.');
  }
  saveFundCatalog(data.catalog);
  return {
    catalog: data.catalog,
    reportDate: data.reportDate || undefined,
    updatedAt: data.updatedAt || undefined,
    source: source || data.source || undefined,
  };
};

const isStaleCatalogSource = (source?: string) =>
  !source || source === 'bundled' || source === 'embedded' || source === 'static' || source === 'seed';

/** True when NAV prices came from a fresh MUFAP fetch (not bundled/seed file). */
export const isLiveFundCatalogSource = (source?: string) =>
  source === 'live' || source === 'browser-live' || source === 'proxy-live' || source === 'cors-live';

const FUND_LDCP_RECENT_MS = 72 * 60 * 60 * 1000;

export const FUND_NAV_DAY_KEY = 'psx_fund_nav_day';

/** Last trusted NAV + MUFAP validity date — used for true day-over-day P&L. */
export interface FundNavDayMark {
  nav: number;
  /** MUFAP validity / report date string, e.g. "Aug 25, 2026" */
  validityDate: string;
  syncedAt: string;
}

export type FundNavDayMap = Record<string, FundNavDayMark>;

export const loadFundNavDayMap = (): FundNavDayMap => {
  try {
    const raw = localStorage.getItem(FUND_NAV_DAY_KEY);
    if (raw) return JSON.parse(raw) as FundNavDayMap;
  } catch { /* ignore */ }
  return {};
};

export const saveFundNavDayMap = (map: FundNavDayMap) => {
  try { localStorage.setItem(FUND_NAV_DAY_KEY, JSON.stringify(map)); } catch { /* ignore */ }
};

/** Normalize MUFAP validity strings for comparison. */
export const normalizeFundValidity = (v?: string): string =>
  (v || '').trim().toLowerCase().replace(/\s+/g, ' ');

/** Prior NAV was from a recent live sync (safe to use as yesterday for day P&L). */
export const isRecentLiveFundPrice = (isoTimestamp?: string, now = Date.now()): boolean => {
  if (!isoTimestamp) return false;
  const t = Date.parse(isoTimestamp);
  return !Number.isNaN(t) && now - t >= 0 && now - t < FUND_LDCP_RECENT_MS;
};

/**
 * Fund "yesterday NAV" for daily P&L.
 * Only trust stored ldcp when we have a day-mark proving a prior MUFAP validity date
 * (true day-over-day). Catalog corrections must never invent daily P&L.
 */
export const resolveFundDayNav = (
  currentNav: number,
  storedLdcp: number | undefined,
  opts?: {
    priceTimestamp?: string;
    dayMark?: FundNavDayMark;
    currentValidity?: string;
  }
): number => {
  if (!(currentNav > 0)) return storedLdcp && storedLdcp > 0 ? storedLdcp : 0;
  if (!(storedLdcp > 0)) return currentNav;

  const curV = normalizeFundValidity(opts?.currentValidity);
  const markV = normalizeFundValidity(opts?.dayMark?.validityDate);

  // Same validity date as last mark → same MUFAP report day → no day move
  if (curV && markV && curV === markV) return currentNav;

  // Trusted prior close only when day-mark NAV matches stored ldcp and validity differs
  if (
    opts?.dayMark &&
    markV &&
    curV &&
    markV !== curV &&
    Math.abs(opts.dayMark.nav - storedLdcp) < 1e-6 &&
    isRecentLiveFundPrice(opts.priceTimestamp)
  ) {
    return storedLdcp;
  }

  // No proven day-over-day chain → baseline (fixes ALL stale leftover ldcp at once)
  return currentNav;
};

const isMufapBlockedPage = (html: string): boolean => {
  if (!html || html.length < 1500) return true;
  const lower = html.toLowerCase();
  return (
    lower.includes('just a moment') ||
    lower.includes('cf-chl') ||
    lower.includes('challenge-platform') ||
    lower.includes('enable javascript and cookies')
  );
};

const buildCatalogFromFunds = (funds: MutualFundRecord[], html: string, source: string) => {
  const catalog: Record<string, MutualFundRecord> = {};
  funds.forEach(f => { catalog[f.id] = f; });
  const dateMatch = html.match(/Report Date:\s*([A-Za-z]+\s+\d{1,2},\s+\d{4})/i);
  return {
    catalog,
    count: funds.length,
    reportDate: dateMatch?.[1]?.trim() || undefined,
    updatedAt: new Date().toISOString(),
    source,
  };
};

/** Fetch MUFAP HTML in the user's browser (bypasses server-side Cloudflare blocks). */
const fetchLiveMufapFromBrowser = async (): Promise<CatalogPayload | null> => {
  try {
    const res = await fetch(MUFAP_NAV_URL, { cache: 'no-store', credentials: 'omit' });
    if (!res.ok) return null;
    const html = await res.text();
    if (isMufapBlockedPage(html)) return null;
    const funds = parseMufapNavHtml(html);
    if (funds.length < 50) return null;
    return buildCatalogFromFunds(funds, html, 'browser-live');
  } catch {
    return null;
  }
};

const extractProxyHtml = (text: string, via: string): string | null => {
  if (!text) return null;
  if (via.includes('allorigins') && text.trimStart().startsWith('{')) {
    try {
      const json = JSON.parse(text) as { contents?: string };
      return json.contents || null;
    } catch {
      return null;
    }
  }
  return text;
};

/**
 * Public CORS relays (same hosts already used for PSX).
 * Vercel /api/proxy is often 403'd by MUFAP Cloudflare — these use other IPs.
 */
const CORS_RELAYS = [
  (url: string) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}&t=${Date.now()}`,
  (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}&t=${Date.now()}`,
  (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}&_t=${Date.now()}`,
];

const fetchLiveMufapViaCors = async (): Promise<CatalogPayload | null> => {
  for (const build of CORS_RELAYS) {
    try {
      const proxyUrl = build(MUFAP_NAV_URL);
      const res = await fetch(proxyUrl, { cache: 'no-store' });
      if (!res.ok) continue;
      const raw = await res.text();
      const html = extractProxyHtml(raw, proxyUrl);
      if (!html || isMufapBlockedPage(html)) continue;
      const funds = parseMufapNavHtml(html);
      if (funds.length < 50) continue;
      return buildCatalogFromFunds(funds, html, 'cors-live');
    } catch {
      /* try next */
    }
  }
  return null;
};

/** Last-resort: our Vercel proxy (often blocked by Cloudflare for MUFAP). */
const fetchLiveMufapViaProxy = async (): Promise<CatalogPayload | null> => {
  try {
    const proxyUrl = `/api/proxy?url=${encodeURIComponent(MUFAP_NAV_URL)}&t=${Date.now()}`;
    const res = await fetch(proxyUrl, { cache: 'no-store' });
    if (!res.ok) return null;
    const html = await res.text();
    if (html.trimStart().startsWith('{') || isMufapBlockedPage(html)) return null;
    const funds = parseMufapNavHtml(html);
    if (funds.length < 50) return null;
    return buildCatalogFromFunds(funds, html, 'proxy-live');
  } catch {
    return null;
  }
};

/** Try live MUFAP sources in order of reliability when Cloudflare blocks Vercel. */
const fetchAnyLiveMufap = async (): Promise<CatalogPayload | null> =>
  (await fetchLiveMufapFromBrowser()) ||
  (await fetchLiveMufapViaCors()) ||
  (await fetchLiveMufapViaProxy());

/** Repurchase / NAV column — what holders receive on redemption (MUFAP "NAV" column). */
export const fundValuationNav = (f: MutualFundRecord): number =>
  f.repurchase > 0 ? f.repurchase : f.nav;

/** Fetch full MUFAP NAV catalog — browser → CORS → API → Vercel proxy → static → embedded. */
export const fetchMufapNavCatalog = async (): Promise<{
  catalog: Record<string, MutualFundRecord>;
  reportDate?: string;
  updatedAt?: string;
  source?: string;
}> => {
  // 1) Live paths that bypass Vercel→MUFAP Cloudflare blocks
  const earlyLive = await fetchAnyLiveMufap();
  if (earlyLive) return parsePayload(earlyLive, earlyLive.source);

  // 2) Vercel API (now also tries public relays server-side)
  for (const url of [`/api/fund-nav?t=${Date.now()}`, `/api/mufap-nav?t=${Date.now()}`]) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) {
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('json')) {
          const data = await res.json() as CatalogPayload;
          const source = data.source || 'api';
          if (isLiveFundCatalogSource(source)) return parsePayload(data, source);
          // Stale/bundled — one more live attempt, then accept seed
          const live = await fetchAnyLiveMufap();
          if (live) return parsePayload(live, live.source);
          return parsePayload(data, source);
        }
      }
    } catch { /* try next */ }
  }

  // 3) Static JSON (when public/data is deployed)
  try {
    const staticRes = await fetch(`/data/fund-nav-catalog.json?t=${Date.now()}`, { cache: 'no-store' });
    if (staticRes.ok) {
      const text = await staticRes.text();
      if (text.trimStart().startsWith('{')) {
        const data = JSON.parse(text) as CatalogPayload;
        if (isStaleCatalogSource(data.source)) {
          const live = await fetchAnyLiveMufap();
          if (live) return parsePayload(live, live.source);
        }
        return parsePayload(data, 'static');
      }
    }
  } catch { /* fall through */ }

  // 4) Embedded in app bundle — last resort
  const embedded = await loadEmbeddedCatalog();
  if (isStaleCatalogSource(embedded.source)) {
    const live = await fetchAnyLiveMufap();
    if (live) return parsePayload(live, live.source);
  }
  return parsePayload(embedded, 'embedded');
};

/** NAV prices for held fund ids from catalog (or fresh fetch). */
export const resolveFundNavPrices = (
  fundIds: string[],
  catalog: Record<string, MutualFundRecord>
): Record<string, { nav: number; repurchase: number; offer: number }> => {
  const out: Record<string, { nav: number; repurchase: number; offer: number }> = {};
  fundIds.forEach(id => {
    const f = catalog[id];
    if (f) {
      const nav = fundValuationNav(f);
      if (nav > 0) {
        out[id] = { nav, repurchase: f.repurchase, offer: f.offer };
      }
    }
  });
  return out;
};
