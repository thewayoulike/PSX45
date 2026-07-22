import { sidFor, getRecord } from '../lib/alertsStore.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { endpoint } = body;

    if (!endpoint) return res.status(400).json({ error: 'Missing push endpoint' });

    const record = await getRecord(sidFor(endpoint));
    return res.status(200).json({ alerts: record?.alerts || [] });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
