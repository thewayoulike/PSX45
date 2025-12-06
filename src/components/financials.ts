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
  
  // Use the same proxy list as your existing psxData.ts to bypass CORS
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
        
        // 1. Extract Financials (Sales, Income, Profit, EPS)
        // The table is usually identified by the header "Financials"
        const financialData: CompanyFinancials[] = [];
        const financialsHeader = Array.from(doc.querySelectorAll('h4')).find(h => h.textContent?.includes('Financials'));
        
        if (financialsHeader) {
            // The table is usually immediately following the header or inside a container below it
            // We look for the table within the same section
            const container = financialsHeader.parentElement;
            const table = container?.querySelector('table');
            
            if (table) {
                const rows = table.querySelectorAll('tr');
                // Row 0 is headers (Years: 2024, 2023, etc.)
                const years = Array.from(rows[0].querySelectorAll('th, td')).slice(1).map(c => c.textContent?.trim() || '');
                
                // Map rows by their label (first cell)
                const map: Record<string, string[]> = {};
                
                Array.from(rows).slice(1).forEach(row => {
                    const cells = row.querySelectorAll('td');
                    const label = cells[0]?.textContent?.trim();
                    if (label) {
                        map[label] = Array.from(cells).slice(1).map(c => c.textContent?.trim() || '0');
                    }
                });

                // Construct result objects for each year column
                years.forEach((year, index) => {
                    if (year) {
                        financialData.push({
                            year,
                            sales: map['Sales']?.[index] || '-',
                            totalIncome: map['Total Income']?.[index] || '-',
                            profitAfterTax: map['Profit after Taxation']?.[index] || '-',
                            eps: map['EPS']?.[index] || '-'
                        });
                    }
                });
            }
        }

        // 2. Extract Ratios (Net Profit Margin, EPS Growth, PEG)
        const ratiosData: CompanyRatios[] = [];
        const ratiosHeader = Array.from(doc.querySelectorAll('h4')).find(h => h.textContent?.includes('Ratios'));
        
        if (ratiosHeader) {
            const container = ratiosHeader.parentElement;
            const table = container?.querySelector('table');
            
            if (table) {
                const rows = table.querySelectorAll('tr');
                const years = Array.from(rows[0].querySelectorAll('th, td')).slice(1).map(c => c.textContent?.trim() || '');
                
                const map: Record<string, string[]> = {};
                Array.from(rows).slice(1).forEach(row => {
                    const cells = row.querySelectorAll('td');
                    const label = cells[0]?.textContent?.trim();
                    if (label) {
                        map[label] = Array.from(cells).slice(1).map(c => c.textContent?.trim() || '0');
                    }
                });

                years.forEach((year, index) => {
                    if (year) {
                        ratiosData.push({
                            year,
                            netProfitMargin: map['Net Profit Margin (%)']?.[index] || '-',
                            epsGrowth: map['EPS Growth (%)']?.[index] || '-',
                            peg: map['PEG']?.[index] || '-'
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
