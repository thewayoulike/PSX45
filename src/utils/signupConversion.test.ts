import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GOOGLE_ADS_SIGNUP_DESTINATION } from '../../config/site.js';

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

it('sends the exact sign-up conversion once per account without personal data', async () => {
  const gtag = vi.fn();
  vi.stubGlobal('window', { location: { hostname: 'www.psx-tracker.com' }, gtag });
  const { trackSuccessfulSignup } = await import('./signupConversion');
  trackSuccessfulSignup(' New@example.invalid ');
  trackSuccessfulSignup('new@example.invalid');
  expect(gtag).toHaveBeenCalledOnce();
  expect(gtag).toHaveBeenCalledWith('event', 'conversion', {
    send_to: GOOGLE_ADS_SIGNUP_DESTINATION,
  });
  expect(JSON.stringify(gtag.mock.calls)).not.toContain('example.invalid');
});

it.each(['localhost', '127.0.0.1', 'preview.vercel.app'])('does not report test sign-ups from %s', async hostname => {
  const gtag = vi.fn();
  vi.stubGlobal('window', { location: { hostname }, gtag });
  const { trackSuccessfulSignup } = await import('./signupConversion');
  trackSuccessfulSignup('new@example.invalid');
  expect(gtag).not.toHaveBeenCalled();
});

it('allows the canonical domain and does not block registration when the tag is missing or throws', async () => {
  const page = { location: { hostname: 'psx-tracker.com' }, gtag: undefined as undefined | ReturnType<typeof vi.fn> };
  vi.stubGlobal('window', page);
  const { trackSuccessfulSignup } = await import('./signupConversion');
  expect(() => trackSuccessfulSignup('new@example.invalid')).not.toThrow();
  page.gtag = vi.fn(() => { throw new Error('blocked'); });
  expect(() => trackSuccessfulSignup('new@example.invalid')).not.toThrow();
  page.gtag = vi.fn();
  trackSuccessfulSignup('new@example.invalid');
  expect(page.gtag).toHaveBeenCalledOnce();
});
