import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { subscription, ticker, targetPrice, direction } = req.body;
    
    // Get existing alerts or start a new array
    const existingAlerts = (await kv.get('psx_alerts')) || [];
    
    const newAlert = {
      id: Date.now().toString(),
      subscription,
      ticker: ticker.toUpperCase(),
      targetPrice: Number(targetPrice),
      direction, // 'ABOVE' or 'BELOW'
      createdAt: new Date().toISOString()
    };

    existingAlerts.push(newAlert);
    
    // Save back to KV Database
    await kv.set('psx_alerts', existingAlerts);

    return res.status(200).json({ success: true, message: 'Alert saved' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
