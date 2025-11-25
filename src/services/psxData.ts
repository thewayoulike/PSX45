/**
 * Service to fetch live stock prices from PSX.
 * STRATEGY: Bulk Fetch (Scrape the Market Watch Summary)
 * * UPDATED FIX: Blacklist & Smart Column Detection
 */

// Ignore these "Ticker" names because they are actually table headers
const TICKER_BLACKLIST = ['READY', 'FUTURE', 'OPEN', 'HIGH', 'LOW', 'CLOSE', 'VOLUME', 'CHANGE', 'SYMBOL'];

export const fetchPSXPrice = async (ticker: string): Promise<number | null> => {
    const batch = await fetchBatchPSXPrices([ticker]);
    return batch[ticker] || null;
};

export const fetchBatchPSXPrices = async (tickers: string[]): Promise<Record<string, number>> => {
    const results: Record<string, number> = {};
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

const parseMarketWatchTable = (html: string, results: Record<string, number>) => {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");
        
        // 1. Determine "Current" column index dynamically
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
            
            if (cols.length > 5) {
                // Symbol is almost always the first column
                const symbol = cols[0]?.textContent?.trim().toUpperCase();
                
                // 2. Find the Price Column
                let priceCol;
                if (currentIdx !== -1 && cols[currentIdx]) {
                    priceCol = cols[currentIdx];
                } else {
                    // Fallback: 4th column from the end
                    priceCol = cols[cols.length - 4];
                }

                if (symbol && priceCol) {
                    // 3. CHECK BLACKLIST (The Fix for "READY")
                    if (TICKER_BLACKLIST.includes(symbol)) return;

                    const priceText = priceCol.textContent?.trim().replace(/,/g, '');
                    const price = parseFloat(priceText || '');
                    
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
