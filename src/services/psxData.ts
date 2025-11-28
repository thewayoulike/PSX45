/**
 * Service to fetch live stock prices AND SECTORS from PSX.
 * STRATEGY: Bulk Fetch (Scrape the Market Watch Summary)
 * UPDATED: Combined Target-Aware Parsing + LDCP Extraction for Daily P&L.
 */

import { SECTOR_CODE_MAP } from './sectors';

// Ignore these "Ticker" names because they are actually table headers or metadata
const TICKER_BLACKLIST = ['READY', 'FUTURE', 'OPEN', 'HIGH', 'LOW', 'CLOSE', 'VOLUME', 'CHANGE', 'SYMBOL', 'SCRIP', 'LDCP', 'MARKET', 'SUMMARY', 'CURRENT'];

export const fetchBatchPSXPrices = async (tickers: string[]): Promise<Record<string, { price: number, sector: string, ldcp: number }>> => {
    const results: Record<string, { price: number, sector: string, ldcp: number }> = {};
    const targetUrl = `https://dps.psx.com.pk/market-watch`;
    
    // Create a Lookup Set for the tickers we want (for robust matching)
    const targetTickers = new Set(tickers.map(t => t.trim().toUpperCase()));

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
                parseMarketWatchTable(html, results, targetTickers);
                
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

const parseMarketWatchTable = (html: string, results: Record<string, { price: number, sector: string, ldcp: number }>, targetTickers: Set<string>) => {
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
            const colMap = { SYMBOL: -1, PRICE: -1, SECTOR: -1, LDCP: -1 };
            let headerFound = false;

            // Scan first 5 rows of this table
            for (let i = 0; i < Math.min(rows.length, 5); i++) {
                const cells = rows[i].querySelectorAll("th, td");
                cells.forEach((cell, idx) => {
                    const txt = cell.textContent?.trim().toUpperCase() || "";
                    if (txt === 'SYMBOL' || txt === 'SCRIP') colMap.SYMBOL = idx;
                    if (txt.includes('CURRENT') || txt === 'PRICE' || txt === 'RATE' || txt === 'LAST') colMap.PRICE = idx;
                    if (txt === 'SECTOR') colMap.SECTOR = idx;
                    if (txt === 'LDCP' || txt === 'PREVIOUS') colMap.LDCP = idx; // Capture LDCP Index
                });
                
                if (colMap.SYMBOL !== -1 && colMap.PRICE !== -1) {
                    headerFound = true;
                    break;
                }
            }

            // If headers not found, try standard fallback indices
            if (!headerFound) {
                colMap.SYMBOL = 0;
                colMap.LDCP = 1; // Standard PSX: LDCP is usually col 1
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

                const symCell = cols[colMap.SYMBOL];
                let symbolText = "";

                // STRATEGY: Prefer text inside <a> tag to isolate ticker from noise
                const anchor = symCell.querySelector('a');
                if (anchor) {
                    const anchorText = anchor.textContent?.trim().toUpperCase() || "";
                    for (const ticker of targetTickers) {
                        if (anchorText.startsWith(ticker)) {
                            symbolText = ticker;
                            break;
                        }
                    }
                    if (!symbolText && targetTickers.has(anchorText)) symbolText = anchorText;
                } 
                
                // Fallback: Parse full cell text
                if (!symbolText) {
                    let rawHtml = symCell.innerHTML;
                    rawHtml = rawHtml.replace(/<br\s*\/?>/gi, ' ').replace(/<\/div>/gi, ' ').replace(/<\/p>/gi, ' ');
                    
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = rawHtml;
                    const rawText = (tempDiv.textContent || "").toUpperCase().replace(/\s+/g, ' ').trim();
                    
                    // Match against target tickers
                    for (const ticker of targetTickers) {
                        if (rawText === ticker || rawText.startsWith(ticker + ' ') || rawText.startsWith(ticker + '\xa0')) {
                            symbolText = ticker;
                            break;
                        }
                    }
                }

                if (!symbolText || TICKER_BLACKLIST.includes(symbolText)) return;

                // Extract Price
                const priceText = cols[colMap.PRICE].textContent?.trim().replace(/,/g, '');
                const price = parseFloat(priceText || '');

                // Extract LDCP (New)
                let ldcp = 0;
                if (colMap.LDCP !== -1 && cols[colMap.LDCP]) {
                    const ldcpText = cols[colMap.LDCP].textContent?.trim().replace(/,/g, '');
                    ldcp = parseFloat(ldcpText || '');
                }

                // Sector logic
                let sector = currentGroupHeader;
                if (colMap.SECTOR !== -1 && cols[colMap.SECTOR]) {
                    const secText = cols[colMap.SECTOR].textContent?.trim();
                    if (secText) {
                        sector = SECTOR_CODE_MAP[secText] || secText;
                    }
                }

                if (symbolText.length >= 2 && !isNaN(price)) {
                    // First Match Wins (Prioritize Main Board over Odd Lots)
                    if (results[symbolText]) return;
                    
                    if (price > 0) {
                        results[symbolText] = { price, sector, ldcp };
                    }
                }
            });
        });

    } catch (e) {
        console.error("Error parsing HTML", e);
    }
};
