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
  source === 'live' || source === 'browser-live' || source === 'proxy-live';

const FUND_LDCP_RECENT_MS = 72 * 60 * 60 * 1000;

/** Prior NAV was from a recent live sync (safe to use as yesterday for day P&L). */
export const isRecentLiveFundPrice = (isoTimestamp?: string, now = Date.now()): boolean => {
  if (!isoTimestamp) return false;
  const t = Date.parse(isoTimestamp);
  return !Number.isNaN(t) && now - t >= 0 && now - t < FUND_LDCP_RECENT_MS;
};

/**
 * Fund "yesterday NAV" for daily P&L. Catalog corrections (e.g. 48.65 → 50.77) must not
 * look like a huge one-day gain — only use stored ldcp after a recent live sync chain.
 */
export const resolveFundDayNav = (
  currentNav: number,
  storedLdcp: number | undefined,
  priceTimestamp?: string
): number => {
  if (!(currentNav > 0)) return storedLdcp && storedLdcp > 0 ? storedLdcp : 0;
  if (!(storedLdcp > 0)) return currentNav;
  if (isRecentLiveFundPrice(priceTimestamp)) return storedLdcp;
  // Stale / corrected catalog baseline → no invented day move
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

/** Fetch MUFAP HTML via /api/proxy and parse live NAV table in the browser. */
const fetchLiveMufapViaProxy = async (): Promise<CatalogPayload | null> => {
  try {
    const proxyUrl = `/api/proxy?url=${encodeURIComponent(MUFAP_NAV_URL)}&t=${Date.now()}`;
    const res = await fetch(proxyUrl, { cache: 'no-store' });
    if (!res.ok) return null;
    const html = await res.text();
    if (isMufapBlockedPage(html)) return null;
    const funds = parseMufapNavHtml(html);
    if (funds.length < 50) return null;
    return buildCatalogFromFunds(funds, html, 'proxy-live');
  } catch {
    return null;
  }
};

/** Repurchase / NAV column — what holders receive on redemption (MUFAP "NAV" column). */
export const fundValuationNav = (f: MutualFundRecord): number =>
  f.repurchase > 0 ? f.repurchase : f.nav;

/** Fetch full MUFAP NAV catalog — browser live → API → proxy → static → embedded. */
export const fetchMufapNavCatalog = async (): Promise<{
  catalog: Record<string, MutualFundRecord>;
  reportDate?: string;
  updatedAt?: string;
  source?: string;
}> => {
  // 1) Direct from MUFAP in the user's browser (works when server-side fetch is blocked)
  const browserLive = await fetchLiveMufapFromBrowser();
  if (browserLive) return parsePayload(browserLive, browserLive.source);

  // 2) Vercel API (live MUFAP fetch when Cloudflare allows)
  for (const url of [`/api/fund-nav?t=${Date.now()}`, `/api/mufap-nav?t=${Date.now()}`]) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) {
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('json')) {
          const data = await res.json() as CatalogPayload;
          const source = data.source || 'api';
          if (source === 'live') return parsePayload(data, source);
          // API returned bundled/stale catalog — try live fetches before accepting it
          const live = (await fetchLiveMufapFromBrowser()) || (await fetchLiveMufapViaProxy());
          if (live) return parsePayload(live, live.source);
          return parsePayload(data, source);
        }
      }
    } catch { /* try next */ }
  }

  // 3) Live MUFAP via proxy (works when /api/fund-nav is missing)
  const proxyLive = await fetchLiveMufapViaProxy();
  if (proxyLive) return parsePayload(proxyLive, proxyLive.source);

  // 4) Static JSON (when public/data is deployed)
  try {
    const staticRes = await fetch(`/data/fund-nav-catalog.json?t=${Date.now()}`, { cache: 'no-store' });
    if (staticRes.ok) {
      const text = await staticRes.text();
      if (text.trimStart().startsWith('{')) {
        const data = JSON.parse(text) as CatalogPayload;
        if (isStaleCatalogSource(data.source)) {
          const live = (await fetchLiveMufapFromBrowser()) || (await fetchLiveMufapViaProxy());
          if (live) return parsePayload(live, live.source);
        }
        return parsePayload(data, 'static');
      }
    }
  } catch { /* fall through */ }

  // 5) Embedded in app bundle — last resort
  const embedded = await loadEmbeddedCatalog();
  if (isStaleCatalogSource(embedded.source)) {
    const live = (await fetchLiveMufapFromBrowser()) || (await fetchLiveMufapViaProxy());
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
