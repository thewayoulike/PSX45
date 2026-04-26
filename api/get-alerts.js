import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { endpoint } = body;
    
    if (!endpoint) return res.status(400).json({ error: 'Missing push endpoint' });

    const allAlerts = (await kv.get('psx_alerts')) || [];
    
    // Filter to only show alerts created by THIS specific browser/device
    const userAlerts = allAlerts.filter(a => a.subscription.endpoint === endpoint);

    return res.status(200).json({ alerts: userAlerts });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
