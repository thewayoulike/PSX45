// lib/googleToken.js
// Verifies a Google OAuth access token was issued to PSX Tracker before trusting its identity.
// userinfo alone accepts a token minted for any app, so another site could replay its users' tokens here.

// Must match the client ID the app requests tokens with (src/services/driveStorage.ts).
const APP_FALLBACK_CLIENT_ID = '76622516302-malmubqvj1ms3klfsgr5p6jaom2o7e8s.apps.googleusercontent.com';

export function allowedGoogleClientIds() {
  return new Set([process.env.GOOGLE_CLIENT_ID, process.env.VITE_GOOGLE_CLIENT_ID, APP_FALLBACK_CLIENT_ID]
    .map(id => String(id || '').trim()).filter(Boolean));
}

/** Returns { sub, email } for a live token issued to this app, otherwise null. */
export async function verifyGoogleAccessToken(token, timeoutMs = 8000) {
  if (!token || token.length > 4096) return null;
  try {
    // POST keeps the token out of URLs and request logs.
    const r = await fetch('https://oauth2.googleapis.com/tokeninfo', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ access_token: token }), signal: AbortSignal.timeout(timeoutMs),
    });
    if (!r.ok) return null;
    const info = await r.json();
    const allowed = allowedGoogleClientIds();
    if (!allowed.has(info?.aud) && !allowed.has(info?.azp)) return null;
    if (!(Number(info.expires_in) > 0)) return null;
    if (!info.sub || !info.email || String(info.email_verified) !== 'true') return null;
    return { sub: String(info.sub), email: String(info.email).toLowerCase() };
  } catch {
    return null;
  }
}
