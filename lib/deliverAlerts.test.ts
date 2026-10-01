import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock('./alertsStore.js', () => ({ mutateAlerts: mock.mutate }));
import { deliverAlerts } from './deliverAlerts.js';
let alerts: any[];
const record = () => [{ sid: 's', rec: { userEmail: 'a@example.com', subscription: {}, alerts: structuredClone(alerts) } }];
beforeEach(() => {
  alerts = [{ id: 'a', ticker: 'AAA', direction: 'ABOVE', targetPrice: 10 }];
  mock.mutate.mockReset().mockImplementation(async (_sid, _owner, action, payload) => {
    const a = alerts.find(a => a.id === payload.id);
    if (!a) return {};
    if (action === 'claim') {
      if (a.delivery) return {};
      a.delivery = { token: payload.token };
      return { alert: a, subscription: {} };
    }
    if (action === 'finish' && a.delivery?.token === payload.token) {
      if (payload.outcome === 'sent') alerts = alerts.filter(x => x.id !== a.id);
      if (payload.outcome === 'retry') delete a.delivery;
    }
    return {};
  });
});
describe('delivery claims', () => {
  it('allows only one overlapping worker to send and preserves newly added alerts', async () => {
    const snapshot = record();
    const send = vi.fn(async () => { alerts.push({ id: 'new', ticker: 'BBB' }); });
    await Promise.all([deliverAlerts(snapshot, { AAA: 11 }, send), deliverAlerts(snapshot, { AAA: 11 }, send)]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(alerts.map(a => a.id)).toEqual(['new']);
  });
  it('does not send an alert deleted after the scan', async () => {
    const snapshot = record(); alerts = [];
    const send = vi.fn(); await deliverAlerts(snapshot, { AAA: 11 }, send);
    expect(send).not.toHaveBeenCalled();
  });
  it('holds ambiguous deliveries instead of resending', async () => {
    const send = vi.fn().mockRejectedValue(new Error('timeout'));
    expect(await deliverAlerts(record(), { AAA: 11 }, send)).toMatchObject({ unconfirmed: 1 });
    await deliverAlerts(record(), { AAA: 11 }, send);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('keeps alerts when the push subscription has expired, and stops sending to it this run', async () => {
    alerts.push({ id: 'b', ticker: 'AAA', direction: 'ABOVE', targetPrice: 5 });
    const send = vi.fn().mockRejectedValue({ statusCode: 410 });
    expect(await deliverAlerts(record(), { AAA: 11 }, send)).toMatchObject({ expired: 1 });
    expect(send).toHaveBeenCalledTimes(1);
    expect(alerts.map(a => a.id)).toEqual(['a', 'b']); expect(alerts.every(a => !a.delivery)).toBe(true);
  });
  it('retries rejections that prove nothing was delivered instead of leaving them stuck', async () => {
    for (const statusCode of [400, 401, 403, 413]) {
      alerts = [{ id: 'a', ticker: 'AAA', direction: 'ABOVE', targetPrice: 10 }];
      const err = vi.spyOn(console, 'error').mockImplementation(() => {});
      await deliverAlerts(record(), { AAA: 11 }, vi.fn().mockRejectedValue({ statusCode }));
      expect(alerts[0].delivery, String(statusCode)).toBeUndefined();
      err.mockRestore();
    }
  });
  it('releases an unconfirmed claim after two hours so the alert can fire again', async () => {
    const t0 = Date.parse('2026-10-01T05:00:00Z');
    alerts[0].delivery = { token: 'old', status: 'unconfirmed', claimedAt: new Date(t0).toISOString() };
    const send = vi.fn();
    expect(await deliverAlerts(record(), { AAA: 11 }, send, { now: () => t0 + 3600000 })).toMatchObject({ unconfirmed: 1, released: 0 });
    expect(await deliverAlerts(record(), { AAA: 11 }, send, { now: () => t0 + 2 * 3600000 + 1 })).toMatchObject({ released: 1 });
    expect(alerts[0].delivery).toBeUndefined(); expect(send).not.toHaveBeenCalled();
    await deliverAlerts(record(), { AAA: 11 }, send);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('does not start a claim after the run deadline, leaving the alert for the next run', async () => {
    const send = vi.fn();
    expect(await deliverAlerts(record(), { AAA: 11 }, send, { deadline: 100, now: () => 200 })).toMatchObject({ deferred: 1 });
    expect(send).not.toHaveBeenCalled(); expect(alerts[0].delivery).toBeUndefined();
  });
  it('retries an explicit rate-limit rejection', async () => {
    const send = vi.fn().mockRejectedValueOnce({ statusCode: 429 }).mockResolvedValueOnce(undefined);
    await deliverAlerts(record(), { AAA: 11 }, send);
    await deliverAlerts(record(), { AAA: 11 }, send);
    expect(send).toHaveBeenCalledTimes(2); expect(alerts).toEqual([]);
  });
});
