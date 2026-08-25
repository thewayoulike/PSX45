import { sidFor, getRecord, putRecord } from '../lib/alertsStore.js';
import { requireOnlineUser } from '../lib/requireOnlineUser.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const gate = await requireOnlineUser(req);
    if (!gate.ok) return res.status(gate.status).json({ error: gate.error });

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { subscription, ticker, alerts } = body;

    if (!subscription?.endpoint || !ticker || !Array.isArray(alerts) || alerts.length === 0) {
      return res.status(400).json({ error: 'Missing required data or empty alerts array' });
    }

    const sid = sidFor(subscription.endpoint);
    const record = (await getRecord(sid)) || { subscription, alerts: [] };
    record.subscription = subscription;
    record.userEmail = gate.user.email;

    const T = ticker.toUpperCase();
    const existing = record.alerts.filter((a) => a.ticker === T);
    let tpCount = existing.filter((a) => a.direction === 'ABOVE').length;
    let slCount = existing.filter((a) => a.direction === 'BELOW').length;

    const toAdd = [];
    for (const a of alerts) {
      const price = Number(a.price);
      if (!Number.isFinite(price) || price <= 0) {
        return res.status(400).json({ error: 'Each alert needs a valid price.' });
      }
      const direction = a.direction === 'ABOVE' ? 'ABOVE' : 'BELOW';
      if (direction === 'ABOVE') {
        if (tpCount >= 3) return res.status(400).json({ error: `Max 3 Target Price (TP) alerts allowed for ${T}. Please delete an old one first.` });
        tpCount++;
      } else {
        if (slCount >= 3) return res.status(400).json({ error: `Max 3 Stop Loss (SL) alerts allowed for ${T}. Please delete an old one first.` });
        slCount++;
      }
      toAdd.push({
        id: Date.now().toString() + Math.random().toString(36).slice(2, 8),
        ticker: T,
        targetPrice: price,
        direction,
        createdAt: new Date().toISOString()
      });
    }

    record.alerts.push(...toAdd);
    await putRecord(sid, record);

    return res.status(200).json({ success: true, message: `Successfully saved ${toAdd.length} alert(s)` });
  } catch (error) {
    console.error('Save Alert Error:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
