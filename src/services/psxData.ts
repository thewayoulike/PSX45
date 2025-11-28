/**
 * Service to fetch live stock prices AND SECTORS from PSX.
 * STRATEGY: Bulk Fetch (Scrape the Market Watch Summary)
 * UPDATED: Anchor-First Extraction + First-Match-Wins Priority.
 * - Extracts symbol from <a> tag to avoid "XD/XM" status noise.
 * - Keeps the first price found for a ticker (Main Board) to avoid Odd-Lot overwrites.
 */

import { SECTOR_CODE_MAP } from './sectors';

// Ignore these "Ticker" names because they are actually table headers or metadata
const TICKER_BLACKLIST = ['READY', 'FUTURE', 'OPEN', 'HIGH', 'LOW', 'CLOSE', 'VOLUME', 'CHANGE', 'SYMBOL', 'SCRIP', 'LDCP', 'MARKET', 'SUMMARY', 'CURRENT'];

export const fetchBatchPSXPrices = async (tickers: string[]): Promise<Record<string, { price: number, sector: string }>> => {
    const results: Record<string, { price: number, sector: string }> = {};
    const targetUrl = `https://dps.psx.com.pk/market-watch`;
    
    // Create a Lookup Set for the tickers we want (for robust matching)
    // FIX: Trim whitespace from input tickers just in case
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

const parseMarketWatchTable = (html: string, results: Record<string, { price: number, sector: string }>, targetTickers: Set<string>) => {
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
                    if (txt.includes('CURRENT') || txt === 'PRICE' || txt === 'RATE' || txt === 'LAST') colMap.PRICE = idx;
                    if (txt === 'SECTOR') colMap.SECTOR = idx;
                });
                
                if (colMap.SYMBOL !== -1 && colMap.PRICE !== -1) {
                    headerFound = true;
                    break;
                }
            }

            // If headers not found, try standard fallback indices (Symbol=0, Price=5)
            // This happens if the proxy returns a table fragment without <thead>
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

                const symCell = cols[colMap.SYMBOL];
                let symbolText = "";

                // STRATEGY: Prefer text inside <a> tag. 
                // This isolates the ticker "PPP" from the sibling text "XD" which is usually outside the link.
                const anchor = symCell.querySelector('a');
                if (anchor) {
                    symbolText = anchor.textContent?.trim().toUpperCase() || "";
                } else {
                    // Fallback: Clean the text manually if no link
                    let rawHtml = symCell.innerHTML;
                    // Replace <br>, </div> etc with space to avoid "PPPXD"
                    rawHtml = rawHtml.replace(/<br\s*\/?>/gi, ' ').replace(/<\/div>/gi, ' ').replace(/<\/p>/gi, ' ');
                    
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = rawHtml;
                    const rawText = tempDiv.textContent?.trim().toUpperCase() || "";
                    
                    // Tokenize and find match
                    const tokens = rawText.split(/[^A-Z0-9]+/);
                    for (const token of tokens) {
                        if (targetTickers.has(token)) {
                            symbolText = token;
                            break;
                        }
                    }
                    // Final fallback
                    if (!symbolText && tokens.length > 0) {
                         const validTokens = tokens.filter(t => t.length >= 2 && !TICKER_BLACKLIST.includes(t));
                         if (validTokens.length > 0) symbolText = validTokens[0];
                    }
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
                    // FIX: FIRST MATCH WINS
                    // If we already have a price for this ticker (from Main Board), 
                    // ignore subsequent finds (which are likely Odd Lots or Futures).
                    if (results[symbolText]) {
                        return;
                    }
                    
                    if (price > 0) {
                        results[symbolText] = { price, sector };
                    }
                }
            });
        });

    } catch (e) {
        console.error("Error parsing HTML", e);
    }
};
