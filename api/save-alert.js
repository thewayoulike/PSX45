import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    
    if (!body || !body.ticker || !body.subscription || !body.subscription.endpoint) {
      return res.status(400).json({ error: 'Missing required data' });
    }

    const { subscription, ticker, targetPrice, direction } = body;
    let existingAlerts = await kv.get('psx_alerts');
    if (!Array.isArray(existingAlerts)) existingAlerts = [];

    // --- NEW: ENFORCE 3 TP / 3 SL LIMIT ---
    const userAlertsForThisStock = existingAlerts.filter(a => 
        a.subscription.endpoint === subscription.endpoint && 
        a.ticker === ticker.toUpperCase() &&
        a.direction === direction
    );

    if (userAlertsForThisStock.length >= 3) {
        const alertType = direction === 'ABOVE' ? 'Target Price (TP)' : 'Stop Loss (SL)';
        return res.status(400).json({ 
            error: `Limit reached: Max 3 ${alertType} alerts allowed for ${ticker.toUpperCase()}.` 
        });
    }
    // ---------------------------------------

    const newAlert = {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 6),
      subscription,
      ticker: ticker.toUpperCase(),
      targetPrice: Number(targetPrice),
      direction, // 'ABOVE' or 'BELOW'
      createdAt: new Date().toISOString()
    };

    existingAlerts.push(newAlert);
    await kv.set('psx_alerts', existingAlerts);

    return res.status(200).json({ success: true, message: 'Alert saved' });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
