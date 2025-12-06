// src/services/financials.ts

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

export const fetchCompanyFundamentals = async (ticker: string): Promise<FundamentalsData | null> => {
  const targetUrl = `https://dps.psx.com.pk/company/${ticker.toUpperCase()}`;
  
  // Use proxies to bypass CORS since we are fetching from the browser
  const proxies = [
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`,
    `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}&t=${Date.now()}`,
    `https://thingproxy.freeboard.io/fetch/${targetUrl}`,
  ];

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
        
        // Get ALL tables in the document
        const tables = Array.from(doc.querySelectorAll('table'));

        // --- Helper to parse a specific table ---
        const parseFinancialsTable = (table: HTMLTableElement): CompanyFinancials[] => {
            const data: CompanyFinancials[] = [];
            const rows = Array.from(table.querySelectorAll('tr'));
            if (rows.length === 0) return data;

            // Row 0 has years/periods
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
                    data.push({
                        year: period,
                        sales: sales[i] || '-',
                        totalIncome: income[i] || '-',
                        profitAfterTax: profit[i] || '-',
                        eps: eps[i] || '-'
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
                    data.push({
                        year: period,
                        netProfitMargin: margins[i] || '-',
                        epsGrowth: growth[i] || '-',
                        peg: peg[i] || '-'
                    });
                }
            });
            return data;
        };

        // --- Find Candidates ---
        // We look for tables containing specific keywords. 
        // If multiple are found, we assume order: 1. Annual, 2. Quarterly (common pattern)
        const financialTables = tables.filter(t => 
            t.textContent?.includes('Sales') && 
            t.textContent?.includes('Profit after Taxation')
        );

        const ratioTables = tables.filter(t => 
            t.textContent?.includes('Net Profit Margin') && 
            t.textContent?.includes('EPS Growth')
        );

        const annualFinancials = financialTables.length > 0 ? parseFinancialsTable(financialTables[0]) : [];
        const quarterlyFinancials = financialTables.length > 1 ? parseFinancialsTable(financialTables[1]) : [];

        const annualRatios = ratioTables.length > 0 ? parseRatiosTable(ratioTables[0]) : [];
        const quarterlyRatios = ratioTables.length > 1 ? parseRatiosTable(ratioTables[1]) : [];

        // If scraping failed to distinguish, we default to putting what we found in Annual
        return {
            annual: {
                financials: annualFinancials,
                ratios: annualRatios
            },
            quarterly: {
                financials: quarterlyFinancials,
                ratios: quarterlyRatios
            }
        };
      }
    } catch (e) {
      console.warn(`Proxy ${proxyUrl} failed`, e);
    }
  }
  return null;
};
