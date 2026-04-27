import { kv } from '@vercel/kv';
import webpush from 'web-push';

export default async function handler(req, res) {
  // Secure route so only your cron job can run it
  if (req.query.secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized. Invalid Secret.' });
  }

  try {
    // 1. Check for missing variables FIRST
    if (!process.env.VITE_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
      return res.status(500).json({ 
        error: 'CRITICAL ERROR: VAPID keys are missing from Vercel Environment Variables! Make sure they are applied to the Production environment.' 
      });
    }

    // 2. Configure Web Push safely inside the try/catch block
    webpush.setVapidDetails(
      'mailto:itruth2011@gmail.com',
      process.env.VITE_VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );

    const alerts = (await kv.get('psx_alerts')) || [];
    if (alerts.length === 0) return res.status(200).json({ message: 'No active alerts' });

    // 3. Find which tickers we actually need to fetch
    const uniqueTickers = [...new Set(alerts.map(a => a.ticker))];
    
    // 4. Fetch live prices (Bypasses CORS since it runs on the server)
    const response = await fetch('https://dps.psx.com.pk/market-watch');
    const html = await response.text();
    
    const livePrices = {};
    
    // 5. Safer HTML Table Parsing (Mimics frontend Sync logic)
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

    // 6. Check conditions & send pushes
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

    // 7. Update database
    await kv.set('psx_alerts', alertsToKeep);

    return res.status(200).json({ success: true, pushesSent, alertsRemaining: alertsToKeep.length });
    
  } catch (error) {
    // If anything fails now, it will print the exact reason to the browser!
    console.error("Run Alerts Error:", error);
    return res.status(500).json({ error: error.message });
  }
}
