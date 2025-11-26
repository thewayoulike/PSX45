/**
 * Service to fetch live stock prices AND SECTORS from PSX.
 * STRATEGY: Bulk Fetch (Scrape the Market Watch Summary)
 * UPDATED: 
 * 1. Full Sector Code Map based on PSX documentation.
 * 2. Multi-Proxy Rotation to handle CORS errors.
 */

// Ignore these "Ticker" names because they are actually table headers or metadata
const TICKER_BLACKLIST = ['READY', 'FUTURE', 'OPEN', 'HIGH', 'LOW', 'CLOSE', 'VOLUME', 'CHANGE', 'SYMBOL', 'SCRIP', 'LDCP'];

// Mapping PSX Numeric Codes to Sector Names
const SECTOR_CODE_MAP: Record<string, string> = {
    '0801': 'Automobile Assembler',
    '0802': 'Automobile Parts & Accessories',
    '0803': 'Cable & Electrical Goods',
    '0804': 'Cement',
    '0805': 'Chemical',
    '0806': 'Close - End Mutual Fund',
    '0807': 'Commercial Banks',
    '0808': 'Engineering',
    '0809': 'Fertilizer',
    '0810': 'Food & Personal Care Products',
    '0811': 'Glass & Ceramics',
    '0812': 'Insurance',
    '0813': 'Inv. Banks / Inv. Cos. / Securities Cos.',
    '0814': 'Jute',
    '0815': 'Leasing Companies',
    '0816': 'Leather & Tanneries',
    '0818': 'Miscellaneous',
    '0819': 'Modarabas',
    '0820': 'Oil & Gas Exploration Companies',
    '0821': 'Oil & Gas Marketing Companies',
    '0822': 'Paper, Board & Packaging',
    '0823': 'Pharmaceuticals',
    '0824': 'Power Generation & Distribution',
    '0825': 'Refinery',
    '0826': 'Sugar & Allied Industries',
    '0827': 'Synthetic & Rayon',
    '0828': 'Technology & Communication',
    '0829': 'Textile Composite',
    '0830': 'Textile Spinning',
    '0831': 'Textile Weaving',
    '0832': 'Tobacco',
    '0833': 'Transport',
    '0834': 'Vanaspati & Allied Industries',
    '0835': 'Woollen',
    '0836': 'Real Estate Investment Trust',
    '0837': 'Exchange Traded Funds',
    '0838': 'Property'
};

export const fetchBatchPSXPrices = async (tickers: string[]): Promise<Record<string, { price: number, sector: string }>> => {
    const results: Record<string, { price: number, sector: string }> = {};
    const targetUrl = `https://dps.psx.com.pk/market-watch`;

    // Proxy List: Try these in order until one works
    const proxies = [
        `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}&t=${Date.now()}`,
        `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`,
        `https://thingproxy.freeboard.io/fetch/${targetUrl}`
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

            if (html && html.length > 100) {
                parseMarketWatchTable(html, results);
                console.log("Fetch successful!");
                return results; // Exit loop on success
            }
        } catch (err) {
            console.warn(`Proxy failed: ${proxyUrl}`, err);
            // Continue to next proxy
        }
    }

    console.error("All proxies failed to fetch PSX data.");
    return results; // Return what we have (likely empty if all failed)
};

const parseMarketWatchTable = (html: string, results: Record<string, { price: number, sector: string }>) => {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");
        
        // 1. Determine Column Indices Dynamically
        let currentIdx = -1;
        let sectorIdx = -1; // To find '0828' style codes
        
        const headers = doc.querySelectorAll("th");
        headers.forEach((th, i) => {
            const headerText = th.textContent?.trim().toUpperCase();
            if (headerText === 'CURRENT' || headerText === 'PRICE') {
                currentIdx = i;
            }
            if (headerText === 'SECTOR') {
                sectorIdx = i;
            }
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
                    
                    // If we found a SECTOR column (e.g. "0828"), use it
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
