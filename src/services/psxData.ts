/**
 * Service to fetch live stock prices AND SECTORS from PSX.
 * STRATEGY: Bulk Fetch (Scrape the Market Watch Summary)
 * UPDATED: robust-header-scan to find the correct table anywhere in the page.
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
        
        // Get ALL rows in the document to ensure we don't miss the table if it's further down
        const allRows = Array.from(doc.querySelectorAll("tr"));
        if (allRows.length === 0) return;

        // --- 1. Robust Header Discovery ---
        let colMap: Record<string, number> = { SYMBOL: -1, PRICE: -1, SECTOR: -1 };
        let headerRowIndex = -1;

        // Scan rows until we find one that looks like a Market Watch header
        for (let i = 0; i < allRows.length; i++) {
            const cells = allRows[i].querySelectorAll("th, td");
            let foundSymbol = false;
            let foundPrice = false;

            cells.forEach((cell, idx) => {
                const txt = cell.textContent?.trim().toUpperCase() || "";
                if (txt === 'SYMBOL' || txt === 'SCRIP') foundSymbol = true;
                if (txt.includes('CURRENT') || txt === 'PRICE' || txt === 'RATE') foundPrice = true;
            });

            // If this row has both SYMBOL and PRICE headers, it's our target
            if (foundSymbol && foundPrice) {
                headerRowIndex = i;
                cells.forEach((cell, idx) => {
                    const txt = cell.textContent?.trim().toUpperCase() || "";
                    if (txt === 'SYMBOL' || txt === 'SCRIP') colMap.SYMBOL = idx;
                    if (txt.includes('CURRENT') || txt === 'PRICE' || txt === 'RATE') colMap.PRICE = idx;
                    if (txt === 'SECTOR') colMap.SECTOR = idx;
                });
                break; // Stop scanning once found
            }
        }

        // Fallback if no header found (unlikely but safe)
        if (headerRowIndex === -1) {
            colMap = { SYMBOL: 0, PRICE: 5, SECTOR: -1 };
            headerRowIndex = -1; 
        }

        // --- 2. Data Extraction ---
        let currentGroupHeader = "Unknown Sector";

        // Start processing strictly AFTER the header row
        for (let i = headerRowIndex + 1; i < allRows.length; i++) {
            const row = allRows[i];
            const cols = row.querySelectorAll("td");
            
            // A. Handle Sector Group Headers
            if (cols.length === 1 || (cols.length > 0 && cols.length < 4)) {
                const text = cols[0]?.textContent?.trim();
                if (text && text.length > 3 && !TICKER_BLACKLIST.includes(text.toUpperCase())) {
                    currentGroupHeader = text;
                }
                continue; 
            }

            // B. Handle Data Rows
            const maxNeeded = Math.max(colMap.SYMBOL, colMap.PRICE);
            if (cols.length <= maxNeeded) continue;

            // 1. Extract Symbol
            const symbolText = cols[colMap.SYMBOL]?.textContent?.trim().toUpperCase();
            if (!symbolText || TICKER_BLACKLIST.includes(symbolText)) continue;

            // 2. Extract Price
            const rawPrice = cols[colMap.PRICE]?.textContent?.trim();
            const priceText = rawPrice?.replace(/,/g, '');
            const price = parseFloat(priceText || '');

            // 3. Extract Sector
            let sector = currentGroupHeader;
            if (colMap.SECTOR !== -1 && cols[colMap.SECTOR]) {
                const secText = cols[colMap.SECTOR].textContent?.trim();
                if (secText) {
                    sector = SECTOR_CODE_MAP[secText] || secText;
                }
            }

            // 4. Store Result
            if (symbolText.length >= 2 && !isNaN(price)) {
                // FIX: Zero-Price Protection
                // If a ticker appears multiple times, prefer the non-zero price.
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
