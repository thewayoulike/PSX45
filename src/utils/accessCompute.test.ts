import { createRequire } from 'module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { computeAccess, TRIAL_DAYS } = require('../../lib/access.js');

describe('computeAccess freemium', () => {
  it('returns free (active) after trial with no access_until', () => {
    const approvedAt = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
    const r = computeAccess({ approved: true, approved_at: approvedAt, access_until: null, lifetime: false });
    expect(r.status).toBe('free');
    expect(r.active).toBe(true);
    expect(r.plan).toBe('free');
  });

  it('uses a 15-day full trial, then Free caps of 5 stocks, 3 funds, and 10 profiles', () => {
    expect(TRIAL_DAYS).toBe(15);
    const approvedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const r = computeAccess({ approved: true, approved_at: approvedAt, lifetime: false });
    expect(r.status).toBe('trial');
    expect(r.active).toBe(true);
    expect(r.daysLeft).toBeGreaterThan(0);
    expect(r.daysLeft).toBeLessThanOrEqual(15);
    const free = computeAccess({
      approved: true,
      approved_at: new Date(Date.now() - 16 * 24 * 60 * 60 * 1000).toISOString(),
      lifetime: false,
    });
    expect(free.status).toBe('free');
    expect(free.quotas.stockTickers).toBe(5);
    expect(free.quotas.fundTickers).toBe(3);
    expect(free.quotas.stockProfiles).toBe(10);
  });

  it('keeps paid active when access_until is in the future', () => {
    const until = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
    const r = computeAccess({
      approved: true,
      approved_at: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(),
      access_until: until,
      lifetime: false,
    });
    expect(r.status).toBe('paid');
    expect(r.active).toBe(true);
    expect(r.plan).toBe('paid');
  });

  it('maps lapsed paid (past access_until) to free', () => {
    const until = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const r = computeAccess({
      approved: true,
      approved_at: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
      access_until: until,
      lifetime: false,
    });
    expect(r.status).toBe('free');
    expect(r.active).toBe(true);
  });
});
