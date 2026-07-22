import { sidFor, getRecord, putRecord, deleteRecord } from '../lib/alertsStore.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { id, endpoint } = body;

    if (!id || !endpoint) return res.status(400).json({ error: 'Missing alert ID or endpoint' });

    const sid = sidFor(endpoint);
    const record = await getRecord(sid);
    if (!record) return res.status(200).json({ success: true });

    // Auth: a caller can only delete alerts that live under their own subscription.
    record.alerts = record.alerts.filter((a) => a.id !== id);

    if (record.alerts.length === 0) await deleteRecord(sid);
    else await putRecord(sid, record);

    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
