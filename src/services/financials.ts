import { CompanyPayout, CompanyFinancials, CompanyRatios, FundamentalsData } from '../types';
import { getValidToken } from './driveStorage';

export interface CompanyFinancials {
  year: string;
  sales: string;
  totalIncome: string;
  profitAfterTax: string;
  eps: string;
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

const getProxies = (targetUrl: string) => [
    `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}&t=${Date.now()}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`,
    `https://thingproxy.freeboard.io/fetch/${targetUrl}`,
];

// --- 1. Fetch Company Fundamentals (PSX Scraping) ---
export const fetchCompanyFundamentals = async (ticker: string): Promise<FundamentalsData | null> => {
  const targetUrl = `https://dps.psx.com.pk/company/${ticker.toUpperCase()}`;
  const proxies = getProxies(targetUrl);

  for (const proxyUrl of proxies) {
    try {
      const response = await fetch(proxyUrl);
      if (!response.ok) continue;

      let html = '';
      if (proxyUrl.includes('allorigins')) {
        const data = await response.json();
        html = data.contents;
      } else {
        html = await response.text();
      }

      if (html && html.length > 500) {
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
                    const text = firstCell?.textContent?.trim() || '';
                    return keywords.some(k => text.includes(k));
                });
                if (!row) return [];
                return Array.from(row.querySelectorAll('td')).slice(1).map(c => c.textContent?.trim() || '-');
            };
            const sales = getRowData(['Sales']);
            const income = getRowData(['Total Income']);
            const profit = getRowData(['Profit after Taxation', 'Profit After Tax']);
            const eps = getRowData(['EPS']);
            periods.forEach((period, i) => {
                if (period) {
                    data.push({ year: period, sales: sales[i] || '-', totalIncome: income[i] || '-', profitAfterTax: profit[i] || '-', eps: eps[i] || '-' });
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
                    const text = firstCell?.textContent?.trim() || '';
                    return keywords.some(k => text.includes(k));
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
      }
    } catch (e) { console.warn(`Proxy failed`, e); }
  }
  return null;
};

// --- 2. Fetch Market Wide Dividends from Google Sheet ---
export const fetchMarketWideDividends = async (): Promise<CompanyPayout[]> => {
  const SPREADSHEET_ID = "1Z-Qd8g__vCqRkaSWpcIx-qf6uKgE9ZxO4Bw2FFRWr9g";
  const RANGE = "Sheet1!A3:F"; 

  try {
    const token = await getValidToken();
    if (!token) throw new Error("Authentication required for Google Sheets");

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
        // Percentage to PKR Conversion (Face Value 10 Rs)
        const rawDiv = row[2] || '0';
        const cleanPercent = parseFloat(rawDiv.replace('%', ''));
        const pkrAmount = cleanPercent / 10;

        // Parse Date (Column F / Index 5)
        const dateStr = row[5] || '';
        const xDate = new Date(dateStr);
        xDate.setHours(0, 0, 0, 0);

        // Filter: Remove entries before today
        if (isNaN(xDate.getTime()) || xDate < today) {
            return null; 
        }

        // Today Check for Highlight
        const isDueToday = xDate.getTime() === today.getTime();

        return {
            ticker: row[0] || 'Unknown',
            announceDate: row[1] || '-',
            financialResult: '-',
            details: isNaN(pkrAmount) ? 'Dividend' : `Div: Rs. ${pkrAmount.toFixed(2)}`, 
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
    console.error("Google Sheet Fetch Failed:", e);
    return [];
  }
};

// --- 3. Per-Company Payouts (Fallback PSX Logic) ---
export const fetchCompanyPayouts = async (ticker: string): Promise<CompanyPayout[]> => {
  const targetUrl = `https://dps.psx.com.pk/company/${ticker.toUpperCase()}`;
  const proxies = getProxies(targetUrl);

  for (const proxyUrl of proxies) {
    try {
      const response = await fetch(proxyUrl);
      if (!response.ok) continue;
      let html = '';
      if (proxyUrl.includes('allorigins')) { const data = await response.json(); html = data.contents; } else { html = await response.text(); }

      if (html && html.length > 500) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");
        const tables = Array.from(doc.querySelectorAll('table'));
        const payoutTable = tables.find(t => t.querySelector('th')?.textContent?.includes('Financial Results') && t.querySelector('th')?.textContent?.includes('Book Closure'));

        if (!payoutTable) return [];
        const payouts: CompanyPayout[] = [];
        const rows = Array.from(payoutTable.querySelectorAll('tr')).slice(1); 
        const today = new Date(); today.setHours(0, 0, 0, 0);

        rows.forEach(row => {
            const cols = row.querySelectorAll('td');
            if (cols.length >= 4) {
                const announceDate = cols[0].textContent?.trim() || '-';
                const financialResult = cols[1].textContent?.trim() || '-';
                const details = cols[2].textContent?.trim() || '-';
                const bookClosure = cols[3].textContent?.trim() || '-';
                let isUpcoming = false;
                if (bookClosure.includes('-')) {
                    const [startStr] = bookClosure.split('-');
                    const parts = startStr.trim().split('/');
                    if (parts.length === 3) {
                        const bookStart = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
                        if (bookStart >= today) isUpcoming = true;
                    }
                }
                payouts.push({ ticker: ticker.toUpperCase(), announceDate, financialResult, details, bookClosure, isUpcoming });
            }
        });
        return payouts;
      }
    } catch (e) { console.warn(`Proxy failed for payouts`, e); }
  }
  return [];
};
