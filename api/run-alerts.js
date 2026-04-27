import { kv } from '@vercel/kv';
import webpush from 'web-push';

export default async function handler(req, res) {
  // Secure route so only your cron job can run it
  if (req.query.secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized. Invalid Secret.' });
  }

  try {
    // 1. Fetch and clean keys (removes invisible trailing spaces!)
    const pubKey = (process.env.VITE_VAPID_PUBLIC_KEY || '').trim();
    const privKey = (process.env.VAPID_PRIVATE_KEY || '').trim();

    if (!pubKey || !privKey) {
      return res.status(500).json({ error: 'CRITICAL ERROR: VAPID keys are missing.' });
    }

    // 2. Safely configure Web Push
    try {
      webpush.setVapidDetails(
        'mailto:itruth2011@gmail.com',
        pubKey,
        privKey
      );
    } catch (vapidError) {
      // IF THE KEYS ARE BAD, IT WILL PRINT THE EXACT REASON HERE!
      return res.status(500).json({ 
        error: "INVALID VAPID KEYS: " + vapidError.message + " (Check Vercel variables for quotes or typos)" 
      });
    }

    // 3. Check for alerts in Database
    const alerts = (await kv.get('psx_alerts')) || [];
    if (alerts.length === 0) return res.status(200).json({ message: 'No active alerts' });

    // 4. Fetch live prices
    const uniqueTickers = [...new Set(alerts.map(a => a.ticker))];
    const response = await fetch('https://dps.psx.com.pk/market-watch');
    const html = await response.text();
    
    const livePrices = {};
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;
    
    while ((rowMatch = rowRegex.exec(html)) !== null) {
      const rowHtml = rowMatch[1];
      const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      const cells = [];
      let cellMatch;
      
      while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
        const text = cellMatch[1].replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim().toUpperCase();
        cells.push(text);
      }
      
      if (cells.length >= 6) {
        const symbolText = cells[0];
        const price = parseFloat(cells[5].replace(/,/g, '')); 
        uniqueTickers.forEach(ticker => {
          if (symbolText === ticker || symbolText.startsWith(ticker + ' ')) {
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
