import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { verifyGoogleAccessToken } from './googleToken.js';

const info = (over: Record<string, unknown> = {}) => new Response(JSON.stringify({
  aud: 'psx-client', azp: 'psx-client', sub: 'google-1', email: 'Member@Example.invalid', email_verified: 'true', expires_in: '3599', ...over,
}), { status: 200 });
beforeEach(() => { vi.stubEnv('GOOGLE_CLIENT_ID', 'psx-client'); vi.stubGlobal('fetch', vi.fn(async () => info())); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it('accepts a live, verified token issued to PSX Tracker and sends it in the body, not the URL', async () => {
  await expect(verifyGoogleAccessToken('token-abc')).resolves.toEqual({ sub: 'google-1', email: 'member@example.invalid' });
  const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
  expect(url).toBe('https://oauth2.googleapis.com/tokeninfo');
  expect(url).not.toContain('token-abc');
  expect((init.body as URLSearchParams).get('access_token')).toBe('token-abc');
});
it('rejects a token issued to any other app, even for a verified Google account', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(info({ aud: 'other-app', azp: 'other-app' }));
  await expect(verifyGoogleAccessToken('foreign')).resolves.toBeNull();
});
it('rejects expired, unverified, incomplete or unreadable tokens', async () => {
  for (const over of [{ expires_in: '0' }, { email_verified: 'false' }, { email: '' }, { sub: '' }]) {
    vi.mocked(fetch).mockResolvedValueOnce(info(over));
    await expect(verifyGoogleAccessToken('t')).resolves.toBeNull();
  }
  vi.mocked(fetch).mockResolvedValueOnce(new Response('{"error":"invalid_token"}', { status: 400 }));
  await expect(verifyGoogleAccessToken('t')).resolves.toBeNull();
  vi.mocked(fetch).mockRejectedValueOnce(new TypeError('network'));
  await expect(verifyGoogleAccessToken('t')).resolves.toBeNull();
  await expect(verifyGoogleAccessToken('')).resolves.toBeNull();
});
