import { fetchUrlWithFallback } from './psxData';
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

/** Fetch full MUFAP NAV catalog (automatic sync). */
export const fetchMufapNavCatalog = async (): Promise<{
  catalog: Record<string, MutualFundRecord>;
  reportDate?: string;
}> => {
  const html = await fetchUrlWithFallback(MUFAP_NAV_URL, 2000);
  if (!html) throw new Error('Could not reach MUFAP. Try again later or add a Scrape.do key in API Settings.');

  const funds = parseMufapNavHtml(html);
  if (funds.length === 0) {
    throw new Error('MUFAP page loaded but no fund rows were found. The site layout may have changed.');
  }

  const catalog: Record<string, MutualFundRecord> = {};
  funds.forEach(f => { catalog[f.id] = f; });

  const dateMatch = html.match(/Report Date:\s*([A-Za-z]+\s+\d{1,2},\s+\d{4})/i)
    || html.match(/Report Date[:\s]+([^<\n|]+)/i);
  const reportDate = dateMatch?.[1]?.trim();

  saveFundCatalog(catalog);
  return { catalog, reportDate };
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
