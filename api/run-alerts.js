import { kv } from '@vercel/kv';
import webpush from 'web-push';

// Configure Web Push
webpush.setVapidDetails(
  'mailto:itruth2011@gmail.com', // <-- CHANGE THIS TO YOUR EMAIL
  process.env.VAPID_PUBLIC_KEY,
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
    
    // Quick Regex parsing to extract prices
    const livePrices = {};
    uniqueTickers.forEach(ticker => {
      const regex = new RegExp(`${ticker}.*?<td[^>]*>.*?</td>.*?<td[^>]*>([\\d,.]+)</td>`, 'is');
      const match = html.match(regex);
      if (match && match[1]) {
        livePrices[ticker] = parseFloat(match[1].replace(/,/g, ''));
      }
    });

    // 3. Check conditions & send pushes (Optimized for speed)
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

    // 4. Update database
    await kv.set('psx_alerts', alertsToKeep);

    return res.status(200).json({ success: true, pushesSent, alertsRemaining: alertsToKeep.length });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
