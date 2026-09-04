import webpush from 'web-push';
import { getAllRecords, putRecord, deleteRecord } from '../lib/alertsStore.js';
import { fetchPsxLatestCloses } from '../lib/psxOhlc.js';

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
  if (req.query.secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized. Invalid Secret.' });
  }

  try {
    const pubKey = (process.env.VITE_VAPID_PUBLIC_KEY || '').trim();
    const privKey = (process.env.VAPID_PRIVATE_KEY || '').trim();
    if (!pubKey || !privKey) {
      return res.status(500).json({ error: 'CRITICAL ERROR: VAPID keys are missing.' });
    }
    webpush.setVapidDetails('mailto:itruth2011@gmail.com', pubKey, privKey);

    // One query pulls every subscription + its alerts.
    const all = await getAllRecords();
    const records = all.filter(({ rec }) => rec && Array.isArray(rec.alerts) && rec.alerts.length > 0);
    if (records.length === 0) return res.status(200).json({ message: 'No active alerts' });

    // Market-watch baseline, then chart OHLC last-close for alert tickers only.
    // Cron hits this while the app is closed — push accuracy depends on this path.
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

    let pushesSent = 0;

    // Each record is read+written independently -> no cross-user clobbering.
    await Promise.all(
      records.map(async ({ sid, rec }) => {
        const remaining = [];
        let subscriptionDead = false;

        for (const alert of rec.alerts) {
          const ticker = String(alert.ticker || '').toUpperCase();
          const price = livePrices[ticker] ?? livePrices[alert.ticker];
          if (price == null) { remaining.push(alert); continue; }

          const hit =
            (alert.direction === 'ABOVE' && price >= alert.targetPrice) ||
            (alert.direction === 'BELOW' && price <= alert.targetPrice);

          if (!hit) { remaining.push(alert); continue; }

          const payload = JSON.stringify({
            title: `PSX Alert: ${ticker || alert.ticker} hit Rs. ${price}`,
            body: `Target was Rs. ${alert.targetPrice}. Open the app to view your portfolio.`
          });

          try {
            await webpush.sendNotification(rec.subscription, payload);
            pushesSent++;
            // alert consumed -> intentionally NOT pushed to `remaining`
          } catch (e) {
            if (e.statusCode === 410 || e.statusCode === 404) {
              subscriptionDead = true;
              break; // whole subscription is gone
            }
            remaining.push(alert); // transient error -> keep for next run
          }
        }

        if (subscriptionDead || remaining.length === 0) {
          await deleteRecord(sid);
        } else if (remaining.length !== rec.alerts.length) {
          rec.alerts = remaining;
          await putRecord(sid, rec);
        }
      })
    );

    return res.status(200).json({ success: true, pushesSent });
  } catch (error) {
    console.error('Run Alerts Error:', error);
    return res.status(500).json({ error: 'GENERAL ERROR: ' + error.message });
  }
}
