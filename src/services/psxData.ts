import { SECTOR_CODE_MAP } from './sectors';

// Ignore these "Ticker" names because they are actually table headers or metadata
const TICKER_BLACKLIST = ['READY', 'FUTURE', 'OPEN', 'HIGH', 'LOW', 'CLOSE', 'VOLUME', 'CHANGE', 'SYMBOL', 'SCRIP', 'LDCP', 'MARKET', 'SUMMARY', 'CURRENT', 'SECTOR', 'LISTED IN'];

// --- PROXY LIST ---
// We rotate through these to avoid blocking
const PROXIES = [
    (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
    (url: string) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}&t=${Date.now()}`,
    (url: string) => `https://thingproxy.freeboard.io/fetch/${url}`,
    (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`
];

// Helper to prevent hanging requests
const fetchWithTimeout = async (url: string, options: RequestInit = {}, timeout = 5000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        throw error;
    }
};

// --- 1. Fetch Batch Prices (Dashboard) ---
export const fetchBatchPSXPrices = async (tickers: string[]): Promise<Record<string, { price: number, sector: string, ldcp: number }>> => {
    const results: Record<string, { price: number, sector: string, ldcp: number }> = {};
    const targetUrl = `https://dps.psx.com.pk/market-watch`;
    
    // Create a Lookup Set for the tickers we want (for robust matching)
    const targetTickers = new Set(tickers.map(t => t.trim().toUpperCase()));

    for (const proxyGen of PROXIES) {
        try {
            const proxyUrl = proxyGen(targetUrl);
            const response = await fetchWithTimeout(proxyUrl, {}, 8000); // 8s timeout for large page
            if (!response.ok) continue;
            
            let html = '';
            if (proxyUrl.includes('allorigins')) {
                const data = await response.json();
                html = data.contents;
            } else {
                html = await response.text();
            }

            if (html && html.length > 500) { 
                parseMarketWatchTable(html, results, targetTickers);
                if (Object.keys(results).length > 0) return results;
            }
        } catch (err) {
            console.warn(`Proxy failed:`, err);
        }
    }
    return results; 
};

const parseMarketWatchTable = (html: string, results: Record<string, { price: number, sector: string, ldcp: number }>, targetTickers: Set<string>) => {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");
        const tables = doc.querySelectorAll("table");
        if (tables.length === 0) return;

        tables.forEach(table => {
            const rows = table.querySelectorAll("tr");
            if (rows.length < 2) return;

            const colMap = { SYMBOL: -1, PRICE: -1, SECTOR: -1, LDCP: -1 };
            let headerFound = false;

            for (let i = 0; i < Math.min(rows.length, 5); i++) {
                const cells = rows[i].querySelectorAll("th, td");
                cells.forEach((cell, idx) => {
                    const txt = cell.textContent?.trim().toUpperCase() || "";
                    if (txt === 'SYMBOL' || txt === 'SCRIP') colMap.SYMBOL = idx;
                    if (txt.includes('CURRENT') || txt === 'PRICE' || txt === 'RATE') colMap.PRICE = idx;
                    if (txt === 'SECTOR') colMap.SECTOR = idx;
                    if (txt === 'LDCP' || txt === 'PREV') colMap.LDCP = idx;
                });
                if (colMap.SYMBOL !== -1 && colMap.PRICE !== -1) {
                    headerFound = true;
                    break;
                }
            }

            if (!headerFound) { colMap.SYMBOL = 0; colMap.LDCP = 3; colMap.PRICE = 7; colMap.SECTOR = 1; }
            else if (colMap.LDCP === -1) { colMap.LDCP = colMap.PRICE >= 6 ? 3 : 1; }

            let currentGroupHeader = "Unknown Sector";

            rows.forEach(row => {
                const cols = row.querySelectorAll("td");
                if (cols.length === 1 || (cols.length > 0 && cols.length < 4)) {
                    const text = cols[0]?.textContent?.trim();
                    if (text && text.length > 3 && !TICKER_BLACKLIST.includes(text.toUpperCase())) currentGroupHeader = text;
                    return; 
                }

                if (!cols[colMap.SYMBOL] || !cols[colMap.PRICE]) return;

                const symCell = cols[colMap.SYMBOL];
                let symbolText = symCell.querySelector('a')?.textContent?.trim().toUpperCase() || "";
                if (!symbolText) {
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = symCell.innerHTML.replace(/<br\s*\/?>/gi, ' ');
                    const rawText = (tempDiv.textContent || "").toUpperCase().replace(/\s+/g, ' ').trim();
                    for (const ticker of targetTickers) {
                        if (rawText === ticker || rawText.startsWith(ticker + ' ')) { symbolText = ticker; break; }
                    }
                }

                if (!symbolText || TICKER_BLACKLIST.includes(symbolText)) return;

                const price = parseFloat(cols[colMap.PRICE].textContent?.trim().replace(/,/g, '') || '');
                let ldcp = 0;
                if (colMap.LDCP !== -1 && cols[colMap.LDCP]) {
                    ldcp = parseFloat(cols[colMap.LDCP].textContent?.trim().replace(/,/g, '') || '');
                }

                let sector = currentGroupHeader;
                if (colMap.SECTOR !== -1 && cols[colMap.SECTOR]) {
                    const secText = cols[colMap.SECTOR].textContent?.trim();
                    if (secText) sector = SECTOR_CODE_MAP[secText] || secText;
                }

                if (symbolText.length >= 2 && !isNaN(price) && price > 0 && !results[symbolText]) {
                    results[symbolText] = { price, sector, ldcp };
                }
            });
        });
    } catch (e) { console.error("Error parsing HTML", e); }
};

// --- 2. Fetch Top 20 Active Stocks (Ticker) ---
export const fetchTopVolumeStocks = async (): Promise<{ symbol: string; price: number; change: number; volume: number }[]> => {
  const targetUrl = `https://dps.psx.com.pk/market-watch`;
  console.log("Fetching Top Stocks from:", targetUrl);

  for (const proxyGen of PROXIES) {
      try {
          const proxyUrl = proxyGen(targetUrl);
          const response = await fetchWithTimeout(proxyUrl, {}, 8000);
          if (!response.ok) continue;
          
          let html = '';
          if (proxyUrl.includes('allorigins')) {
              const data = await response.json();
              html = data.contents;
          } else {
              html = await response.text();
          }

          if (html && html.length > 500) {
              const parser = new DOMParser();
              const doc = parser.parseFromString(html, "text/html");
              const rows = Array.from(doc.querySelectorAll("table tr"));
              
              if (rows.length < 2) continue;

              const colMap = { SYMBOL: -1, CURRENT: -1, CHANGE: -1, VOLUME: -1 };
              for (let i = 0; i < Math.min(rows.length, 5); i++) {
                  const cells = rows[i].querySelectorAll("th, td");
                  cells.forEach((cell, idx) => {
                      const txt = cell.textContent?.trim().toUpperCase() || "";
                      if (txt === 'SYMBOL' || txt === 'SCRIP') colMap.SYMBOL = idx;
                      if (txt.includes('CURRENT') || txt === 'PRICE' || txt === 'RATE') colMap.CURRENT = idx;
                      if (txt === 'CHANGE' || txt.includes('NET')) colMap.CHANGE = idx;
                      if (txt === 'VOLUME' || txt.includes('VOL')) colMap.VOLUME = idx;
                  });
                  if (colMap.SYMBOL !== -1 && colMap.VOLUME !== -1) break;
              }

              if (colMap.SYMBOL === -1) { colMap.SYMBOL = 0; colMap.CURRENT = 5; colMap.CHANGE = 6; colMap.VOLUME = 7; }

              const stockList: { symbol: string; price: number; change: number; volume: number }[] = [];

              for (const row of rows) {
                  const cols = row.querySelectorAll("td");
                  if (!cols[colMap.SYMBOL] || !cols[colMap.VOLUME]) continue;

                  let symbol = cols[colMap.SYMBOL].textContent?.trim().split(/\s+/)[0] || "";
                  if (!symbol || symbol.length > 8 || TICKER_BLACKLIST.includes(symbol)) continue;

                  const price = parseFloat(cols[colMap.CURRENT]?.textContent?.replace(/,/g, '') || "0");
                  const change = parseFloat(cols[colMap.CHANGE]?.textContent?.replace(/,/g, '') || "0");
                  const volume = parseFloat(cols[colMap.VOLUME]?.textContent?.replace(/,/g, '') || "0");

                  if (!isNaN(price) && !isNaN(volume) && volume > 0) {
                      stockList.push({ symbol, price, change, volume });
                  }
              }

              const final = stockList.sort((a, b) => b.volume - a.volume).slice(0, 20);
              if (final.length > 0) {
                  console.log(`PSX fetch success via proxy. Found ${final.length} stocks.`);
                  return final;
              }
          }
      } catch (e) {
          console.warn("Proxy failed for top stocks", e);
      }
  }
  console.warn("All proxies failed to fetch Top Stocks.");
  return [];
};

// --- 3. Fetch Stock History (For Charts) ---
export const fetchStockHistory = async (symbol: string): Promise<{ time: number; price: number }[]> => {
    // Remove "PSX:" prefix if present
    const cleanSymbol = symbol.toUpperCase().replace('PSX:', '').trim();
    const targetUrl = `https://dps.psx.com.pk/timeseries/intraday/${cleanSymbol}`;
    
    console.log(`Fetching history for ${cleanSymbol}...`);
  
    for (const proxyGen of PROXIES) {
        try {
            const proxyUrl = proxyGen(targetUrl);
            const response = await fetchWithTimeout(proxyUrl, {
                headers: { 'Cache-Control': 'no-cache' }
            }, 6000); 
            
            if (!response.ok) {
                console.warn(`Proxy ${proxyUrl} returned ${response.status}`);
                continue;
            }
            
            let rawData;
            const contentType = response.headers.get("content-type");

            // 1. Handle AllOrigins
            if (proxyUrl.includes('allorigins')) {
                const wrapper = await response.json();
                if (wrapper.contents) {
                    if (typeof wrapper.contents === 'string') {
                        try {
                            rawData = JSON.parse(wrapper.contents);
                        } catch (e) { continue; }
                    } else {
                        rawData = wrapper.contents;
                    }
                }
            } 
            // 2. Handle Standard JSON
            else {
                const text = await response.text();
                try {
                    rawData = JSON.parse(text);
                } catch (e) { continue; }
            }
  
            // 3. Map & SORT Data (Critical for "Latest on Right")
            if (rawData && rawData.data && Array.isArray(rawData.data)) {
                console.log(`History fetch success for ${cleanSymbol}`);
                
                const history = rawData.data.map((point: any[]) => ({
                    time: point[0] * 1000, 
                    price: point[1]
                }));

                if (history.length > 0) {
                    // SORT ASCENDING BY TIME: Oldest (Left) -> Newest (Right)
                    return history.sort((a: any, b: any) => a.time - b.time);
                }
            }
        } catch (e) {
            // Silently fail to next proxy
        }
    }
    
    console.warn(`All proxies failed to fetch history for ${cleanSymbol}`);
    return [];
};
