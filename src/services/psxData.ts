import { SECTOR_CODE_MAP } from './sectors';

const TICKER_BLACKLIST = ['READY', 'FUTURE', 'OPEN', 'HIGH', 'LOW', 'CLOSE', 'VOLUME', 'CHANGE', 'SYMBOL', 'SCRIP', 'LDCP', 'MARKET', 'SUMMARY', 'CURRENT', 'SECTOR', 'LISTED IN'];

// --- UPDATED PROXY LIST ---
// We define these as functions to inject a random timestamp (t=...) 
// This forces a fresh request every time, bypassing browser/proxy caches.
const PROXIES = [
    (url: string) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}&t=${Date.now()}`,
    (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}&t=${Date.now()}`,
    (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}&_t=${Date.now()}`,
    (url: string) => `https://thingproxy.freeboard.io/fetch/${url}?t=${Date.now()}`,
    // Backup: specialized scrape-friendly proxy
    (url: string) => `https://api.microlink.io?url=${encodeURIComponent(url)}&embed=body.content&t=${Date.now()}`, 
];

// Helper to shuffle the proxy list so we don't always hit the same broken one first
const getShuffledProxies = () => {
    const array = [...PROXIES];
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

export interface OHLCData {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    isSynthetic?: boolean; 
}

// Scrape Live Data (Fallback)
const fetchLivePriceData = async (symbol: string): Promise<OHLCData | null> => {
    try {
        const data = await fetchBatchPSXPrices([symbol]);
        const stock = data[symbol];
        if (stock && stock.price > 0) {
            return {
                time: Date.now(),
                open: stock.price, 
                high: stock.high || stock.price,
                low: stock.low || stock.price,
                close: stock.price,
                volume: stock.volume || 0,
                isSynthetic: true
            };
        }
    } catch (e) { console.error("Live scrap failed", e); }
    return null;
};

export const fetchStockOHLC = async (symbol: string): Promise<OHLCData[]> => {
    const cleanSymbol = symbol.toUpperCase().replace('PSX:', '').trim();
    const targetUrl = `https://dps.psx.com.pk/timeseries/eod/${cleanSymbol}`;
    
    // Use shuffled proxies to spread load
    const proxyList = getShuffledProxies();

    for (const proxyGen of proxyList) {
        try {
            const proxyUrl = proxyGen(targetUrl);
            const response = await fetchWithTimeout(proxyUrl);
            if (!response.ok) continue;
            
            let rawData;
            const text = await response.text();

            // Handle different proxy response formats
            try {
                const json = JSON.parse(text);
                if (proxyUrl.includes('allorigins')) {
                    rawData = JSON.parse(json.contents);
                } else if (proxyUrl.includes('microlink')) {
                    // Microlink wraps body in data.body
                    rawData = typeof json.data?.body === 'string' ? JSON.parse(json.data.body) : json.data?.body;
                } else {
                    rawData = json;
                }
            } catch (e) {
                // If direct JSON parse fails, it might be raw text from corsproxy
                rawData = JSON.parse(text); 
            }
  
            if (rawData && rawData.data && Array.isArray(rawData.data) && rawData.data.length > 0) {
                return rawData.data
                    .map((point: any[]) => ({
                        time: point[0] * 1000, 
                        open: Number(point[1]),
                        high: Number(point[2]),
                        low: Number(point[3]),
                        close: Number(point[4]),
                        volume: Number(point[5])
                    }))
                    .sort((a: any, b: any) => a.time - b.time);
            }
        } catch (e) { 
            // Continue to next proxy
        }
    }

    console.warn("History fetch failed. switching to Live Fallback...");
    const liveCandle = await fetchLivePriceData(cleanSymbol);
    return liveCandle ? [liveCandle] : [];
};

export const fetchBatchPSXPrices = async (tickers: string[]): Promise<Record<string, { price: number, sector: string, ldcp: number, high: number, low: number, volume: number }>> => {
    const results: Record<string, any> = {};
    const targetUrl = `https://dps.psx.com.pk/market-watch`;
    const targetTickers = new Set(tickers.map(t => t.trim().toUpperCase()));
    
    // Randomize proxies for better success rate
    const proxyList = getShuffledProxies();

    for (const proxyGen of proxyList) {
        try {
            console.log("Trying proxy:", proxyGen(targetUrl));
            const proxyUrl = proxyGen(targetUrl);
            const response = await fetchWithTimeout(proxyUrl);
            if (!response.ok) continue;
            
            let html = '';
            const text = await response.text();

            if (proxyUrl.includes('allorigins') || proxyUrl.includes('microlink')) {
                try {
                    const json = JSON.parse(text);
                    if (proxyUrl.includes('allorigins')) html = json.contents;
                    else if (proxyUrl.includes('microlink')) html = json.data?.body || '';
                } catch (e) { continue; }
            } else {
                html = text;
            }

            if (html && html.length > 500) { 
                parseMarketWatchTable(html, results, targetTickers);
                if (Object.keys(results).length > 0) return results;
            }
        } catch (err) { 
            console.warn("Proxy failed, trying next...");
        }
    }
    return results; 
};

// ... keep parseMarketWatchTable and fetchTopVolumeStocks as they were ...
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
            
            for (let i = 0; i < Math.min(rows.length, 5); i++) {
                const cells = rows[i].querySelectorAll("th, td");
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
                if (colMap.SYMBOL !== -1 && colMap.PRICE !== -1) break;
            }

            if (colMap.SYMBOL === -1) { 
                colMap.SYMBOL = 0; colMap.SECTOR = 1; colMap.LDCP = 3; 
                colMap.HIGH = 5; colMap.LOW = 6; 
                colMap.PRICE = 7; colMap.VOLUME = 9; 
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

export const fetchStockHistory = async (symbol: string, range: any = '1D'): Promise<{ time: number; price: number }[]> => {
    return [];
};
export const fetchTopVolumeStocks = async () => [];
