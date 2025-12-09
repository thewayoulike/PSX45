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
  // Use the secret endpoint found in the HTML source code
  const targetUrl = "https://www.scstrade.com/MarketStatistics/MS_xDates.aspx/chartact";
  
  // We use corsproxy.io because it supports POST requests with JSON bodies well
  const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;

  try {
    console.log(`Connecting to SCSTrade API via proxy...`);
    
    const response = await fetch(proxyUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // These headers mimic a real browser request to avoid blocking
        "X-Requested-With": "XMLHttpRequest",
        "Accept": "application/json, text/javascript, */*; q=0.01"
      },
      // The script in your HTML showed: postData:{ 'par': par} where par is usually empty
      body: JSON.stringify({ par: "" }) 
    });

    if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
    }

    const json = await response.json();
    
    // ASP.NET WebMethods wrap the result in a 'd' property
    const rawData = json.d || []; 

    console.log(`SCSTrade API Success: ${rawData.length} records found`);

    // Map the raw API data to our app's structure
    // API Columns from source: company_code, company_name, bm_dividend, bm_bonus, bm_right_per, bm_bc_exp
    const payouts: CompanyPayout[] = rawData.map((item: any) => {
        let details = "";
        if (item.bm_dividend) details += `Div: ${item.bm_dividend} `;
        if (item.bm_bonus) details += `Bonus: ${item.bm_bonus} `;
        if (item.bm_right_per) details += `Right: ${item.bm_right_per}`;
        
        // Parse date for filtering (e.g. "15 Dec 2025")
        let isUpcoming = true;
        const dateStr = item.bm_bc_exp;
        
        try {
            const cleanDate = dateStr.replace(/&nbsp;/g, '').trim();
            const dateParts = cleanDate.split(' ');
            if (dateParts.length >= 3) {
                const day = parseInt(dateParts[0]);
                const monthStr = dateParts[1];
                const year = parseInt(dateParts[2]);
                const monthMap: Record<string, number> = { 'JAN':0,'FEB':1,'MAR':2,'APR':3,'MAY':4,'JUN':5,'JUL':6,'AUG':7,'SEP':8,'OCT':9,'NOV':10,'DEC':11 };
                const month = monthMap[monthStr.toUpperCase().substring(0,3)];
                
                if (!isNaN(day) && month !== undefined) {
                    const xDate = new Date(year, month, day);
                    const today = new Date();
                    today.setHours(0,0,0,0);
                    // Filter: Keep future dates AND recent past (last 7 days) just in case
                    const cutoff = new Date(today);
                    cutoff.setDate(cutoff.getDate() - 7);
                    
                    if (xDate < cutoff) isUpcoming = false;
                }
            }
        } catch (e) { /* ignore date parse error */ }

        if (!isUpcoming) return null;

        return {
            ticker: item.company_code,
            announceDate: item.company_name, // Using Name here as it's useful context
            financialResult: '-',
            details: details.trim() || 'Book Closure',
            bookClosure: `Ex-Date: ${dateStr}`,
            isUpcoming: true
        };
    }).filter((p: any) => p !== null); // Remove nulls (old dates)

    return payouts;

  } catch (e) {
    console.error("SCSTrade API Fetch Failed:", e);
    return [];
  }
};
