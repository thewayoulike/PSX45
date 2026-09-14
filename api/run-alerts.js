import webpush from 'web-push';
import { getAllRecords } from '../lib/alertsStore.js';
import { deliverAlerts } from '../lib/deliverAlerts.js';
import { isCronAuthorized } from '../lib/cronAuth.js';
import { fetchPsxLatestCloses } from '../lib/psxOhlc.js';
import { fetchPypsxQuotePrices } from '../lib/pypsxQuotes.js';

// Fetch the PSX market-watch page once and return { TICKER: price }.
async function fetchLivePrices() {
  const response = await fetch('https://dps.psx.com.pk/market-watch', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });
  const html = await response.text();

  const livePrices = {};
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;

  let colMap = { SYMBOL: 0, PRICE: 5 };
  let foundHeaders = false;

  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const rowHtml = rowMatch[1];
    const cellRegex = /<(td|th)[^>]*>([\s\S]*?)<\/\1>/gi;
    const cells = [];
    let cellMatch;

    while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
      const content = cellMatch[2]
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .trim()
        .toUpperCase();
      cells.push(content);
    }

    if (!foundHeaders && cells.some((c) => c === 'SYMBOL' || c === 'SCRIP' || c === 'CURRENT')) {
      cells.forEach((txt, idx) => {
        if (txt === 'SYMBOL' || txt === 'SCRIP') colMap.SYMBOL = idx;
        if (txt === 'CURRENT' || txt === 'PRICE' || txt === 'RATE') colMap.PRICE = idx;
      });
      foundHeaders = true;
      continue;
    }

    if (cells.length > Math.max(colMap.SYMBOL, colMap.PRICE)) {
      const symbol = cells[colMap.SYMBOL].split(/\s/)[0];
      const price = parseFloat(cells[colMap.PRICE].replace(/,/g, ''));
      if (symbol && !isNaN(price) && price > 0) livePrices[symbol] = price;
    }
  }
  return livePrices;
}

export default async function handler(req, res) {
  if (!isCronAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized. Invalid Secret.' });
  }

  try {
    const pubKey = (process.env.VITE_VAPID_PUBLIC_KEY || '').trim();
    const privKey = (process.env.VAPID_PRIVATE_KEY || '').trim();
    if (!pubKey || !privKey) {
      return res.status(500).json({ error: 'CRITICAL ERROR: VAPID keys are missing.' });
    }
    webpush.setVapidDetails('mailto:itruth2011@gmail.com', pubKey, privKey);

    const records = (await getAllRecords()).filter(({ rec }) => rec?.alerts?.length);
    if (!records.length) return res.status(200).json({ message: 'No active alerts' });

    // Offline-safe price stack (app closed):
    // 1) market-watch  2) OHLC last close  3) pypsx.get_quote (preferred when keys work)
    const livePrices = await fetchLivePrices();
    const alertTickers = [
      ...new Set(
        records.flatMap(({ rec }) =>
          (rec.alerts || []).map((a) => String(a.ticker || '').toUpperCase()).filter(Boolean)
        )
      ),
    ];
    try {
      const ohlcCloses = await fetchPsxLatestCloses(alertTickers);
      Object.assign(livePrices, ohlcCloses);
      console.log(`[run-alerts] OHLC overlay: ${Object.keys(ohlcCloses).length}/${alertTickers.length} alert tickers`);
    } catch (e) {
      console.warn('[run-alerts] OHLC overlay failed — using market-watch only', e);
    }
    try {
      const quoteCloses = await fetchPypsxQuotePrices(alertTickers);
      Object.assign(livePrices, quoteCloses);
      console.log(`[run-alerts] pyPSX quote overlay: ${Object.keys(quoteCloses).length}/${alertTickers.length}`);
    } catch (e) {
      console.warn('[run-alerts] pyPSX quotes failed — keeping market-watch/OHLC backup', e);
    }

    const result = await deliverAlerts(records, livePrices, (...args) => webpush.sendNotification(...args));
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error('Run Alerts Error:', error);
    return res.status(500).json({ error: 'GENERAL ERROR: ' + error.message });
  }
}
