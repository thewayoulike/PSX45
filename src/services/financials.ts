import { CompanyPayout } from '../types';

// --- Interfaces for Financials ---
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

// --- Helper: Proxy Rotator ---
const getProxies = (targetUrl: string) => [
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`,
    `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}&t=${Date.now()}`,
    `https://thingproxy.freeboard.io/fetch/${targetUrl}`,
];

// --- 1. Fetch Company Fundamentals (from PSX) ---
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

// --- 2. Fetch Specific Company Payouts (from PSX Company Page) ---
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

// --- 3. UPDATED: Fetch Market Wide Dividends (from SCSTrade xDates) ---
export const fetchMarketWideDividends = async (): Promise<CompanyPayout[]> => {
  const targetUrl = `https://www.scstrade.com/MarketStatistics/MS_xDates.aspx`;
  const proxies = getProxies(targetUrl);

  for (const proxyUrl of proxies) {
    try {
      console.log(`Trying proxy for SCSTrade: ${proxyUrl}`);
      const response = await fetch(proxyUrl);
      if (!response.ok) continue;

      let html = '';
      if (proxyUrl.includes('allorigins')) {
        const data = await response.json();
        html = data.contents;
      } else {
        html = await response.text();
      }

      if (html && html.length > 1000) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");
        
        // Find the table containing "CODE" and "XDATE"
        const tables = Array.from(doc.querySelectorAll('table'));
        const mainTable = tables.find(t => 
            t.textContent?.toUpperCase().includes('CODE') && 
            t.textContent?.toUpperCase().includes('XDATE')
        );

        if (!mainTable) {
            console.warn("SCSTrade: Table not found in HTML");
            continue;
        }

        const payouts: CompanyPayout[] = [];
        const rows = Array.from(mainTable.querySelectorAll('tr'));
        
        // 1. Identify Column Indices from Header
        let colMap = { ticker: -1, dividend: -1, bonus: -1, right: -1, xdate: -1 };
        
        // Assume first row is header
        const headerCells = rows[0].querySelectorAll('th, td');
        headerCells.forEach((cell, idx) => {
            const txt = cell.textContent?.toUpperCase().trim() || '';
            if (txt === 'CODE') colMap.ticker = idx;
            if (txt === 'DIVIDEND') colMap.dividend = idx;
            if (txt === 'BONUS') colMap.bonus = idx;
            if (txt === 'RIGHT') colMap.right = idx;
            if (txt === 'XDATE' || txt === 'X-DATE') colMap.xdate = idx;
        });

        // Fallback indices if header detection failed (based on typical structure)
        if (colMap.ticker === -1) colMap = { ticker: 0, dividend: 2, bonus: 3, right: 4, xdate: 5 };

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // 2. Parse Data Rows (skip header)
        for (let i = 1; i < rows.length; i++) {
            const cols = rows[i].querySelectorAll('td');
            if (cols.length > colMap.xdate) {
                const ticker = cols[colMap.ticker]?.textContent?.trim() || 'Unknown';
                const divAmt = cols[colMap.dividend]?.textContent?.trim() || '';
                const bonus = cols[colMap.bonus]?.textContent?.trim() || '';
                const right = cols[colMap.right]?.textContent?.trim() || '';
                const dateStr = cols[colMap.xdate]?.textContent?.trim() || '';

                if (!ticker || ticker === '&nbsp;' || !dateStr) continue;

                // Build Details String
                const detailsParts = [];
                if (divAmt && divAmt !== '&nbsp;') detailsParts.push(`Div: ${divAmt}`);
                if (bonus && bonus !== '&nbsp;') detailsParts.push(`Bonus: ${bonus}`);
                if (right && right !== '&nbsp;') detailsParts.push(`Right: ${right}`);
                
                if (detailsParts.length === 0) continue; // Skip if no payout info

                const details = detailsParts.join(' | ');

                // Parse Date: "15 Dec 2025"
                let isUpcoming = false;
                try {
                    // Remove potential extra spaces or invisible chars
                    const cleanDate = dateStr.replace(/&nbsp;/g, '').replace(/\s+/g, ' ').trim();
                    const dateParts = cleanDate.split(' '); // [15, Dec, 2025]
                    
                    if (dateParts.length === 3) {
                        const day = parseInt(dateParts[0]);
                        const monthStr = dateParts[1];
                        const year = parseInt(dateParts[2]);
                        
                        const monthMap: Record<string, number> = {
                            'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
                            'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11,
                            'JAN': 0, 'FEB': 1, 'MAR': 2, 'APR': 3, 'MAY': 4, 'JUN': 5,
                            'JUL': 6, 'AUG': 7, 'SEP': 8, 'OCT': 9, 'NOV': 10, 'DEC': 11
                        };
                        
                        const month = monthMap[monthStr.substring(0, 3)];
                        
                        if (!isNaN(day) && month !== undefined && !isNaN(year)) {
                            const xDateObj = new Date(year, month, day);
                            // Include if today or future
                            if (xDateObj >= today) {
                                isUpcoming = true;
                            }
                        }
                    }
                } catch (e) {
                    console.warn('Date parse error', dateStr);
                }

                if (isUpcoming) {
                    payouts.push({
                        ticker: ticker,
                        announceDate: 'SCSTrade',
                        financialResult: '-', 
                        details: details, 
                        bookClosure: `Ex-Date: ${dateStr}`,
                        isUpcoming: true
                    });
                }
            }
        }

        // Deduplicate based on Ticker + Date
        const uniquePayouts = payouts.filter((p, index, self) =>
            index === self.findIndex((t) => (
                t.ticker === p.ticker && t.bookClosure === p.bookClosure
            ))
        );

        console.log(`SCSTrade scan success: Found ${uniquePayouts.length} items`);
        return uniquePayouts;
      }
    } catch (e) {
      console.warn(`Proxy ${proxyUrl} failed for SCSTrade`, e);
    }
  }
  return [];
};
