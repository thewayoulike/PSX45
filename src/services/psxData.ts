/**
 * Service to fetch live stock prices AND SECTORS from PSX.
 * STRATEGY: Bulk Fetch (Scrape the Market Watch Summary)
 * UPDATED: Table-Isolation-Scan. Finds headers per-table to avoid mismatched indices.
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
        
        // Find ALL tables (Main Board, Odd Lots, Indices, etc.)
        const tables = doc.querySelectorAll("table");
        if (tables.length === 0) return;

        tables.forEach(table => {
            const rows = table.querySelectorAll("tr");
            if (rows.length < 2) return; // Skip tiny/empty tables

            // --- 1. Identify Columns FOR THIS SPECIFIC TABLE ---
            const colMap = { SYMBOL: -1, PRICE: -1, SECTOR: -1 };
            let headerFound = false;

            // Scan the first 5 rows of *this* table to find headers
            for (let i = 0; i < Math.min(rows.length, 5); i++) {
                const cells = rows[i].querySelectorAll("th, td");
                cells.forEach((cell, idx) => {
                    const txt = cell.textContent?.trim().toUpperCase() || "";
                    if (txt === 'SYMBOL' || txt === 'SCRIP') colMap.SYMBOL = idx;
                    if (txt.includes('CURRENT') || txt === 'PRICE' || txt === 'RATE') colMap.PRICE = idx;
                    if (txt === 'SECTOR') colMap.SECTOR = idx;
                });
                
                // If we found the critical columns, stop scanning headers
                if (colMap.SYMBOL !== -1 && colMap.PRICE !== -1) {
                    headerFound = true;
                    break;
                }
            }

            // If this table doesn't have Symbol+Price headers, ignore it (it's likely not the market watch)
            if (!headerFound) return;

            // --- 2. Process Rows ---
            let currentGroupHeader = "Unknown Sector";

            rows.forEach(row => {
                const cols = row.querySelectorAll("td");
                
                // A. Handle Sector Group Headers (Row Spanning)
                if (cols.length === 1 || (cols.length > 0 && cols.length < 4)) {
                    const text = cols[0]?.textContent?.trim();
                    if (text && text.length > 3 && !TICKER_BLACKLIST.includes(text.toUpperCase())) {
                        currentGroupHeader = text;
                    }
                    return; 
                }

                // B. Handle Data Rows
                // Ensure row has cells at the detected indices
                if (!cols[colMap.SYMBOL] || !cols[colMap.PRICE]) return;

                // 1. Symbol
                const symbolText = cols[colMap.SYMBOL].textContent?.trim().toUpperCase();
                if (!symbolText || TICKER_BLACKLIST.includes(symbolText)) return;

                // 2. Price
                const priceText = cols[colMap.PRICE].textContent?.trim().replace(/,/g, '');
                const price = parseFloat(priceText || '');

                // 3. Sector
                let sector = currentGroupHeader;
                if (colMap.SECTOR !== -1 && cols[colMap.SECTOR]) {
                    const secText = cols[colMap.SECTOR].textContent?.trim();
                    if (secText) {
                        sector = SECTOR_CODE_MAP[secText] || secText;
                    }
                }

                // 4. Store Result
                if (symbolText.length >= 2 && !isNaN(price)) {
                    // FIX: Don't overwrite a valid price with 0.00 (e.g. from Odd Lots table)
                    if (results[symbolText] && results[symbolText].price > 0 && price === 0) {
                        return;
                    }
                    
                    results[symbolText] = { price, sector };
                }
            });
        });

    } catch (e) {
        console.error("Error parsing HTML", e);
    }
};
