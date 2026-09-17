import { serverDb } from '../lib/serverDb.js';
import { tokenHash, appOrigin } from '../lib/approvalTokens.js';
import { sendBrevo, escapeHtml } from '../lib/brevo.js';
import { limitRequest } from '../lib/sharedRateLimit.js';
const page = (title, body) => `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body><main><h1>${title}</h1>${body}</main></body></html>`;
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).send('Method not allowed');
  if (!await limitRequest(req, res, 'approval', 20)) return;
  const body = typeof req.body === 'string' ? Object.fromEntries(new URLSearchParams(req.body)) : req.body;
  const token = req.method === 'GET' ? req.query?.token : body?.token;
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return res.status(401).send(page('Invalid approval link', '<p>Request a new approval link.</p>'));
  try {
    const origin = appOrigin();
    const db = serverDb();
    if (req.method === 'GET') {
      const { data, error } = await db.from('approval_tokens').select('email,expires_at,used_at').eq('token_hash', tokenHash(token)).maybeSingle();
      if (error) throw error;
      if (!data || data.used_at || Date.parse(data.expires_at) <= Date.now()) return res.status(410).send(page('Link expired or used', '<p>Request a new approval link.</p>'));
      return res.status(200).send(page('Confirm account approval', `<p>Approve ${escapeHtml(data.email)}?</p><form method="post" action="/api/approve-user"><input type="hidden" name="token" value="${token}"><button type="submit">Approve this account</button></form>`));
    }
    if (req.headers.origin && req.headers.origin !== origin) return res.status(403).send('Invalid origin');
    const { data, error } = await db.rpc('psx_consume_approval', { p_hash: tokenHash(token) });
    if (error) throw error;
    if (!data) return res.status(410).send(page('Link expired or used', '<p>No account was changed.</p>'));
    try { await sendBrevo(data, 'Your PSX Tracker account is activated', `<p>Your account is approved.</p><p><a href="${origin}">Open PSX Tracker</a></p>`); }
    catch { console.error('Activation email delivery failed'); }
    return res.status(200).send(page('Account approved', `<p>${escapeHtml(data)} can now log in.</p>`));
  } catch { return res.status(503).send(page('Approval unavailable', '<p>Please retry shortly.</p>')); }
}
