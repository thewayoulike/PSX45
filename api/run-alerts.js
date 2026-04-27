import { kv } from '@vercel/kv';
import webpush from 'web-push';

export default async function handler(req, res) {
  // Secure route so only your cron job can run it
  if (req.query.secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized. Invalid Secret.' });
  }

  try {
    // 1. Fetch keys inside the function (uses VITE_VAPID_PUBLIC_KEY to match your Vercel settings)
    const pubKey = (process.env.VITE_VAPID_PUBLIC_KEY || '').trim();
    const privKey = (process.env.VAPID_PRIVATE_KEY || '').trim();

    if (!pubKey || !privKey) {
      return res.status(500).json({ error: 'CRITICAL ERROR: VAPID keys are missing.' });
    }

    // 2. Configure Web Push safely
    webpush.setVapidDetails(
      'mailto:itruth2011@gmail.com',
      pubKey,
      privKey
    );

    // 3. Check for alerts in Database
    const alerts = (await kv.get('psx_alerts')) || [];
    if (alerts.length === 0) return res.status(200).json({ message: 'No active alerts' });

    // 4. Fetch live prices (WITH HEADERS TO PREVENT PSX BLOCKING)
    const uniqueTickers = [...new Set(alerts.map(a => a.ticker))];
    const response = await fetch('https://dps.psx.com.pk/market-watch', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    const html = await response.text();
    
    const livePrices = {};
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;
    
    // Default column fallback just in case
    let colMap = { SYMBOL: 0, PRICE: 5 }; 
    let foundHeaders = false;
    
    while ((rowMatch = rowRegex.exec(html)) !== null) {
      const rowHtml = rowMatch[1];
      // Look for td OR th to catch header rows
      const cellRegex = /<(td|th)[^>]*>([\s\S]*?)<\/\1>/gi;
      const cells = [];
      let cellMatch;
      
      while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
        // Fix for "OBOY<br>OILBOY": replace <br> with spaces before stripping HTML
        let content = cellMatch[2].replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim().toUpperCase();
        cells.push(content);
      }

      // DYNAMIC HEADER DETECTION: Find which column is the Price column
      if (!foundHeaders && cells.some(c => c === 'SYMBOL' || c === 'SCRIP' || c === 'CURRENT')) {
        cells.forEach((txt, idx) => {
          if (txt === 'SYMBOL' || txt === 'SCRIP') colMap.SYMBOL = idx;
          if (txt === 'CURRENT' || txt === 'PRICE' || txt === 'RATE') colMap.PRICE = idx;
        });
        foundHeaders = true;
        continue; 
      }
      
      // DATA EXTRACTION: Use the dynamically found columns
      if (cells.length > Math.max(colMap.SYMBOL, colMap.PRICE)) {
        // Split by space and take the first word (Fixes the OBOY issue)
        const symbolText = cells[colMap.SYMBOL].split(/\s/)[0]; 
        const price = parseFloat(cells[colMap.PRICE].replace(/,/g, '')); 
        
        uniqueTickers.forEach(ticker => {
          if (symbolText === ticker) {
            if (!isNaN(price) && price > 0) {
              livePrices[ticker] = price;
            }
          }
        });
      }
    }

    // 5. Send pushes
    let pushesSent = 0;
    
    const processingPromises = alerts.map(async (alert) => {
      const currentPrice = livePrices[alert.ticker];
      if (!currentPrice) return { keep: true, alert }; 

      const hitAbove = alert.direction === 'ABOVE' && currentPrice >= alert.targetPrice;
      const hitBelow = alert.direction === 'BELOW' && currentPrice <= alert.targetPrice;

      if (hitAbove || hitBelow) {
        const payload = JSON.stringify({
          title: `PSX Alert: ${alert.ticker} hit Rs. ${currentPrice}`,
          body: `Target was Rs. ${alert.targetPrice}. Open the app to view your portfolio.`
        });

        try {
          await webpush.sendNotification(alert.subscription, payload);
          pushesSent++;
          return { keep: false }; 
        } catch (e) {
          if (e.statusCode === 410 || e.statusCode === 404) {
            return { keep: false }; 
          } else {
            return { keep: true, alert }; 
          }
        }
      } 
      return { keep: true, alert }; 
    });

    const results = await Promise.all(processingPromises);
    const alertsToKeep = results.filter(res => res.keep).map(res => res.alert);

    // 6. Update database
    await kv.set('psx_alerts', alertsToKeep);

    return res.status(200).json({ success: true, pushesSent, alertsRemaining: alertsToKeep.length });
    
  } catch (error) {
    console.error("Run Alerts Error:", error);
    return res.status(500).json({ error: "GENERAL ERROR: " + error.message });
  }
}
