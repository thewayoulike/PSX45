
/**
 * Service to fetch live stock prices directly from the PSX website (dps.psx.com.pk).
 * 
 * NOTE: Since this is a client-side app, we cannot fetch directly from PSX due to CORS errors.
 * We use CORS proxies to fetch the HTML content.
 */

export const fetchPSXPrice = async (ticker: string): Promise<number | null> => {
    if (!ticker) return null;
    
    const targetUrl = `https://dps.psx.com.pk/company/${ticker.toUpperCase()}`;
    
    // Strategy: Try Primary Proxy, if fail, try Backup Proxy
    
    // 1. Primary: AllOrigins (JSON wrapper, good for avoiding strict CORS headers issues)
    try {
        // Add timestamp to prevent caching
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}&t=${Date.now()}`;
        const response = await fetch(proxyUrl);
        if (response.ok) {
            const data = await response.json();
            const price = parseHtmlForPrice(data.contents);
            if (price !== null) return price;
        }
    } catch (e) {
        console.warn(`Primary proxy failed for ${ticker}, trying backup...`);
    }

    // 2. Backup: CorsProxy.io (Direct pipe, very fast)
    try {
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
        const response = await fetch(proxyUrl);
        if (response.ok) {
            const html = await response.text();
            const price = parseHtmlForPrice(html);
            if (price !== null) return price;
        }
    } catch (e) {
         console.error(`Backup proxy failed for ${ticker}`, e);
    }

    return null;
};

/**
 * Helper to extract price from PSX HTML
 */
const parseHtmlForPrice = (html: string): number | null => {
    if (!html) return null;
    
    try {
        // 1. DOM Parser (Specific Class) - Most Accurate
        // The PSX DPS site usually stores the main price in a div with class "quote__close"
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");
        const priceElement = doc.querySelector(".quote__close");
        
        if (priceElement && priceElement.textContent) {
            const priceText = priceElement.textContent.replace(/Rs\.|,/g, '').trim();
            const price = parseFloat(priceText);
            if (!isNaN(price)) return price;
        }

        // 2. Regex Fallback (If DOM structure changes)
        // Regex to find "Rs.xxx.xx"
        const match = html.match(/Rs\.\s*([\d,]+(?:\.\d+)?)/);

        if (match && match[1]) {
            const priceStr = match[1].replace(/,/g, "");
            const price = parseFloat(priceStr);
            if (!isNaN(price)) {
                return price;
            }
        }
    } catch (e) {
        console.error("Error parsing HTML", e);
    }
    
    return null;
}

/**
 * Fetches prices for multiple tickers
 */
export const fetchBatchPSXPrices = async (tickers: string[]): Promise<Record<string, number>> => {
    const results: Record<string, number> = {};
    
    for (const ticker of tickers) {
        // Add delay to be polite to the proxy/server
        await new Promise(r => setTimeout(r, 300));
        
        const price = await fetchPSXPrice(ticker);
        if (price !== null) {
            results[ticker] = price;
        }
    }
    
    return results;
};
