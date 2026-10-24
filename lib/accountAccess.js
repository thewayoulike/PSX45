import { serverDb } from './serverDb.js';
import { requireOnlineUser } from './requireOnlineUser.js';
import { computeAccess } from './access.js';
import { limitRequest, releaseSharedRateLimit, sharedRateLimit } from './sharedRateLimit.js';
import { sendBrevo, escapeHtml } from './brevo.js';
const SEEN_EVERY_MS = 15 * 60 * 1000;
const NOTICE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
const ACCOUNT_FIELDS = 'approved,approved_at,access_until,lifetime,created_at,name,owner_notified_at';
/** Best effort: a missing column or a failed write never blocks the access check. */
function shouldTellOwner(row) {
  if (!row) return true;
  if (!row.approved || row.owner_notified_at || !row.created_at) return false;
  const created = Date.parse(row.created_at);
  return Number.isFinite(created) && Date.now() - created < NOTICE_WINDOW_MS;
}
async function tellOwner(db, email, name) {
  const key = `signup-notice:${email}`;
  if (!await sharedRateLimit(key, 1, 86400)) return;
  try {
    await sendBrevo(process.env.OWNER_EMAIL || 'psxtracking@gmail.com', 'PSX Tracker: new user registered', `<p>A new user has registered.</p><p>${escapeHtml(name || 'No name given')}<br>${escapeHtml(email)}</p>`);
    const { error } = await db.from('allowlist').update({ owner_notified_at: new Date().toISOString() }).eq('email', email);
    if (error) console.error('[signup-mail] sent but not recorded', error.message);
  } catch (error) {
    console.error('[signup-mail]', error instanceof Error ? error.message : error);
    try { await releaseSharedRateLimit(key); } catch { /* the next visit retries */ }
  }
}
async function loadAccount(db, email) {
  let result = await db.from('allowlist').select(ACCOUNT_FIELDS).eq('email', email).maybeSingle();
  if (result.error) result = await db.from('allowlist').select('approved,approved_at,access_until,lifetime,created_at,name').eq('email', email).maybeSingle();
  return result;
}
async function noteSeen(db, email) {
  const now = Date.now();
  try {
    await db.from('allowlist')
      .update({ last_seen_at: new Date(now).toISOString() })
      .eq('email', email)
      .or(`last_seen_at.is.null,last_seen_at.lt.${new Date(now - SEEN_EVERY_MS).toISOString()}`);
  } catch { /* ignore */ }
}
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
      const { data: row, error } = await loadAccount(db, email);
      if (error) throw error;
      if (row) await noteSeen(db, email);
      let account = row;
      // New users start their trial immediately; an existing unapproved row is a disabled account and stays blocked.
      if (createRequest && !row) {
        const name = String(body.name || '').slice(0, 120);
        account = { approved: true, approved_at: new Date().toISOString(), access_until: null, lifetime: false };
        const insert = row => db.from('allowlist').upsert(row, { onConflict: 'email', ignoreDuplicates: true });
        let { error: insertError } = await insert({ email, name, ...account, registered_at: account.approved_at });
        // Sign-up must keep working if the registered_at migration hasn't run yet.
        if (insertError) ({ error: insertError } = await insert({ email, name, ...account }));
        if (insertError) throw insertError;
      }
      if (createRequest && shouldTellOwner(row)) await tellOwner(db, email, String(row?.name || body.name || '').slice(0, 120));
      const access = computeAccess(account || { approved: false });
      return res.status(200).json({
        ...access, pending: !access.approved, new: !row, accessStatus: access.status,
        accountEmail: email,
        // Private projection rollout is tied to the verified token identity, never the request body.
        features: { chartProjection: access.active && email === 'itruth2011@gmail.com' },
      });
    } catch { return res.status(503).json({ error: 'Unable to check access. Please retry shortly.' }); }
  };
}
