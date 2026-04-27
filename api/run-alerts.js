import { kv } from '@vercel/kv';
import webpush from 'web-push';

// Configure Web Push
webpush.setVapidDetails(
  'mailto:itruth2011@gmail.com', // <-- CHANGE THIS TO YOUR EMAIL
  process.env.VITE_VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

export default async function handler(req, res) {
  // Secure route so only your cron job can run it
  if (req.query.secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized. Invalid Secret.' });
  }

  try {
    const alerts = (await kv.get('psx_alerts')) || [];
    if (alerts.length === 0) return res.status(200).json({ message: 'No active alerts' });

    // 1. Find which tickers we actually need to fetch
    const uniqueTickers = [...new Set(alerts.map(a => a.ticker))];
    
    // 2. Fetch live prices (Bypasses CORS since it runs on the server)
    const response = await fetch('https://dps.psx.com.pk/market-watch');
    const html = await response.text();
    
    const livePrices = {};
    
    // 3. Safer HTML Table Parsing (Mimics frontend Sync logic)
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;
    
    while ((rowMatch = rowRegex.exec(html)) !== null) {
      const rowHtml = rowMatch[1];
      const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      const cells = [];
      let cellMatch;
      
      while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
        // Strip out <a> tags and spaces
        const text = cellMatch[1].replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim().toUpperCase();
        cells.push(text);
      }
      
      // Ensure we have enough columns (PSX table usually has 8 columns)
      if (cells.length >= 6) {
        const symbolText = cells[0];
        // Index 5 is 'CURRENT PRICE'
        const price = parseFloat(cells[5].replace(/,/g, '')); 
        
        uniqueTickers.forEach(ticker => {
          // Exact match or match with suffix (e.g., "OGDC XD", "NPL EX")
          if (symbolText === ticker || symbolText.startsWith(ticker + ' ')) {
            if (!isNaN(price) && price > 0) {
              livePrices[ticker] = price;
            }
          }
        });
      }
    }

    // 4. Check conditions & send pushes (Optimized for speed)
    let pushesSent = 0;
    
    // Process all alerts concurrently
    const processingPromises = alerts.map(async (alert) => {
      const currentPrice = livePrices[alert.ticker];
      
      // Keep if price not found
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
          return { keep: false }; // Successfully sent, delete it
        } catch (e) {
          if (e.statusCode === 410 || e.statusCode === 404) {
            return { keep: false }; // User unsubscribed, delete it
          } else {
            return { keep: true, alert }; // Temporary server error, keep it to try again
          }
        }
      } 
      
      // Condition not met, keep it
      return { keep: true, alert }; 
    });

    // Wait for all promises to finish at the same time
    const results = await Promise.all(processingPromises);
    
    // Filter out the ones we want to keep
    const alertsToKeep = results.filter(res => res.keep).map(res => res.alert);

    // 5. Update database
    await kv.set('psx_alerts', alertsToKeep);

    return res.status(200).json({ success: true, pushesSent, alertsRemaining: alertsToKeep.length });
  } catch (error) {
    console.error("Run Alerts Error:", error);
    return res.status(500).json({ error: error.message });
  }
}
