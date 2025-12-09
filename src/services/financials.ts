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
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`,
    `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}&t=${Date.now()}`,
    `https://thingproxy.freeboard.io/fetch/${targetUrl}`,
];

// --- 1. Fetch Company Fundamentals (PSX) ---
export const fetchCompanyFundamentals = async (ticker: string): Promise<FundamentalsData | null> => {
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

// --- 3. FETCH MARKET WIDE DIVIDENDS (SCSTRADE) - FIXED ---
export const fetchMarketWideDividends = async (): Promise<CompanyPayout[]> => {
  const targetUrl = `https://www.scstrade.com/MarketStatistics/MS_xDates.aspx`;
  const proxies = getProxies(targetUrl);

  for (const proxyUrl of proxies) {
    try {
      console.log(`SCSTrade attempt via: ${proxyUrl}`);
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
        
        // Find the table containing "CODE" and "XDATE" headers
        const tables = Array.from(doc.querySelectorAll('table'));
        let targetTable = null;
        let headerRowIndex = -1;

        for (const table of tables) {
            const rows = Array.from(table.querySelectorAll('tr'));
            for (let i = 0; i < Math.min(rows.length, 5); i++) {
                const text = rows[i].textContent?.toUpperCase() || '';
                // The table in your screenshot has "CODE" and "XDATE"
                if (text.includes('CODE') && (text.includes('XDATE') || text.includes('X-DATE'))) {
                    targetTable = table;
                    headerRowIndex = i;
                    break;
                }
            }
            if (targetTable) break;
        }

        if (!targetTable || headerRowIndex === -1) {
            console.warn("SCSTrade table not found");
            continue;
        }

        const rows = Array.from(targetTable.querySelectorAll('tr'));
        
        // Map Columns dynamically based on header text
        const headerCells = rows[headerRowIndex].querySelectorAll('td, th');
        let colMap = { code: -1, name: -1, dividend: -1, bonus: -1, right: -1, xdate: -1 };
        
        headerCells.forEach((cell, idx) => {
            const txt = cell.textContent?.toUpperCase().trim() || '';
            if (txt === 'CODE') colMap.code = idx;
            else if (txt === 'NAME') colMap.name = idx;
            else if (txt === 'DIVIDEND') colMap.dividend = idx;
            else if (txt === 'BONUS') colMap.bonus = idx;
            else if (txt === 'RIGHT') colMap.right = idx;
            else if (txt === 'XDATE' || txt === 'X-DATE' || txt === 'X DATE') colMap.xdate = idx;
        });

        // Fallback indices if header text varies slightly
        // Based on screenshot: CODE(0) | NAME(1) | DIVIDEND(2) | BONUS(3) | RIGHT(4) | XDATE(5)
        if (colMap.code === -1) colMap = { code: 0, name: 1, dividend: 2, bonus: 3, right: 4, xdate: 5 };

        const payouts: CompanyPayout[] = [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Iterate rows AFTER header
        for (let i = headerRowIndex + 1; i < rows.length; i++) {
            const cols = rows[i].querySelectorAll('td');
            if (!cols[colMap.code] || !cols[colMap.xdate]) continue;

            const ticker = cols[colMap.code].textContent?.trim();
            const companyName = colMap.name !== -1 ? cols[colMap.name].textContent?.trim() : '';
            const dateStr = cols[colMap.xdate].textContent?.trim();
            
            if (!ticker || !dateStr || ticker === '&nbsp;' || ticker === '') continue;

            // Extract Payout Details
            let details = '';
            const div = cols[colMap.dividend]?.textContent?.trim();
            const bonus = cols[colMap.bonus]?.textContent?.trim();
            const right = cols[colMap.right]?.textContent?.trim();

            if (div && div !== '&nbsp;' && div !== 'Nil' && div !== '') details += `Div: ${div} `;
            if (bonus && bonus !== '&nbsp;' && bonus !== 'Nil' && bonus !== '') details += `Bonus: ${bonus} `;
            if (right && right !== '&nbsp;' && right !== 'Nil' && right !== '') details += `Right: ${right}`;
            
            if (!details) continue; // Skip if no payout info

            // Parse Date: "15 Dec 2025" or "15-Dec-2025"
            let isUpcoming = false;
            try {
                // Remove invisible chars and normalize spaces
                const cleanDate = dateStr.replace(/&nbsp;/g, '').replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
                const dateParts = cleanDate.split(' '); // [15, Dec, 2025]
                
                if (dateParts.length >= 3) {
                    const day = parseInt(dateParts[0]);
                    const monthStr = dateParts[1];
                    const year = parseInt(dateParts[2]);
                    
                    const monthMap: Record<string, number> = {
                        'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
                        'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11,
                        'JAN': 0, 'FEB': 1, 'MAR': 2, 'APR': 3, 'MAY': 4, 'JUN': 5,
                        'JUL': 6, 'AUG': 7, 'SEP': 8, 'OCT': 9, 'NOV': 10, 'DEC': 11
                    };
                    
                    // Handle case-insensitive month matching
                    const monthKey = Object.keys(monthMap).find(k => k.toUpperCase() === monthStr.toUpperCase().substring(0, 3));
                    const month = monthKey ? monthMap[monthKey] : undefined;

                    if (!isNaN(day) && month !== undefined && !isNaN(year)) {
                        const xDateObj = new Date(year, month, day);
                        // Check if FUTURE or TODAY
                        if (xDateObj >= today) {
                            isUpcoming = true;
                        }
                    }
                }
            } catch (err) {
                console.warn("Date parse error", dateStr);
            }

            if (isUpcoming) {
                payouts.push({
                    ticker: ticker,
                    announceDate: companyName || 'SCSTrade', // Use Name if available
                    financialResult: '-', 
                    details: details.trim(), 
                    bookClosure: `Ex-Date: ${dateStr}`,
                    isUpcoming: true
                });
            }
        }

        // Deduplicate based on Ticker + Date
        const uniquePayouts = payouts.filter((p, index, self) =>
            index === self.findIndex((t) => (
                t.ticker === p.ticker && t.bookClosure === p.bookClosure
            ))
        );

        console.log(`SCSTrade scan success: Found ${uniquePayouts.length} future items`);
        return uniquePayouts;
      }
    } catch (e) {
      console.warn(`Proxy ${proxyUrl} failed`, e);
    }
  }
  return [];
};
