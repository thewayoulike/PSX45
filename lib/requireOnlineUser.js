import { getBearerUser } from './verifyUser.js';
import { verifyGoogleAccessToken } from './googleToken.js';

async function googleUserFromBearer(req) {
  const h = (req.headers['authorization'] || req.headers['Authorization'] || '').toString();
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const google = await verifyGoogleAccessToken(m[1]);
  return google ? { id: google.sub, email: google.email } : null;
}

/**
 * Signed-in user only (email/password JWT or Google Drive access token).
 * Offline / signed-out clients have neither, so they cannot save/list/delete alerts.
 */
export async function requireOnlineUser(req) {
  const user = (await getBearerUser(req)) || (await googleUserFromBearer(req));
  if (!user) {
    return {
      ok: false,
      status: 401,
      error: 'Sign in required.',
    };
  }
  return { ok: true, user };
}
