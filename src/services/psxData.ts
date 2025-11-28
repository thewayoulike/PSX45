/**
 * Service to fetch live stock prices AND SECTORS from PSX.
 * STRATEGY: Bulk Fetch (Scrape the Market Watch Summary)
 * UPDATED: Multi-Table-Isolation + Prefix Cleaning (XD/XM/XR).
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
        
        // Find ALL tables in the document
        const tables = doc.querySelectorAll("table");
        if (tables.length === 0) return;

        // Iterate through every table found
        tables.forEach(table => {
            const rows = table.querySelectorAll("tr");
            if (rows.length < 2) return;

            // --- 1. Header Discovery for THIS Table ---
            const colMap = { SYMBOL: -1, PRICE: -1, SECTOR: -1 };
            let headerFound = false;

            // Scan first 5 rows of this table
            for (let i = 0; i < Math.min(rows.length, 5); i++) {
                const cells = rows[i].querySelectorAll("th, td");
                cells.forEach((cell, idx) => {
                    const txt = cell.textContent?.trim().toUpperCase() || "";
                    if (txt === 'SYMBOL' || txt === 'SCRIP') colMap.SYMBOL = idx;
                    if (txt.includes('CURRENT') || txt === 'PRICE' || txt === 'RATE') colMap.PRICE = idx;
                    if (txt === 'SECTOR') colMap.SECTOR = idx;
                });
                
                if (colMap.SYMBOL !== -1 && colMap.PRICE !== -1) {
                    headerFound = true;
                    break;
                }
            }

            // If headers not found, try standard fallback indices (Symbol=0, Price=5)
            if (!headerFound) {
                colMap.SYMBOL = 0;
                colMap.PRICE = 5; 
            }

            // --- 2. Data Extraction ---
            let currentGroupHeader = "Unknown Sector";

            rows.forEach(row => {
                const cols = row.querySelectorAll("td");
                
                // A. Check for Group Header (Sector Row)
                if (cols.length === 1 || (cols.length > 0 && cols.length < 4)) {
                    const text = cols[0]?.textContent?.trim();
                    if (text && text.length > 3 && !TICKER_BLACKLIST.includes(text.toUpperCase())) {
                        currentGroupHeader = text;
                    }
                    return; 
                }

                // B. Extract Data
                if (!cols[colMap.SYMBOL] || !cols[colMap.PRICE]) return;

                let symbolText = cols[colMap.SYMBOL].textContent?.trim().toUpperCase();
                
                // --- FIX: Remove Status Prefixes (XD, XM, XR, XB, SPOT) ---
                // These prefixes appear before the symbol during corporate actions (e.g. "XD SNGP")
                if (symbolText) {
                    symbolText = symbolText.replace(/^(XD|XM|XR|XB|SPOT)\s+/g, '').trim();
                }

                if (!symbolText || TICKER_BLACKLIST.includes(symbolText)) return;

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
