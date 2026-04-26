import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  // Allow CORS if necessary
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 1. Safely parse the body (handles both string and object formats)
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    
    // Safety check to ensure we have the data we need
    if (!body || !body.ticker) {
      return res.status(400).json({ error: 'Missing ticker or invalid body' });
    }

    const { subscription, ticker, targetPrice, direction } = body;
    
    // 2. Fetch existing alerts
    let existingAlerts = await kv.get('psx_alerts');
    
    // 3. Safely ensure it is an array. If it got corrupted, reset it.
    if (!Array.isArray(existingAlerts)) {
      existingAlerts = [];
    }
    
    const newAlert = {
      id: Date.now().toString(),
      subscription,
      ticker: ticker.toUpperCase(),
      targetPrice: Number(targetPrice),
      direction, // 'ABOVE' or 'BELOW'
      createdAt: new Date().toISOString()
    };

    existingAlerts.push(newAlert);
    
    // 4. Save back to KV Database
    await kv.set('psx_alerts', existingAlerts);

    return res.status(200).json({ success: true, message: 'Alert saved' });
  } catch (error) {
    console.error("Save Alert Error:", error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
