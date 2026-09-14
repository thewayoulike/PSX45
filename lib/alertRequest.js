import { requireOnlineUser } from './requireOnlineUser.js';
export async function alertRequest(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(204).end(); return null; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return null; }
  const gate = await requireOnlineUser(req);
  if (!gate.ok) { res.status(gate.status).json({ error: gate.error }); return null; }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return { user: gate.user, body };
  } catch { res.status(400).json({ error: 'Invalid JSON body.' }); return null; }
}
