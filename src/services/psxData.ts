import { SECTOR_CODE_MAP } from './sectors';

const TICKER_BLACKLIST = ['READY', 'FUTURE', 'OPEN', 'HIGH', 'LOW', 'CLOSE', 'VOLUME', 'CHANGE', 'SYMBOL', 'SCRIP', 'LDCP', 'MARKET', 'SUMMARY', 'CURRENT', 'SECTOR', 'LISTED IN'];

export type TimeRange = '1D' | '1M' | '6M' | 'YTD' | '1Y' | '3Y' | '5Y';

// --- KEY STORAGE (In Memory) ---
let userScrapingKey: string | null = null;      // Scrape.do
let userWebScrapingAIKey: string | null = null; // WebScraping.AI

export const setScrapingApiKey = (key: string | null) => {
    userScrapingKey = key ? key.trim() : null;
};

export const setWebScrapingAIKey = (key: string | null) => {
    userWebScrapingAIKey = key ? key.trim() : null;
};

// FREE PROXIES (Tried First)
const FREE_PROXIES = [
    (url: string) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}&t=${Date.now()}`,
    (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}&t=${Date.now()}`,
    (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}&_t=${Date.now()}`,
    (url: string) => `https://thingproxy.freeboard.io/fetch/${url}?t=${Date.now()}`,
];

// Helper to shuffle free proxies
const getShuffledFreeProxies = () => {
    const array = [...FREE_PROXIES];
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
};

const fetchWithTimeout = async (url: string, options: RequestInit = {}, timeout = 10000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        throw error;
    }
};

// The core logic: Free -> Scrape.do -> WebScraping.AI
const fetchUrlWithFallback = async (targetUrl: string): Promise<string | null> => {
    
    // 1. TRY FREE PROXIES FIRST
    const freeList = getShuffledFreeProxies();
    for (const proxyGen of freeList) {
        try {
            const proxyUrl = proxyGen(targetUrl);
            const response = await fetchWithTimeout(proxyUrl, {}, 6000); 
            if (!response.ok) continue;

            const text = await response.text();
            
            if (proxyUrl.includes('allorigins')) {
                try {
                    const json = JSON.parse(text);
                    if (json.contents && json.contents.length > 500) return json.contents;
                } catch (e) { continue; }
            } else {
                if (text && text.length > 500) return text; 
            }
        } catch (e) { /* Try next */ }
    }

    // 2. FALLBACK: Scrape.do
    if (userScrapingKey) {
        try {
            console.log("Free proxies failed. Switching to Scrape.do...");
            const premiumUrl = `http://api.scrape.do?token=${userScrapingKey}&url=${encodeURIComponent(targetUrl)}`;
            const response = await fetchWithTimeout(premiumUrl, {}, 25000);
            
            if (response.ok) {
                return await response.text();
            }
        } catch (e) {
            console.error("Scrape.do failed:", e);
        }
    }

    // 3. FALLBACK: WebScraping.AI
    if (userWebScrapingAIKey) {
        try {
            console.log("Scrape.do failed/empty. Switching to WebScraping.AI...");
            // WebScraping.AI uses 'api_key' parameter
            const wsUrl = `https://api.webscraping.ai/html?api_key=${userWebScrapingAIKey}&url=${encodeURIComponent(targetUrl)}`;
            const response = await fetchWithTimeout(wsUrl, {}, 25000);
            
            if (response.ok) {
                return await response.text();
            }
        } catch (e) {
            console.error("WebScraping.AI failed:", e);
        }
    } else {
        if (!userScrapingKey) console.warn("No Premium Keys provided. Sync failed.");
    }

    return null; 
};

// Scrape Live Data (Fallback for 1D chart)
const fetchLivePriceData = async (symbol: string): Promise<{ time: number; price: number } | null> => {
    try {
        const data = await fetchBatchPSXPrices([symbol]);
        const stock = data[symbol];
        if (stock && stock.price > 0) {
            return {
                time: Date.now(),
                price: stock.price
            };
        }
    } catch (e) { console.error("Live scrap failed", e); }
    return null;
};

// A. FETCH STOCK HISTORY
export const fetchStockHistory = async (symbol: string, range: TimeRange = '1D'): Promise<{ time: number; price: number }[]> => {
    const cleanSymbol = symbol.toUpperCase().replace('PSX:', '').trim();
    
    if (range === '1D') {
        const live = await fetchLivePriceData(cleanSymbol);
        return live ? [live] : [];
    }

    const targetUrl = `https://dps.psx.com.pk/timeseries/eod/${cleanSymbol}`;
    const htmlOrJson = await fetchUrlWithFallback(targetUrl);

    if (htmlOrJson) {
        try {
            const rawData = JSON.parse(htmlOrJson);
            if (rawData && rawData.data && Array.isArray(rawData.data)) {
                return rawData.data
                    .map((point: any[]) => ({
                        time: point[0] * 1000, 
                        price: Number(point[4])
                    }))
                    .sort((a: any, b: any) => a.time - b.time);
            }
        } catch (e) { /* ignore */ }
    }

    console.warn("History fetch failed. Switching to Live Fallback...");
    const liveCandle = await fetchLivePriceData(cleanSymbol);
    return liveCandle ? [liveCandle] : [];
};

// B. FETCH BATCH PRICES (Sync PSX)
export const fetchBatchPSXPrices = async (tickers: string[]): Promise<Record<string, { price: number, sector: string, ldcp: number, high: number, low: number, volume: number }>> => {
    const results: Record<string, any> = {};
    const targetUrl = `https://dps.psx.com.pk/market-watch`;
    const targetTickers = new Set(tickers.map(t => t.trim().toUpperCase()));

    const html = await fetchUrlWithFallback(targetUrl);

    if (html && html.length > 500) {
        parseMarketWatchTable(html, results, targetTickers);
    }
    
    return results; 
};

// C. FETCH TOP VOLUME STOCKS (Ticker) - UPDATED FOR DYNAMIC COLUMNS
export const fetchTopVolumeStocks = async (): Promise<{ symbol: string; price: number; change: number; volume: number }[]> => {
    const targetUrl = `https://dps.psx.com.pk/market-watch`;
    const html = await fetchUrlWithFallback(targetUrl);

    if (!html || html.length < 500) return [];

    const stocks: { symbol: string; price: number; change: number; volume: number }[] = [];
    
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");
        const tables = doc.querySelectorAll("table");

        tables.forEach(table => {
            const rows = table.querySelectorAll("tr");
            if (rows.length < 2) return;
            
            // --- DYNAMIC HEADER DETECTION ---
            const headerCells = rows[0].querySelectorAll("th, td");
            const colMap = { SYMBOL: -1, PRICE: -1, CHANGE: -1, VOLUME: -1 };

            headerCells.forEach((cell, idx) => {
                const txt = cell.textContent?.trim().toUpperCase() || "";
                if (txt === 'SYMBOL' || txt === 'SCRIP') colMap.SYMBOL = idx;
                if (txt === 'CURRENT' || txt === 'PRICE' || txt === 'RATE') colMap.PRICE = idx;
                if (txt === 'CHANGE' || txt === 'NET CHANGE') colMap.CHANGE = idx;
                if (txt.includes('VOL') || txt === 'VOLUME') colMap.VOLUME = idx;
            });

            // Fallback indices if header detection fails
            if (colMap.SYMBOL === -1 || colMap.PRICE === -1) {
                // Verified Layout as of Late 2024: 
                // [0] SCRIP, [1] LDCP, [2] OPEN, [3] HIGH, [4] LOW, [5] CURRENT, [6] CHANGE, [7] VOLUME
                colMap.SYMBOL = 0;
                colMap.PRICE = 5;
                colMap.CHANGE = 6;
                colMap.VOLUME = 7;
            }

            rows.forEach((row, rIdx) => {
                if (rIdx === 0) return; // Skip Header

                const cols = row.querySelectorAll("td");
                // Ensure we have enough columns for the max index we need
                const maxIndex = Math.max(colMap.SYMBOL, colMap.PRICE, colMap.CHANGE, colMap.VOLUME);
                if (cols.length <= maxIndex) return; 

                // SYMBOL EXTRACTION
                let symbol = "";
                const symCell = cols[colMap.SYMBOL];
                
                // Try getting text from anchor tag first (usually just ticker)
                const anchor = symCell.querySelector('a');
                if (anchor) {
                    symbol = anchor.textContent?.trim().toUpperCase() || "";
                } else {
                    // Fallback to text splitting if mixed (e.g., "OGDC Oil & Gas...")
                    const rawText = symCell.textContent?.trim().toUpperCase() || "";
                    symbol = rawText.split(/[\s-]/)[0]; // Split by space or dash
                }

                if (!symbol || TICKER_BLACKLIST.includes(symbol) || symbol.length > 8 || !isNaN(Number(symbol))) return;

                const priceText = cols[colMap.PRICE]?.textContent?.trim().replace(/,/g, '');
                const price = parseFloat(priceText || '0');

                const changeText = cols[colMap.CHANGE]?.textContent?.trim().replace(/,/g, '');
                const change = parseFloat(changeText || '0');

                const volText = cols[colMap.VOLUME]?.textContent?.trim().replace(/,/g, '');
                const volume = parseFloat(volText || '0');

                if (price > 0 && volume > 0) {
                    stocks.push({ symbol, price, change, volume });
                }
            });
        });

        return stocks.sort((a, b) => b.volume - a.volume).slice(0, 20);
    } catch (e) {
        console.error("Ticker Parse Error:", e);
        return [];
    }
};

const parseMarketWatchTable = (html: string, results: Record<string, any>, targetTickers: Set<string>) => {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");
        const tables = doc.querySelectorAll("table");
        if (tables.length === 0) return;

        tables.forEach(table => {
            const rows = table.querySelectorAll("tr");
            if (rows.length < 2) return;

            const colMap = { SYMBOL: -1, PRICE: -1, SECTOR: -1, LDCP: -1, HIGH: -1, LOW: -1, VOLUME: -1 };
            
            const headerRow = rows[0];
            const cells = headerRow.querySelectorAll("th, td");
            cells.forEach((cell, idx) => {
                const txt = cell.textContent?.trim().toUpperCase() || "";
                if (txt === 'SYMBOL' || txt === 'SCRIP') colMap.SYMBOL = idx;
                if (txt.includes('CURRENT') || txt === 'PRICE' || txt === 'RATE') colMap.PRICE = idx;
                if (txt === 'SECTOR') colMap.SECTOR = idx;
                if (txt === 'LDCP' || txt === 'PREV') colMap.LDCP = idx;
                if (txt === 'HIGH') colMap.HIGH = idx;
                if (txt === 'LOW') colMap.LOW = idx;
                if (txt.includes('VOL')) colMap.VOLUME = idx;
            });

            if (colMap.SYMBOL === -1) { 
                colMap.SYMBOL = 0; colMap.SECTOR = 1; colMap.LDCP = 1; // LDCP often index 1 now
                colMap.HIGH = 3; colMap.LOW = 4; 
                colMap.PRICE = 5; colMap.VOLUME = 7; 
            }

            let currentGroupHeader = "Unknown Sector";

            rows.forEach(row => {
                const cols = row.querySelectorAll("td");
                if (cols.length === 1 || (cols.length > 0 && cols.length < 4)) {
                    const text = cols[0]?.textContent?.trim();
                    if (text && text.length > 3 && !TICKER_BLACKLIST.includes(text.toUpperCase())) {
                        currentGroupHeader = text;
                    }
                    return; 
                }

                if (!cols[colMap.SYMBOL] || !cols[colMap.PRICE]) return;

                const symCell = cols[colMap.SYMBOL];
                let symbolText = symCell.querySelector('a')?.textContent?.trim().toUpperCase() || "";
                if (!symbolText) {
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = symCell.innerHTML.replace(/<br\s*\/?>/gi, ' ');
                    symbolText = (tempDiv.textContent || "").toUpperCase().replace(/\s+/g, ' ').trim();
                }
                
                let matchedTicker = null;
                for (const ticker of targetTickers) { 
                    if (symbolText === ticker || symbolText.startsWith(ticker + ' ')) { 
                        matchedTicker = ticker; break; 
                    } 
                }

                if (!matchedTicker) return;

                const getVal = (idx: number) => {
                    if (idx === -1 || !cols[idx]) return 0;
                    const val = parseFloat(cols[idx].textContent?.trim().replace(/,/g, '') || '0');
                    return isNaN(val) ? 0 : val;
                };

                const price = getVal(colMap.PRICE);
                const high = colMap.HIGH !== -1 ? getVal(colMap.HIGH) : price;
                const low = colMap.LOW !== -1 ? getVal(colMap.LOW) : price;
                const volume = colMap.VOLUME !== -1 ? getVal(colMap.VOLUME) : 0;
                let ldcp = colMap.LDCP !== -1 ? getVal(colMap.LDCP) : 0;

                let sector = currentGroupHeader;
                if (colMap.SECTOR !== -1 && cols[colMap.SECTOR]) {
                    const secText = cols[colMap.SECTOR].textContent?.trim();
                    if (secText) sector = SECTOR_CODE_MAP[secText] || secText;
                }

                if (price > 0) { 
                    results[matchedTicker] = { price, sector, ldcp, high, low, volume }; 
                }
            });
        });
    } catch (e) { console.error("Error parsing HTML", e); }
};
