import { fetchPsxOhlc } from '../lib/psxOhlc.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    return res.status(204).end();
  }
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const symbol = String(req.query.symbol || '').trim();
  if (!symbol) return res.status(400).json({ error: 'symbol is required' });

  try {
    const payload = await fetchPsxOhlc(symbol);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');
    return res.status(200).json(payload);
  } catch (e) {
    return res.status(502).json({ error: e.message || 'OHLC fetch failed' });
  }
}
