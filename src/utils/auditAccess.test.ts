import { afterEach, describe, expect, it, vi } from 'vitest';
import { computeAccess } from '../../lib/access.js';
import { isCronAuthorized } from '../../lib/cronAuth.js';
import { consumeDailyQuota, setQuotaAccount, tryRecordProfileOpen } from './freemiumQuotas';
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); setQuotaAccount(null); });
describe('access audit regressions', () => {
  it('never renews undated or invalid approval dates and preserves paid/lifetime access', () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 0, 1));
    for (const approved_at of [null, 'invalid']) {
      expect(computeAccess({ approved: true, approved_at })).toMatchObject({ plan: 'free', trialEnds: null });
    }
    clock.mockReturnValue(Date.UTC(2026, 1, 1));
    expect(computeAccess({ approved: true })).toMatchObject({ plan: 'free', trialEnds: null });
    expect(computeAccess({ approved: true, lifetime: true }).plan).toBe('lifetime');
    expect(computeAccess({ approved: true, access_until: '2027-01-01' }).plan).toBe('paid');
  });
  it('rejects missing cron configuration and query-only credentials', () => {
    expect(isCronAuthorized({ headers: {} }, '')).toBe(false);
    expect(isCronAuthorized({ headers: {}, query: { secret: 'abc' } }, 'abc')).toBe(false);
    expect(isCronAuthorized({ headers: { authorization: 'Bearer wrong' } }, 'abc')).toBe(false);
    expect(isCronAuthorized({ headers: { authorization: 'Bearer abc' } }, 'abc')).toBe(true);
  });
  it('separates browser counters on account switching and restores prior consumption', () => {
    const map = new Map();
    vi.stubGlobal('localStorage', { getItem: (k: string) => map.get(k), setItem: (k: string, v: string) => map.set(k, v) });
    setQuotaAccount('a@example.com');
    expect(consumeDailyQuota('ai', 1).ok).toBe(true);
    expect(tryRecordProfileOpen('AAA', 1).ok).toBe(true);
    setQuotaAccount('b@example.com');
    expect(consumeDailyQuota('ai', 1).ok).toBe(true);
    expect(tryRecordProfileOpen('BBB', 1).ok).toBe(true);
    setQuotaAccount('A@EXAMPLE.COM');
    expect(consumeDailyQuota('ai', 1).ok).toBe(false);
    expect(tryRecordProfileOpen('CCC', 1).ok).toBe(false);
  });
});
