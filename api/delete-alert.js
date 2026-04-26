import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { id } = body;
    
    if (!id) return res.status(400).json({ error: 'Missing alert ID' });

    let allAlerts = (await kv.get('psx_alerts')) || [];
    allAlerts = allAlerts.filter(a => a.id !== id);
    
    await kv.set('psx_alerts', allAlerts);

    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
