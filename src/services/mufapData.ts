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

/** Fetch full MUFAP NAV catalog — API → static file → embedded bundle. */
export const fetchMufapNavCatalog = async (): Promise<{
  catalog: Record<string, MutualFundRecord>;
  reportDate?: string;
  updatedAt?: string;
  source?: string;
}> => {
  // 1) Vercel API (when deployed)
  for (const url of [`/api/fund-nav?t=${Date.now()}`, `/api/mufap-nav?t=${Date.now()}`]) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) {
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('json')) return parsePayload(await res.json(), 'api');
      }
    } catch { /* try next */ }
  }

  // 2) Static JSON (when public/data is deployed and rewrite allows it)
  try {
    const staticRes = await fetch(`/data/fund-nav-catalog.json?t=${Date.now()}`, { cache: 'no-store' });
    if (staticRes.ok) {
      const text = await staticRes.text();
      if (text.trimStart().startsWith('{')) {
        return parsePayload(JSON.parse(text), 'static');
      }
    }
  } catch { /* fall through */ }

  // 3) Embedded in app bundle — always works after build
  return parsePayload(await loadEmbeddedCatalog(), 'embedded');
};

/** NAV prices for held fund ids from catalog (or fresh fetch). */
export const resolveFundNavPrices = (
  fundIds: string[],
  catalog: Record<string, MutualFundRecord>
): Record<string, { nav: number; repurchase: number; offer: number }> => {
  const out: Record<string, { nav: number; repurchase: number; offer: number }> = {};
  fundIds.forEach(id => {
    const f = catalog[id];
    if (f && f.nav > 0) {
      out[id] = { nav: f.nav, repurchase: f.repurchase, offer: f.offer };
    }
  });
  return out;
};
