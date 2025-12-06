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

export const fetchCompanyFundamentals = async (ticker: string) => {
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

        // --- 1. Extract Financials ---
        const financialData: CompanyFinancials[] = [];
        
        // Strategy: Find the table that explicitly contains "Sales" and "Profit after Taxation"
        const financialsTable = tables.find(t => 
            t.textContent?.includes('Sales') && 
            t.textContent?.includes('Profit after Taxation')
        );
        
        if (financialsTable) {
            const rows = Array.from(financialsTable.querySelectorAll('tr'));
            
            // Row 0 has years (Skip the first cell which is empty/label)
            const headerCells = Array.from(rows[0].querySelectorAll('th, td'));
            const years = headerCells.slice(1).map(c => c.textContent?.trim() || '');
            
            // Helper to get row data by fuzzy text matching
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
            const profit = getRowData(['Profit after Taxation']);
            const eps = getRowData(['EPS']);

            years.forEach((year, i) => {
                // Basic validation to ensure 'year' looks like a year (4 digits)
                if (year && year.match(/\d{4}/)) {
                    financialData.push({
                        year,
                        sales: sales[i] || '-',
                        totalIncome: income[i] || '-',
                        profitAfterTax: profit[i] || '-',
                        eps: eps[i] || '-'
                    });
                }
            });
        }

        // --- 2. Extract Ratios ---
        const ratiosData: CompanyRatios[] = [];
        
        // Strategy: Find table containing "Net Profit Margin"
        const ratiosTable = tables.find(t => 
            t.textContent?.includes('Net Profit Margin') && 
            t.textContent?.includes('EPS Growth')
        );
        
        if (ratiosTable) {
            const rows = Array.from(ratiosTable.querySelectorAll('tr'));
            const headerCells = Array.from(rows[0].querySelectorAll('th, td'));
            const years = headerCells.slice(1).map(c => c.textContent?.trim() || '');

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

            years.forEach((year, i) => {
                if (year && year.match(/\d{4}/)) {
                    ratiosData.push({
                        year,
                        netProfitMargin: margins[i] || '-',
                        epsGrowth: growth[i] || '-',
                        peg: peg[i] || '-'
                    });
                }
            });
        }

        return { financials: financialData, ratios: ratiosData };
      }
    } catch (e) {
      console.warn(`Proxy ${proxyUrl} failed`, e);
    }
  }
  return null;
};
