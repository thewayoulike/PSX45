import { CompanyPayout } from '../types';
import { getValidToken } from './driveStorage';
import { fetchUrlWithFallback } from './psxData'; 

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
        const rawDiv = row[2] || '0';
        const cleanPercent = parseFloat(rawDiv.replace('%', ''));
        const pkrAmount = cleanPercent / 10;
        const dateStr = row[5] || '';
        const xDate = new Date(dateStr);
        xDate.setHours(0, 0, 0, 0);

        if (isNaN(xDate.getTime()) || xDate < today) return null; 

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

// --- 3. Connect to Google Sheets Bridge (For Fair Value Calculator) ---
export const syncWithGoogleSheet = async (ticker: string) => {
  // ⚠️ IMPORTANT: PASTE YOUR GOOGLE WEB APP URL HERE:
  const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/YOUR_URL_HERE/exec"; 
  
  try {
    const response = await fetch(`${GOOGLE_SCRIPT_URL}?ticker=${ticker.toLowerCase()}`);
    if (!response.ok) return null;
    
    return await response.json();
  } catch (e) {
    console.error("Google Sheet Sync Failed:", e);
    return null;
  }
};
