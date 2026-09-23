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
  it('drops an alert when the push subscription is gone', async () => {
    const send = vi.fn().mockRejectedValue({ statusCode: 410 });
    await deliverAlerts(record(), { AAA: 11 }, send);
    expect(alerts).toEqual([]);
  });
  it('retries an explicit rate-limit rejection', async () => {
    const send = vi.fn().mockRejectedValueOnce({ statusCode: 429 }).mockResolvedValueOnce(undefined);
    await deliverAlerts(record(), { AAA: 11 }, send);
    await deliverAlerts(record(), { AAA: 11 }, send);
    expect(send).toHaveBeenCalledTimes(2); expect(alerts).toEqual([]);
  });
});
