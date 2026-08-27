import { CompanyPayout, DividendAnnouncement } from '../types';
import { getValidToken } from './driveStorage';
import { fetchUrlWithFallback } from './psxData';
import { percentToRs } from '../utils/faceValues';

export interface CompanyFinancials {
  year: string;
  sales: string;
  totalIncome: string;
  profitAfterTax: string;
  eps: string;
  bookValue?: string;
  totalLiabilities?: string;
  totalEquity?: string;
  currentAssets?: string;
  currentLiabilities?: string;
  inventory?: string;
  fcf?: string;
}

export interface CompanyRatios {
  year: string;
  netProfitMargin: string;
  epsGrowth: string;
  peg: string;
}

export interface FundamentalsData {
    annual: {
        financials: CompanyFinancials[];
        ratios: CompanyRatios[];
    };
    quarterly: {
        financials: CompanyFinancials[];
        ratios: CompanyRatios[];
    };
}

export interface LatestDividendInfo {
    dividendYield: string;
    annualDividend: string;
    exDividendDate: string;
    payoutFrequency: string;
    payoutRatio: string;
    dividendGrowth: string;
}

export interface DividendHistoryRow {
    exDividendDate: string;
    cashAmount: string;
    recordDate: string;
    payDate: string;
}

export interface CompanyFundamentalItem {
    label: string;
    value: string;
}

export interface CompanyFundamentalSection {
    category: string;
    items: CompanyFundamentalItem[];
}

export interface CompanyInfoData {
    symbol: string;
    businessDescription: string;
    fundamentals: CompanyFundamentalSection[];
    latestDividend: LatestDividendInfo | null;
    dividendHistory: DividendHistoryRow[];
    source?: string;
}

// --- 1. Fetch Company Fundamentals (PSX Scraping) ---
export const fetchCompanyFundamentals = async (ticker: string): Promise<FundamentalsData | null> => {
  const targetUrl = `https://dps.psx.com.pk/company/${ticker.toUpperCase()}`;

  const html = await fetchUrlWithFallback(targetUrl);

  if (html && html.length > 500) {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");
        const tables = Array.from(doc.querySelectorAll('table'));

        const parseFinancialsTable = (table: HTMLTableElement): CompanyFinancials[] => {
            const data: CompanyFinancials[] = [];
            const rows = Array.from(table.querySelectorAll('tr'));
            if (rows.length === 0) return data;
            const headerCells = Array.from(rows[0].querySelectorAll('th, td'));
            const periods = headerCells.slice(1).map(c => c.textContent?.trim() || '');

            const getRowData = (keywords: string[]) => {
                const row = rows.find(r => {
                    const firstCell = r.querySelector('td, th');
                    const text = firstCell?.textContent?.trim().toLowerCase() || '';
                    return keywords.some(k => text.includes(k.toLowerCase()));
                });
                if (!row) return [];
                return Array.from(row.querySelectorAll('td')).slice(1).map(c => c.textContent?.trim() || '-');
            };

            const sales = getRowData(['Sales', 'Revenue']);
            const income = getRowData(['Total Income']);
            const profit = getRowData(['Profit after Taxation', 'Profit After Tax', 'Net Profit']);
            const eps = getRowData(['EPS', 'Earnings per share']);

            const bookValue = getRowData(['Break-up value', 'Book Value', 'Net Asset Value']);
            const totalLiabilities = getRowData(['Total Liabilities']);
            const totalEquity = getRowData(['Total Equity', 'Shareholders Equity']);
            const currentAssets = getRowData(['Current Assets']);
            const currentLiabilities = getRowData(['Current Liabilities']);
            const inventory = getRowData(['Inventory', 'Stock in trade', 'Stock-in-trade']);
            const fcf = getRowData(['Free Cash Flow', 'Cash from Operating', 'Net Cash Flow']);

            periods.forEach((period, i) => {
                if (period) {
                    data.push({
                        year: period,
                        sales: sales[i] || '-',
                        totalIncome: income[i] || '-',
                        profitAfterTax: profit[i] || '-',
                        eps: eps[i] || '-',
                        bookValue: bookValue[i] || '-',
                        totalLiabilities: totalLiabilities[i] || '-',
                        totalEquity: totalEquity[i] || '-',
                        currentAssets: currentAssets[i] || '-',
                        currentLiabilities: currentLiabilities[i] || '-',
                        inventory: inventory[i] || '-',
                        fcf: fcf[i] || '-'
                    });
                }
            });
            return data;
        };

        const parseRatiosTable = (table: HTMLTableElement): CompanyRatios[] => {
            const data: CompanyRatios[] = [];
            const rows = Array.from(table.querySelectorAll('tr'));
            if (rows.length === 0) return data;
            const headerCells = Array.from(rows[0].querySelectorAll('th, td'));
            const periods = headerCells.slice(1).map(c => c.textContent?.trim() || '');
            const getRowData = (keywords: string[]) => {
                const row = rows.find(r => {
                    const firstCell = r.querySelector('td, th');
                    const text = firstCell?.textContent?.trim().toLowerCase() || '';
                    return keywords.some(k => text.includes(k.toLowerCase()));
                });
                if (!row) return [];
                return Array.from(row.querySelectorAll('td')).slice(1).map(c => c.textContent?.trim() || '-');
            };
            const margins = getRowData(['Net Profit Margin']);
            const growth = getRowData(['EPS Growth']);
            const peg = getRowData(['PEG']);
            periods.forEach((period, i) => {
                if (period) {
                    data.push({ year: period, netProfitMargin: margins[i] || '-', epsGrowth: growth[i] || '-', peg: peg[i] || '-' });
                }
            });
            return data;
        };

        const financialTables = tables.filter(t => t.textContent?.includes('Sales') && t.textContent?.includes('Profit after Taxation'));
        const ratioTables = tables.filter(t => t.textContent?.includes('Net Profit Margin') && t.textContent?.includes('EPS Growth'));

        const annualFinancials = financialTables.length > 0 ? parseFinancialsTable(financialTables[0]) : [];
        const quarterlyFinancials = financialTables.length > 1 ? parseFinancialsTable(financialTables[1]) : [];
        const annualRatios = ratioTables.length > 0 ? parseRatiosTable(ratioTables[0]) : [];
        const quarterlyRatios = ratioTables.length > 1 ? parseRatiosTable(ratioTables[1]) : [];

        return { annual: { financials: annualFinancials, ratios: annualRatios }, quarterly: { financials: quarterlyFinancials, ratios: quarterlyRatios } };
    } catch (e) {
        console.warn(`Failed to parse HTML for ${ticker}`, e);
    }
  }
  return null;
};

/** Company profile + dividends via pypsx-toolkit (Python on Vercel, script locally). */
export const fetchCompanyInfo = async (ticker: string): Promise<CompanyInfoData | null> => {
  const clean = ticker.toUpperCase().replace('PSX:', '').trim();
  if (!clean) return null;

  try {
    const res = await fetch(
      `/api/pypsx?mode=company&symbol=${encodeURIComponent(clean)}&t=${Date.now()}`
    );
    if (!res.ok) {
      console.warn(`Company info fetch failed for ${clean}:`, res.status);
      return null;
    }
    const json = await res.json();
    if (json?.error) {
      console.warn(`Company info error for ${clean}:`, json.error);
      return null;
    }
    return json as CompanyInfoData;
  } catch (e) {
    console.warn(`Company info fetch failed for ${clean}`, e);
    return null;
  }
};

// --- 2. Fetch Market Wide Dividends from Google Sheet ---
export const fetchMarketWideDividends = async (): Promise<CompanyPayout[]> => {
  const SPREADSHEET_ID = "1Z-Qd8g__vCqRkaSWpcIx-qf6uKgE9ZxO4Bw2FFRWr9g";
  const RANGE = "Sheet1!A3:F";

  try {
    const token = await getValidToken();
    if (!token) {
      console.warn('Upcoming dividends: sign in with Google to load the dividend sheet.');
      return [];
    }

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${RANGE}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!response.ok) throw new Error(`Google Sheets API Error: ${response.status}`);

    const json = await response.json();
    const rows = json.values || [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return rows.map((row: any[]) => {
        const ticker = (row[0] || 'Unknown').toString().trim().toUpperCase();
        
        // Grab Dividend, Bonus, and Right from their respective columns
        const rawDiv = (row[2] || '0').toString();
        const rawBonus = (row[3] || '').toString().trim();
        const rawRight = (row[4] || '').toString().trim();

        const cleanPercent = parseFloat(rawDiv.replace('%', ''));
        // Dividends are a % of FACE VALUE. Most PSX stocks are Rs. 10 face value
        // (so percent/10), but low-face-value stocks (Rs. 5 / 3.5 / 1) pay less.
        const pkrAmount = percentToRs(cleanPercent, ticker);
        const dateStr = row[5] || '';
        const xDate = new Date(dateStr);
        xDate.setHours(0, 0, 0, 0);

        if (isNaN(xDate.getTime()) || xDate < today) return null;

        const isDueToday = xDate.getTime() === today.getTime();

        // If there is no cash dividend, pass "-" so the UI relies purely on Bonus/Right chips
        const detailsText = (isNaN(pkrAmount) || pkrAmount <= 0) ? '-' : `Div: Rs. ${pkrAmount.toFixed(2)}`;

        return {
            ticker: ticker || 'Unknown',
            announceDate: row[1] || '-',
            financialResult: '-',
            details: detailsText,
            bonus: rawBonus || '-',
            right: rawRight || '-',
            bookClosure: `Ex-Date: ${dateStr}`,
            isUpcoming: true,
            isDueToday: isDueToday
        };
    })
    .filter((p): p is CompanyPayout & { isDueToday: boolean } => p !== null)
    .sort((a, b) => {
        const dateA = new Date(a.bookClosure.replace('Ex-Date: ', ''));
        const dateB = new Date(b.bookClosure.replace('Ex-Date: ', ''));
        return dateA.getTime() - dateB.getTime();
    });

  } catch (e) {
    console.warn('Google Sheet fetch failed:', e);
    return [];
  }
};

// --- 2b. Dividend Scanner source: read the SAME sheet, backward-looking window ---
// Used by the Dividend Scanner as its PRIMARY source (deterministic + correct face value).
// Unlike fetchMarketWideDividends (which keeps only FUTURE ex-dates for display), this
// returns PAST dividends within the lookback window so the scanner can catch ones you
// already earned. THROWS on auth/HTTP failure so the caller can fall back to AI search.
export const fetchDividendsForScan = async (months: number = 6): Promise<DividendAnnouncement[]> => {
  const SPREADSHEET_ID = "1Z-Qd8g__vCqRkaSWpcIx-qf6uKgE9ZxO4Bw2FFRWr9g";
  const RANGE = "Sheet1!A3:F";

  const token = await getValidToken();
  if (!token) throw new Error("SHEET_AUTH_REQUIRED"); // -> triggers AI fallback

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${RANGE}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`SHEET_HTTP_${response.status}`); // -> triggers AI fallback

  const json = await response.json();
  const rows = json.values || [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - Math.round(months * 31)); // lookback window

  const pad = (n: number) => String(n).padStart(2, '0');
  const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  return rows.map((row: any[]): DividendAnnouncement | null => {
      const ticker = (row[0] || '').toString().trim().toUpperCase();
      if (!ticker) return null;

      const cleanPercent = parseFloat((row[2] || '0').toString().replace('%', ''));
      const amount = percentToRs(cleanPercent, ticker); // face-value aware
      if (!isFinite(amount) || amount <= 0) return null;

      const ex = new Date(row[5] || '');
      ex.setHours(0, 0, 0, 0);
      if (isNaN(ex.getTime())) return null;
      // Backward-looking: only dividends whose ex-date already passed, within the window.
      if (ex > today || ex < cutoff) return null;

      return {
          ticker,
          amount: Number(amount.toFixed(2)),
          exDate: toISO(ex),            // normalized YYYY-MM-DD for the scanner's date logic
          type: 'Interim',             // sheet doesn't distinguish; label only
          period: undefined,
      };
  })
  .filter((d): d is DividendAnnouncement => d !== null)
  .sort((a, b) => (a.exDate < b.exDate ? 1 : -1)); // newest first
};

// --- 3. Connect to Google Sheets Bridge (For Fair Value Calculator) ---
export const syncWithGoogleSheet = async (ticker: string) => {
  const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzbUM26wtJDrXc_iW6JsyjZYcRhMZBkLgyX1Jfll1y16WrhkpSk9XjTxIpGTkQqD1NEhQ/exec";

  try {
    const response = await fetch(`${GOOGLE_SCRIPT_URL}?ticker=${ticker.toLowerCase()}`, {
        redirect: 'follow'
    });
    if (!response.ok) return null;

    return await response.json();
  } catch (e) {
    console.error("Google Sheet Sync Failed:", e);
    return null;
  }
};

// --- 4. Company announcements (scraped from each PSX company page) ---
export interface CompanyAnnouncement {
  ticker: string;
  date: string;   // as shown on PSX (e.g. "Oct 29, 2024")
  ts: number;     // parsed timestamp for sorting (0 if unparseable)
  title: string;
  pdfUrl: string;
  kind: 'Board Meeting' | 'Result' | 'Dividend' | 'Other';
}

const classifyAnnouncement = (title: string): CompanyAnnouncement['kind'] => {
  const t = title.toLowerCase();
  if (t.includes('board meeting')) return 'Board Meeting';
  if (t.includes('dividend') || t.includes('bonus') || t.includes('payout') || t.includes('book closure') || t.includes('entitlement')) return 'Dividend';
  if (t.includes('financial result') || t.includes('results') || t.includes('accounts') || t.includes('quarter') || t.includes('annual report')) return 'Result';
  return 'Other';
};

export const fetchCompanyAnnouncements = async (ticker: string): Promise<CompanyAnnouncement[]> => {
  const url = `https://dps.psx.com.pk/company/${ticker.toUpperCase()}`;
  const html = await fetchUrlWithFallback(url);
  if (!html || html.length < 500) return [];

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const links = Array.from(doc.querySelectorAll('a[href*="download/document"]'));
    const seen = new Set<string>();
    const out: CompanyAnnouncement[] = [];

    links.forEach((a) => {
      const href = a.getAttribute('href') || '';
      if (!href || seen.has(href)) return;
      const row = a.closest('tr');
      if (!row) return;
      const cells = Array.from(row.querySelectorAll('td')).map((c) => (c.textContent || '').trim());
      if (cells.length < 2) return;

      const date = cells[0] || '';
      // Title = the longest non-date, non-"View/PDF" cell.
      const title =
        cells.slice(1).filter((c) => c && !/^(view|pdf)$/i.test(c)).sort((x, y) => y.length - x.length)[0] ||
        cells[1] || '';
      if (!title) return;

      seen.add(href);
      const ts = Date.parse(date);
      out.push({
        ticker: ticker.toUpperCase(),
        date,
        ts: isNaN(ts) ? 0 : ts,
        title,
        pdfUrl: href.startsWith('http') ? href : `https://dps.psx.com.pk${href}`,
        kind: classifyAnnouncement(title),
      });
    });

    return out.sort((a, b) => b.ts - a.ts).slice(0, 12);
  } catch (e) {
    console.warn(`Announcements parse failed for ${ticker}`, e);
    return [];
  }
};

// --- Upcoming Board Meetings (market-wide) -------------------------------
// Source: public "BoardMeetings" tab of the X-Dates workbook (gid 516127681).
// Columns: company_code, company_name, sector_name, bm_date, bm_time, bm_place,
//          bm_year, bm_quarter_number
export interface BoardMeeting {
  ticker: string;
  name: string;
  sector: string;
  date: Date;
  time: string;    // e.g. "9.30 A.M"
  place: string;   // e.g. "Lahore"
  quarter: string; // bm_quarter_number (often blank)
  daysTo: number;
}

const BOARD_MEETINGS_CSV =
  'https://docs.google.com/spreadsheets/d/1Z-Qd8g__vCqRkaSWpcIx-qf6uKgE9ZxO4Bw2FFRWr9g/gviz/tq?tqx=out:csv&gid=516127681';

// Minimal CSV parser that respects quoted fields and escaped quotes ("").
const parseCSV = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
};

// Parse "M/D/YYYY" (as stored in the sheet) into a local Date, or null.
const parseSheetDate = (s: string): Date | null => {
  const parts = (s || '').trim().split('/');
  if (parts.length !== 3) return null;
  const m = parseInt(parts[0], 10);
  const d = parseInt(parts[1], 10);
  const y = parseInt(parts[2], 10);
  if (!m || !d || !y) return null;
  const dt = new Date(y, m - 1, d);
  dt.setHours(0, 0, 0, 0);
  return isNaN(dt.getTime()) ? null : dt;
};

export const fetchBoardMeetings = async (): Promise<BoardMeeting[]> => {
  try {
    const raw = await fetchUrlWithFallback(BOARD_MEETINGS_CSV);
    if (!raw) return [];

    const rows = parseCSV(raw);
    if (rows.length < 2) return [];

    const header = rows[0].map(h => h.trim().toLowerCase());
    const idx = (name: string) => header.indexOf(name);
    const ci = {
      code: idx('company_code'),
      name: idx('company_name'),
      sector: idx('sector_name'),
      date: idx('bm_date'),
      time: idx('bm_time'),
      place: idx('bm_place'),
      quarter: idx('bm_quarter_number'),
    };
    if (ci.code === -1 || ci.date === -1) return [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const out: BoardMeeting[] = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const ticker = (r[ci.code] || '').trim().toUpperCase();
      if (!ticker) continue;
      const date = parseSheetDate(r[ci.date] || '');
      if (!date) continue;
      const daysTo = Math.round((date.getTime() - today.getTime()) / 864e5);
      out.push({
        ticker,
        name: (r[ci.name] || '').trim(),
        sector: (r[ci.sector] || '').trim(),
        date,
        time: (r[ci.time] || '').trim().replace(/\s+/g, ' '),
        place: (r[ci.place] || '').trim(),
        quarter: ci.quarter !== -1 ? (r[ci.quarter] || '').trim() : '',
        daysTo,
      });
    }

    // Keep upcoming (today onwards), soonest first.
    return out
      .filter(m => m.daysTo >= 0)
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  } catch (e) {
    console.error('fetchBoardMeetings failed', e);
    return [];
  }
};
