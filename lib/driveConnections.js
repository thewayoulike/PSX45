import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { serverDb } from './serverDb.js';
import { getBearerUser } from './verifyUser.js';
import { requireOnlineUser } from './requireOnlineUser.js';

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const emailOf = value => String(value || '').trim().toLowerCase();
const failure = (status, message) => Object.assign(new Error(message), { status });
function config() {
  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const key = Buffer.from(process.env.DRIVE_TOKEN_ENCRYPTION_KEY || '', 'base64');
  const origin = new URL(process.env.APP_URL || 'https://www.psx-tracker.com').origin;
  if (!clientId || !clientSecret || key.length !== 32) throw failure(503, 'Remembered Drive connections are not configured yet.');
  return { clientId, clientSecret, key, origin };
}
export function encryptDriveToken(token, email, subject, key = config().key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(`${emailOf(email)}|${subject}`));
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), ciphertext.toString('base64')].join('.');
}
export function decryptDriveToken(value, email, subject, key = config().key) {
  const [version, iv, tag, data, extra] = String(value).split('.');
  if (version !== 'v1' || !iv || !tag || !data || extra) throw new Error('Invalid encrypted connection');
  const cipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  cipher.setAAD(Buffer.from(`${emailOf(email)}|${subject}`));
  cipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([cipher.update(Buffer.from(data, 'base64')), cipher.final()]).toString('utf8');
}
async function googleTokens(params, cfg) {
  const result = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', signal: AbortSignal.timeout(12000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, ...params }),
  });
  const data = await result.json().catch(() => ({}));
  if (!result.ok) {
    if (data.error === 'invalid_grant') throw failure(409, 'Google permission has expired or been revoked. Authorize Drive once to reconnect.');
    throw failure(503, 'Google Drive could not be reached. Please retry shortly.');
  }
  if (!data.access_token || !Number.isFinite(Number(data.expires_in)) || Number(data.expires_in) <= 60) throw failure(503, 'Google returned an incomplete connection.');
  return data;
}
async function googleIdentity(token) {
  const result = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000),
  });
  if (!result.ok) throw failure(401, 'Could not verify the Google account.');
  const user = await result.json();
  if (!user.sub || !user.email || user.email_verified !== true) throw failure(401, 'A verified Google account is required.');
  return { sub: String(user.sub), email: emailOf(user.email), name: user.name || user.email, picture: user.picture || '' };
}
async function readConnection(email) {
  const { data, error } = await serverDb().from('drive_connections').select('*').eq('email', email).maybeSingle();
  if (error) throw failure(503, 'Saved Drive connections are temporarily unavailable.');
  return data;
}
async function passwordIdentity(req) {
  const user = await getBearerUser(req);
  if (!user) return null;
  // The token has already been validated by Supabase getUser; never trust unverified claims.
  try {
    const token = String(req.headers.authorization || req.headers.Authorization || '').replace(/^Bearer\s+/i, '');
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    if (claims.sub !== user.id || !claims.session_id) return null;
    return { ...user, email: emailOf(user.email), claims };
  } catch { return null; }
}
function recentEmailProof(user) {
  const now = Date.now() / 1000;
  return (user.claims.amr || []).some(a => ['otp', 'magiclink', 'recovery', 'email/signup'].includes(a.method)
    && Number(a.timestamp) >= now - 900 && Number(a.timestamp) <= now + 60);
}
function binding(user) {
  return { auth_user_id: user.id, linked_session_id: user.claims.session_id, linked_at: new Date().toISOString() };
}
function mayResume(row, user) {
  if (!row || row.auth_user_id !== user.id) return false;
  if (row.linked_session_id === user.claims.session_id) return true;
  const linked = Date.parse(row.linked_at) / 1000;
  // A session predating the explicit link must not acquire new Drive access merely by refreshing.
  return (user.claims.amr || []).some(a => ['password', 'otp', 'magiclink', 'recovery', 'email/signup'].includes(a.method)
    && Number(a.timestamp) > linked);
}
const browserSession = (tokens, user) => ({ connected: true, accessToken: tokens.access_token,
  expiresIn: Number(tokens.expires_in), user: { email: user.email, name: user.name, picture: user.picture } });

/** Served through cloud-sync so the deployment stays within its API-entrypoint budget. */
export async function handleDriveConnection(req, res, body) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  try {
    if (body.action === 'drive-config') {
      try { const cfg = config(); return res.status(200).json({ enabled: true, clientId: cfg.clientId }); }
      catch { return res.status(200).json({ enabled: false }); }
    }
    const cfg = config();
    if (req.headers.origin !== cfg.origin || req.headers['x-requested-with'] !== 'PSXTracker') {
      throw failure(403, 'Open this action from PSX Tracker.');
    }
    const passwordUser = await passwordIdentity(req);
    if (body.action === 'drive-connect') {
      if (typeof body.code !== 'string' || body.code.length < 10 || body.code.length > 4096) throw failure(400, 'Invalid Google authorization response.');
      if ((req.headers.authorization || req.headers.Authorization) && !passwordUser) throw failure(401, 'Sign in again before linking Drive.');
      const tokens = await googleTokens({ code: body.code, grant_type: 'authorization_code', redirect_uri: cfg.origin }, cfg);
      if (!String(tokens.scope || '').split(' ').includes(DRIVE_SCOPE)) throw failure(403, 'Allow access to PSX Tracker files in Google Drive to open your portfolio.');
      const google = await googleIdentity(tokens.access_token);
      const expected = passwordUser?.email || emailOf(body.expectedEmail);
      if (expected && expected !== google.email) throw failure(403, `Choose ${expected} in Google to open that account’s portfolio.`);
      const existing = await readConnection(google.email);
      if (existing && existing.google_sub !== google.sub) throw failure(409, 'The saved connection belongs to a different Google identity. Contact support.');
      const refresh = tokens.refresh_token || (existing && decryptDriveToken(existing.refresh_ciphertext, google.email, google.sub, cfg.key));
      if (!refresh) throw failure(409, 'Google did not grant a remembered connection. Reauthorize PSX Tracker in your Google account to enable password-based Drive access.');
      const linked = passwordUser ? binding(passwordUser) : {
        auth_user_id: existing?.auth_user_id || null, linked_session_id: existing?.linked_session_id || null, linked_at: existing?.linked_at || null,
      };
      const { error } = await serverDb().from('drive_connections').upsert({
        email: google.email, google_sub: google.sub, connection_id: randomUUID(),
        refresh_ciphertext: encryptDriveToken(refresh, google.email, google.sub, cfg.key),
        ...linked, updated_at: new Date().toISOString(),
      }, { onConflict: 'email' });
      if (error) throw failure(503, 'Could not save the Drive connection. Your portfolio files are unchanged.');
      return res.status(200).json(browserSession(tokens, google));
    }
    if (body.action === 'drive-disconnect') {
      const auth = await requireOnlineUser(req);
      if (!auth.ok) throw failure(401, 'Sign in to disconnect Drive.');
      const row = await readConnection(emailOf(auth.user.email));
      if (!row) return res.status(200).json({ disconnected: true });
      if (passwordUser ? !mayResume(row, passwordUser) : row.google_sub !== auth.user.id) throw failure(403, 'This connection does not belong to your sign-in.');
      const refresh = decryptDriveToken(row.refresh_ciphertext, row.email, row.google_sub, cfg.key);
      const { error } = await serverDb().from('drive_connections').delete().eq('email', row.email).eq('connection_id', row.connection_id);
      if (error) throw failure(503, 'Could not disconnect Drive. Please retry.');
      // Delete the stored credential even if Google's revocation endpoint is temporarily unavailable.
      await fetch('https://oauth2.googleapis.com/revoke', { method: 'POST', signal: AbortSignal.timeout(10000),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: refresh }),
      }).catch(() => {});
      return res.status(200).json({ disconnected: true });
    }
    if (!passwordUser) throw failure(401, 'Sign in with your password to open your saved Drive connection.');
    const row = await readConnection(passwordUser.email);
    if (!row) return res.status(200).json({ connected: false, reason: 'not-linked' });
    if (body.action === 'drive-bind') {
      // Password setup/reset must prove current inbox ownership, including legacy auto-confirmed accounts.
      if (!recentEmailProof(passwordUser)) throw failure(403, 'Use a fresh password setup or recovery email to link this account.');
      const { data: linked, error } = await serverDb().from('drive_connections').update({ ...binding(passwordUser), connection_id: randomUUID() }).eq('email', row.email).eq('connection_id', row.connection_id).select('email').maybeSingle();
      if (error) throw failure(503, 'Could not link password access to Drive.');
      if (!linked) throw failure(409, 'The Drive connection changed. Please retry.');
      return res.status(200).json({ connected: true });
    }
    if (body.action !== 'drive-token') throw failure(400, 'Invalid Drive connection action.');
    if (!mayResume(row, passwordUser)) return res.status(200).json({ connected: false, reason: 'verification-required' });
    const refresh = decryptDriveToken(row.refresh_ciphertext, row.email, row.google_sub, cfg.key);
    const tokens = await googleTokens({ refresh_token: refresh, grant_type: 'refresh_token' }, cfg);
    const google = await googleIdentity(tokens.access_token);
    if (google.email !== row.email || google.sub !== row.google_sub) throw failure(403, 'The saved Google identity no longer matches this account.');
    if (tokens.refresh_token) {
      const { error } = await serverDb().from('drive_connections').update({
        refresh_ciphertext: encryptDriveToken(tokens.refresh_token, row.email, row.google_sub, cfg.key), updated_at: new Date().toISOString(),
      }).eq('email', row.email).eq('connection_id', row.connection_id);
      if (error) throw failure(503, 'Could not renew the saved Drive connection.');
    }
    const latest = await readConnection(row.email);
    if (!latest || latest.connection_id !== row.connection_id) throw failure(409, 'The Drive connection changed. Please retry.');
    return res.status(200).json(browserSession(tokens, google));
  } catch (error) {
    return res.status(error.status || 503).json({ error: error.status ? error.message : 'Saved Drive connection unavailable. Please retry.' });
  }
}
