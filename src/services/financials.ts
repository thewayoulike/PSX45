import { CompanyPayout, CompanyFinancials, CompanyRatios, FundamentalsData } from '../types';

// --- Interfaces & Helpers (Keep existing) ---
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

// --- 1. Fetch Company Fundamentals (PSX) ---
// (Keep this function exactly as it was)
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
    } catch (e) { console.warn(`Proxy ${proxyUrl} failed`, e); }
  }
  return null;
};

// --- 2. Fetch Specific Company Payouts (PSX) ---
// (Keep this function exactly as it was)
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
    } catch (e) { console.warn(`Proxy ${proxyUrl} failed for payouts`, e); }
  }
  return [];
};

// --- 3. FETCH MARKET WIDE DIVIDENDS (SCSTRADE) - REWRITTEN TO USE API ---
export const fetchMarketWideDividends = async (): Promise<CompanyPayout[]> => {
  const targetUrl = "https://www.scstrade.com/MarketStatistics/MS_xDates.aspx/chartact";
  const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;

  try {
    const response = await fetch(proxyUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
        "Accept": "application/json, text/javascript, */*; q=0.01"
      },
      body: JSON.stringify({ par: "" }) 
    });

    if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
    }

    const json = await response.json();
    const rawData = json.d || []; 

    const payouts: CompanyPayout[] = rawData.map((item: any) => {
        let details = "";
        if (item.bm_dividend) details += `Div: ${item.bm_dividend} `;
        if (item.bm_bonus) details += `Bonus: ${item.bm_bonus} `;
        if (item.bm_right_per) details += `Right: ${item.bm_right_per}`;
        
        let isUpcoming = true;
        const dateStr = item.bm_bc_exp || "";
        
        try {
            // FIX: Robust Date Parsing
            // 1. Remove HTML entities and extra spaces
            // 2. Replace dashes/dots with spaces to standardize: "15-Dec-2024" -> "15 Dec 2024"
            const cleanDate = dateStr.replace(/&nbsp;/g, '').replace(/[-./]/g, ' ').trim();
            const dateParts = cleanDate.split(/\s+/); // Split by any whitespace

            if (dateParts.length >= 3) {
                const day = parseInt(dateParts[0]);
                const monthStr = dateParts[1];
                let year = parseInt(dateParts[2]);

                // FIX: Handle 2-digit years (e.g. '25' -> 2025)
                if (year < 100) year += 2000;

                const monthMap: Record<string, number> = { 'JAN':0,'FEB':1,'MAR':2,'APR':3,'MAY':4,'JUN':5,'JUL':6,'AUG':7,'SEP':8,'OCT':9,'NOV':10,'DEC':11 };
                const month = monthMap[monthStr.toUpperCase().substring(0,3)];
                
                if (!isNaN(day) && month !== undefined && !isNaN(year)) {
                    const xDate = new Date(year, month, day);
                    const today = new Date();
                    today.setHours(0,0,0,0);
                    
                    // Filter: Keep future dates AND recent past (last 14 days)
                    const cutoff = new Date(today);
                    cutoff.setDate(cutoff.getDate() - 14);
                    
                    if (xDate < cutoff) isUpcoming = false;
                }
            }
        } catch (e) { /* ignore parse error */ }

        if (!isUpcoming) return null;

        return {
            ticker: item.company_code,
            announceDate: item.company_name, 
            financialResult: '-',
            details: details.trim() || 'Book Closure',
            bookClosure: `Ex-Date: ${dateStr}`,
            isUpcoming: true
        };
    }).filter((p: any) => p !== null);

    return payouts;

  } catch (e) {
    console.error("SCSTrade API Fetch Failed:", e);
    return [];
  }
};
