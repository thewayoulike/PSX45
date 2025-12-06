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
        
        // --- 1. Extract Financials ---
        const financialData: CompanyFinancials[] = [];
        // Find header that contains "Financials"
        const financialsHeader = Array.from(doc.querySelectorAll('h4')).find(h => h.textContent?.includes('Financials'));
        
        if (financialsHeader && financialsHeader.parentElement) {
            const table = financialsHeader.parentElement.querySelector('table');
            if (table) {
                const rows = Array.from(table.querySelectorAll('tr'));
                // Row 0 has years
                const years = Array.from(rows[0].querySelectorAll('th, td')).slice(1).map(c => c.textContent?.trim() || '');
                
                // Helper to get row data by label
                const getRowData = (labelPart: string) => {
                    const row = rows.find(r => r.querySelector('td')?.textContent?.includes(labelPart));
                    if (!row) return [];
                    return Array.from(row.querySelectorAll('td')).slice(1).map(c => c.textContent?.trim() || '-');
                };

                const sales = getRowData('Sales');
                const income = getRowData('Total Income');
                const profit = getRowData('Profit after Taxation');
                const eps = getRowData('EPS');

                years.forEach((year, i) => {
                    if (year) {
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
        }

        // --- 2. Extract Ratios ---
        const ratiosData: CompanyRatios[] = [];
        const ratiosHeader = Array.from(doc.querySelectorAll('h4')).find(h => h.textContent?.includes('Ratios'));
        
        if (ratiosHeader && ratiosHeader.parentElement) {
            const table = ratiosHeader.parentElement.querySelector('table');
            if (table) {
                const rows = Array.from(table.querySelectorAll('tr'));
                const years = Array.from(rows[0].querySelectorAll('th, td')).slice(1).map(c => c.textContent?.trim() || '');

                const getRowData = (labelPart: string) => {
                    const row = rows.find(r => r.querySelector('td')?.textContent?.includes(labelPart));
                    if (!row) return [];
                    return Array.from(row.querySelectorAll('td')).slice(1).map(c => c.textContent?.trim() || '-');
                };

                const margins = getRowData('Net Profit Margin');
                const growth = getRowData('EPS Growth');
                const peg = getRowData('PEG');

                years.forEach((year, i) => {
                    if (year) {
                        ratiosData.push({
                            year,
                            netProfitMargin: margins[i] || '-',
                            epsGrowth: growth[i] || '-',
                            peg: peg[i] || '-'
                        });
                    }
                });
            }
        }

        return { financials: financialData, ratios: ratiosData };
      }
    } catch (e) {
      console.warn(`Proxy ${proxyUrl} failed`, e);
    }
  }
  return null;
};
