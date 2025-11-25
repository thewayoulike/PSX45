/**
 * Service to fetch live stock prices from PSX.
 * STRATEGY: Bulk Fetch (Scrape the Market Watch Summary)
 * * UPDATED FIX: Smart Column Detection
 * - Dynamically finds "CURRENT" column to avoid fetching "HIGH" price.
 * - Uses "4th from last" heuristic as robust fallback.
 */

export const fetchPSXPrice = async (ticker: string): Promise<number | null> => {
    const batch = await fetchBatchPSXPrices([ticker]);
    return batch[ticker] || null;
};

export const fetchBatchPSXPrices = async (tickers: string[]): Promise<Record<string, number>> => {
    const results: Record<string, number> = {};
    // Use the market-watch page which contains all tickers
    const targetUrl = `https://dps.psx.com.pk/market-watch`;

    try {
        // 1. Try Primary Proxy (AllOrigins)
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}&t=${Date.now()}`;
        const response = await fetch(proxyUrl);
        if (!response.ok) throw new Error("Proxy failed");
        
        const data = await response.json();
        if (data.contents) {
            parseMarketWatchTable(data.contents, results);
        }

    } catch (e) {
        console.warn("Primary proxy failed, trying backup...", e);
        try {
            // 2. Backup Proxy (CorsProxy.io)
            const backupUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
            const response = await fetch(backupUrl);
            if (response.ok) {
                const html = await response.text();
                parseMarketWatchTable(html, results);
            }
        } catch (err) {
            console.error("All proxies failed", err);
        }
    }

    return results;
};

/**
 * Smartly parses the HTML table, adjusting for extra columns like "Sector".
 */
const parseMarketWatchTable = (html: string, results: Record<string, number>) => {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");
        
        // 1. Determine "Current" column index dynamically from Headers
        let currentIdx = -1;
        const headers = doc.querySelectorAll("th");
        headers.forEach((th, i) => {
            const headerText = th.textContent?.trim().toUpperCase();
            if (headerText === 'CURRENT' || headerText === 'PRICE') {
                currentIdx = i;
            }
        });

        const rows = doc.querySelectorAll("tr");
        rows.forEach(row => {
            const cols = row.querySelectorAll("td");
            
            // We need enough data columns to be a valid stock row
            if (cols.length > 5) {
                // Symbol is almost always the first column
                const symbol = cols[0]?.textContent?.trim().toUpperCase();
                
                // 2. Find the Price Column
                let priceCol;
                
                if (currentIdx !== -1 && cols[currentIdx]) {
                    // specific index found from headers
                    priceCol = cols[currentIdx];
                } else {
                    // Fallback Heuristic: "Current" is usually the 4th column from the end
                    // Layout: [ ... | Current | Change | % Change | Volume ]
                    priceCol = cols[cols.length - 4];
                }

                if (symbol && priceCol) {
                    const priceText = priceCol.textContent?.trim().replace(/,/g, '');
                    const price = parseFloat(priceText || '');
                    
                    // Valid Ticker (2-5 chars) and Valid Price
                    if (symbol.length >= 2 && !isNaN(price)) {
                        results[symbol] = price;
                    }
                }
            }
        });
    } catch (e) {
        console.error("Error parsing HTML", e);
    }
};
