import { getBearerUser } from './verifyUser.js';

async function googleUserFromBearer(req) {
  const h = (req.headers['authorization'] || req.headers['Authorization'] || '').toString();
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  try {
    const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${m[1]}` },
    });
    if (!r.ok) return null;
    const d = await r.json();
    if (!d?.email) return null;
    return { id: d.sub || d.email, email: String(d.email).toLowerCase() };
  } catch {
    return null;
  }
}

/**
 * Signed-in user only (email/password JWT or Google Drive access token).
 * Guest Mode has neither, so it cannot save/list/delete alerts.
 */
export async function requireOnlineUser(req) {
  const user = (await getBearerUser(req)) || (await googleUserFromBearer(req));
  if (!user) {
    return {
      ok: false,
      status: 401,
      error: 'Sign in required. Guest Mode cannot save alerts.',
    };
  }
  return { ok: true, user };
}
