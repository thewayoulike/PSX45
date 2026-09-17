import { serverDb } from './serverDb.js';
import { requireOnlineUser } from './requireOnlineUser.js';
import { computeAccess } from './access.js';
import { limitRequest, sharedRateLimit } from './sharedRateLimit.js';
import { sendBrevo, escapeHtml } from './brevo.js';
import { approvalLink } from './approvalTokens.js';
export function accountAccessHandler(createRequest = false) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    if (!await limitRequest(req, res, 'access', 60)) return;
    const auth = await requireOnlineUser(req);
    if (!auth.ok) return res.status(401).json({ error: 'Please sign in again.' });
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
      const email = auth.user.email;
      if (body.email && String(body.email).trim().toLowerCase() !== email) return res.status(403).json({ error: 'Account mismatch' });
      const db = serverDb();
      const { data: row, error } = await db.from('allowlist').select('approved,approved_at,access_until,lifetime').eq('email', email).maybeSingle();
      if (error) throw error;
      if (createRequest && !row?.approved) {
        if (!row) {
          const { error: insertError } = await db.from('allowlist').upsert({ email, name: String(body.name || '').slice(0, 120), approved: false }, { onConflict: 'email', ignoreDuplicates: true });
          if (insertError) throw insertError;
        }
        if (await sharedRateLimit(`approval-mail:${email}`, 2, 3600)) {
          const link = await approvalLink(email);
          await sendBrevo(process.env.OWNER_EMAIL, 'PSX Tracker access request', `<p>Access request from ${escapeHtml(email)}</p><p><a href="${link}">Review approval</a></p>`);
        }
      }
      const access = computeAccess(row || { approved: false });
      return res.status(200).json({ ...access, pending: !access.approved, new: !row, accessStatus: access.status });
    } catch { return res.status(503).json({ error: 'Unable to check access. Please retry shortly.' }); }
  };
}
