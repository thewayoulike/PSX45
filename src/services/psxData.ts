/**
 * Service to fetch live stock prices AND SECTORS from PSX.
 * STRATEGY: Bulk Fetch (Scrape the Market Watch Summary)
 * UPDATED: Uses shared SECTOR_CODE_MAP from sectors.ts
 */

import { SECTOR_CODE_MAP } from './sectors';

// Ignore these "Ticker" names because they are actually table headers or metadata
const TICKER_BLACKLIST = ['READY', 'FUTURE', 'OPEN', 'HIGH', 'LOW', 'CLOSE', 'VOLUME', 'CHANGE', 'SYMBOL', 'SCRIP', 'LDCP'];

export const fetchBatchPSXPrices = async (tickers: string[]): Promise<Record<string, { price: number, sector: string }>> => {
    const results: Record<string, { price: number, sector: string }> = {};
    const targetUrl = `https://dps.psx.com.pk/market-watch`;

    // UPDATED PROXY LIST (Prioritizing CodeTabs which is often more permissive)
    const proxies = [
        `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`,
        `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}&t=${Date.now()}`,
        `https://thingproxy.freeboard.io/fetch/${targetUrl}`,
        `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`
    ];

    for (const proxyUrl of proxies) {
        try {
            console.log(`Attempting fetch via: ${proxyUrl}`);
            const response = await fetch(proxyUrl);
            
            if (!response.ok) throw new Error(`Status ${response.status}`);
            
            let html = '';
            
            // AllOrigins returns JSON with 'contents', others return raw text
            if (proxyUrl.includes('allorigins')) {
                const data = await response.json();
                html = data.contents;
            } else {
                html = await response.text();
            }

            if (html && html.length > 500) { 
                parseMarketWatchTable(html, results);
                
                // Only return if we actually found data
                if (Object.keys(results).length > 0) {
                    console.log(`Fetch successful! Found ${Object.keys(results).length} prices.`);
                    return results; // Exit loop on REAL success
                } else {
                    console.warn(`Proxy ${proxyUrl} returned HTML but no prices found (likely blocked).`);
                }
            }
        } catch (err) {
            console.warn(`Proxy failed: ${proxyUrl}`, err);
        }
    }

    console.error("All proxies failed to fetch PSX data.");
    return results; 
};

const parseMarketWatchTable = (html: string, results: Record<string, { price: number, sector: string }>) => {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");
        
        // 1. Determine Column Indices Dynamically
        let currentIdx = -1;
        let sectorIdx = -1; 
        
        const headers = doc.querySelectorAll("th");
        headers.forEach((th, i) => {
            const headerText = th.textContent?.trim().toUpperCase();
            if (headerText === 'CURRENT' || headerText === 'PRICE') currentIdx = i;
            if (headerText === 'SECTOR') sectorIdx = i;
        });

        // Fallback Sector Tracker (for grouped view)
        let currentGroupHeader = "Unknown Sector";

        const rows = doc.querySelectorAll("tr");
        rows.forEach(row => {
            const cols = row.querySelectorAll("td");
            
            // A. Handle Group Header Rows (if table is grouped)
            if (cols.length === 1 || (cols.length > 0 && cols.length < 5)) {
                const text = cols[0]?.textContent?.trim();
                if (text && text.length > 3 && !TICKER_BLACKLIST.includes(text.toUpperCase())) {
                    currentGroupHeader = text;
                }
                return; 
            }

            // B. Handle Data Rows
            if (cols.length > 5) {
                // Symbol is almost always the first column
                const symbol = cols[0]?.textContent?.trim().toUpperCase();
                
                // Determine Price Column
                let priceCol;
                if (currentIdx !== -1 && cols[currentIdx]) {
                    priceCol = cols[currentIdx];
                } else {
                    // Fallback: 4th column from the end
                    priceCol = cols[cols.length - 4];
                }

                if (symbol && priceCol) {
                    if (TICKER_BLACKLIST.includes(symbol)) return;

                    // Parse Price
                    const priceText = priceCol.textContent?.trim().replace(/,/g, '');
                    const price = parseFloat(priceText || '');
                    
                    // Determine Sector
                    let sector = currentGroupHeader;
                    
                    // If we found a SECTOR column (e.g. "0823"), use it
                    if (sectorIdx !== -1 && cols[sectorIdx]) {
                        const code = cols[sectorIdx].textContent?.trim();
                        if (code && SECTOR_CODE_MAP[code]) {
                            sector = SECTOR_CODE_MAP[code];
                        }
                    }

                    if (symbol.length >= 2 && !isNaN(price)) {
                        results[symbol] = { price, sector };
                    }
                }
            }
        });
    } catch (e) {
        console.error("Error parsing HTML", e);
    }
};
