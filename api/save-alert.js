import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    
    // Expecting: { subscription, ticker, alerts: [{ price, direction }, ...] }
    const { subscription, ticker, alerts } = body;
    
    if (!subscription || !ticker || !Array.isArray(alerts) || alerts.length === 0) {
      return res.status(400).json({ error: 'Missing required data or empty alerts array' });
    }

    let existingAlerts = await kv.get('psx_alerts');
    if (!Array.isArray(existingAlerts)) existingAlerts = [];

    // Find alerts for this specific user and stock
    const userStockAlerts = existingAlerts.filter(a => 
        a.subscription.endpoint === subscription.endpoint && 
        a.ticker === ticker.toUpperCase()
    );

    let currentTpCount = userStockAlerts.filter(a => a.direction === 'ABOVE').length;
    let currentSlCount = userStockAlerts.filter(a => a.direction === 'BELOW').length;

    const newAlertsToSave = [];

    // Validate limits before saving anything
    for (const a of alerts) {
        if (a.direction === 'ABOVE') {
            if (currentTpCount >= 3) return res.status(400).json({ error: `Max 3 Target Price (TP) alerts allowed for ${ticker.toUpperCase()}. Please delete an old one first.` });
            currentTpCount++;
        } else {
            if (currentSlCount >= 3) return res.status(400).json({ error: `Max 3 Stop Loss (SL) alerts allowed for ${ticker.toUpperCase()}. Please delete an old one first.` });
            currentSlCount++;
        }
        
        newAlertsToSave.push({
            id: Date.now().toString() + Math.random().toString(36).substring(2, 8),
            subscription,
            ticker: ticker.toUpperCase(),
            targetPrice: Number(a.price),
            direction: a.direction,
            createdAt: new Date().toISOString()
        });
    }

    // Save all valid alerts
    existingAlerts.push(...newAlertsToSave);
    await kv.set('psx_alerts', existingAlerts);

    return res.status(200).json({ success: true, message: `Successfully saved ${alerts.length} alert(s)` });
  } catch (error) {
    console.error("Save Alert Error:", error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
