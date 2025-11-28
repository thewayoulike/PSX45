/**
 * Service to fetch live stock prices AND SECTORS from PSX.
 * STRATEGY: Bulk Fetch (Scrape the Market Watch Summary)
 * UPDATED: Continuous-Row-Scan. Scans all rows in doc, updating column map whenever headers are found.
 */

import { SECTOR_CODE_MAP } from './sectors';

// Ignore these "Ticker" names because they are actually table headers or metadata
const TICKER_BLACKLIST = ['READY', 'FUTURE', 'OPEN', 'HIGH', 'LOW', 'CLOSE', 'VOLUME', 'CHANGE', 'SYMBOL', 'SCRIP', 'LDCP', 'MARKET', 'SUMMARY', 'CURRENT'];

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
        
        // Flatten ALL rows in the document to handle split tables or weird nesting
        const allRows = Array.from(doc.querySelectorAll("tr"));
        if (allRows.length === 0) return;

        // State for the continuous scan
        let colMap = { SYMBOL: -1, PRICE: -1, SECTOR: -1 };
        let currentGroupHeader = "Unknown Sector";
        let hasFoundAnyHeader = false;

        for (const row of allRows) {
            const cols = row.querySelectorAll("td, th");
            if (cols.length === 0) continue;

            // --- 1. Header Detection (Dynamic Re-Mapping) ---
            // Check if this row looks like a header row
            let foundSymbol = -1;
            let foundPrice = -1;
            let foundSector = -1;

            cols.forEach((col, idx) => {
                const txt = col.textContent?.trim().toUpperCase() || "";
                if (txt === 'SYMBOL' || txt === 'SCRIP') foundSymbol = idx;
                // Match "CURRENT" (e.g. CURRENT PRICE) or just "PRICE"
                if (txt.includes('CURRENT') || txt === 'PRICE' || txt === 'RATE') foundPrice = idx;
                if (txt === 'SECTOR') foundSector = idx;
            });

            // If we found a header row, update our map and skip data processing for this row
            if (foundSymbol !== -1 && foundPrice !== -1) {
                colMap = { SYMBOL: foundSymbol, PRICE: foundPrice, SECTOR: foundSector };
                hasFoundAnyHeader = true;
                continue; 
            }

            // If we haven't found ANY header yet, we can't process data safely
            if (!hasFoundAnyHeader) continue;

            // --- 2. Data Processing ---

            // A. Check for Group Header (Sector Row)
            // Typically spans all columns or has very few columns
            if (cols.length === 1 || (cols.length > 0 && cols.length < 4)) {
                const text = cols[0]?.textContent?.trim();
                // Ensure it's not just a navigation item or metadata
                if (text && text.length > 3 && !TICKER_BLACKLIST.includes(text.toUpperCase())) {
                    currentGroupHeader = text;
                }
                continue;
            }

            // B. Extract Data using current map
            // Ensure row has cells at the expected indices
            if (!cols[colMap.SYMBOL] || !cols[colMap.PRICE]) continue;

            const symbolText = cols[colMap.SYMBOL].textContent?.trim().toUpperCase();
            if (!symbolText || TICKER_BLACKLIST.includes(symbolText)) continue;

            const priceText = cols[colMap.PRICE].textContent?.trim().replace(/,/g, '');
            const price = parseFloat(priceText || '');

            // Sector logic
            let sector = currentGroupHeader;
            if (colMap.SECTOR !== -1 && cols[colMap.SECTOR]) {
                const secText = cols[colMap.SECTOR].textContent?.trim();
                if (secText) {
                    sector = SECTOR_CODE_MAP[secText] || secText;
                }
            }

            if (symbolText.length >= 2 && !isNaN(price)) {
                // FIX: Zero-Price Protection
                // If we already have a valid price, don't overwrite it with 0.00
                // (Useful if the same ticker appears in 'Future Contracts' table with 0 volume)
                if (results[symbolText] && results[symbolText].price > 0 && price === 0) {
                    continue;
                }
                results[symbolText] = { price, sector };
            }
        }

    } catch (e) {
        console.error("Error parsing HTML", e);
    }
};
