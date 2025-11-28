/**
 * Service to fetch live stock prices AND SECTORS from PSX.
 * STRATEGY: Bulk Fetch (Scrape the Market Watch Summary)
 * UPDATED: Uses dynamic header detection ("XLOOKUP" style) as requested.
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
        
        const rows = doc.querySelectorAll("tr");
        if (rows.length === 0) return;

        // --- 1. Dynamic Header Mapping (The "XLOOKUP" Approach) ---
        // We look for specific keywords in the first few rows to identify columns
        const colMap: Record<string, number> = {
            SYMBOL: 0, // Default: Column 0
            PRICE: 5,  // Default: Column 5 (often 6th column in PSX)
            SECTOR: -1 // Default: Not present (Sector usually comes from Group Headers)
        };

        // Scan first 5 rows to find the header row
        for (let i = 0; i < Math.min(rows.length, 5); i++) {
            const cells = rows[i].querySelectorAll("th, td");
            let headerFound = false;
            
            cells.forEach((cell, idx) => {
                const text = cell.textContent?.trim().toUpperCase() || "";
                
                if (text === 'SYMBOL' || text === 'SCRIP') {
                    colMap.SYMBOL = idx;
                    headerFound = true;
                }
                // Match "CURRENT" or "CURRENT PRICE" or "PRICE"
                if (text.includes('CURRENT') || text === 'PRICE' || text === 'RATE') {
                    colMap.PRICE = idx;
                    headerFound = true;
                }
                if (text === 'SECTOR') {
                    colMap.SECTOR = idx;
                    headerFound = true;
                }
            });

            if (headerFound) break; // Stop once we find the likely header row
        }

        // --- 2. Data Extraction ---
        let currentGroupHeader = "Unknown Sector";

        rows.forEach(row => {
            const cols = row.querySelectorAll("td");
            
            // A. Handle Sector Group Headers (Rows that span across or have few cells)
            // Example: <tr class="sector-row"><td>Automobile Assembler</td></tr>
            if (cols.length === 1 || (cols.length > 0 && cols.length < 4)) {
                const text = cols[0]?.textContent?.trim();
                if (text && text.length > 3 && !TICKER_BLACKLIST.includes(text.toUpperCase())) {
                    currentGroupHeader = text;
                }
                return; 
            }

            // B. Handle Data Rows
            // Ensure we have enough columns to access the mapped indices
            const maxNeeded = Math.max(colMap.SYMBOL, colMap.PRICE);
            if (cols.length <= maxNeeded) return;

            // 1. Extract Symbol
            const symbolText = cols[colMap.SYMBOL]?.textContent?.trim().toUpperCase();
            
            // Skip invalid rows (headers repeated in body, empty rows)
            if (!symbolText || TICKER_BLACKLIST.includes(symbolText)) return;

            // 2. Extract Price
            // Remove commas (e.g., "1,200.50" -> "1200.50")
            const rawPrice = cols[colMap.PRICE]?.textContent?.trim();
            const priceText = rawPrice?.replace(/,/g, '');
            const price = parseFloat(priceText || '');

            // 3. Extract Sector
            // Priority: Explicit Sector Column > Current Group Header
            let sector = currentGroupHeader;
            if (colMap.SECTOR !== -1 && cols[colMap.SECTOR]) {
                const secText = cols[colMap.SECTOR].textContent?.trim();
                if (secText) {
                    // Check if it's a code (e.g. "0801") and map it, otherwise use text
                    sector = SECTOR_CODE_MAP[secText] || secText;
                }
            }

            // 4. Store Result
            if (symbolText.length >= 2 && !isNaN(price)) {
                // FIX: Zero-Price Protection
                // If a ticker appears multiple times (e.g. Regular vs Odd Lot), prefer the non-zero price.
                // Do not overwrite a valid price with 0.00.
                if (results[symbolText] && results[symbolText].price > 0 && price === 0) {
                    return;
                }
                
                results[symbolText] = { price, sector };
            }
        });

    } catch (e) {
        console.error("Error parsing HTML", e);
    }
};
