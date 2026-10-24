import { createPracticeBroker } from '../lib/practiceTrading.js';
import { requireOnlineUser } from '../lib/requireOnlineUser.js';
import { serverDb } from '../lib/serverDb.js';
import { limitRequest, sharedRateLimit } from '../lib/sharedRateLimit.js';

export function createPracticeHandler({ broker = createPracticeBroker(), authenticate = requireOnlineUser, db = serverDb, limit = limitRequest, userLimit = sharedRateLimit } = {}) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    if (!String(req.headers['content-type'] || '').includes('application/json')) return res.status(415).json({ error: 'JSON required.' });
    if (!await limit(req, res, 'practice', 90)) return;
    try {
      const auth = await authenticate(req);
      if (!auth.ok) return res.status(401).json({ error: 'Sign in to use practice trading.' });
      const email = String(auth.user.email).trim().toLowerCase();
      const { data, error } = await db().from('allowlist').select('approved').eq('email', email).maybeSingle();
      if (error) throw error;
      if (!data?.approved) return res.status(403).json({ error: 'Your account does not have access to practice trading.' });
      if (!await userLimit(`practice-user:${email}`, 60, 60)) return res.status(429).json({ error: 'Please wait a moment before trying again.' });
      let body;
      try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch { return res.status(400).json({ error: 'Invalid request.' }); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) return res.status(400).json({ error: 'Invalid request.' });
      // Account selection is exclusively derived from the verified login, never from client IDs.
      const allowed = { snapshot: ['action', 'offset'], start: ['action'], quote: ['action', 'symbol'], order: ['action', 'order'], cancel: ['action', 'orderId'] };
      if (!Object.hasOwn(allowed, body.action) || Object.keys(body).some(k => !allowed[body.action].includes(k))) return res.status(400).json({ error: 'Invalid practice request.' });
      switch (body.action) {
        case 'snapshot': return res.status(200).json(await broker.snapshot(email, body.offset ?? 0));
        case 'start': await broker.start(email); return res.status(200).json(await broker.snapshot(email));
        case 'quote': return res.status(200).json(await broker.quote(body.symbol));
        case 'order': return res.status(200).json({ order: await broker.place(email, body.order) });
        case 'cancel': return res.status(200).json({ order: await broker.cancel(email, body.orderId) });
      }
    } catch (e) {
      // Never return provider bodies, credential values or database diagnostics.
      return res.status(e.safe && Number.isInteger(e.status) ? e.status : 503).json({ error: e.safe ? e.message : 'Practice trading is temporarily unavailable. Please retry.', code: e.safe ? e.code : 'PRACTICE_UNAVAILABLE' });
    }
  };
}
export default createPracticeHandler();
