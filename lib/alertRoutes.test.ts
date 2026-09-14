import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ gate: vi.fn(), rpc: vi.fn(), lookup: vi.fn() }));
vi.mock('./requireOnlineUser.js', () => ({ requireOnlineUser: mocks.gate }));
vi.mock('./alertsStore.js', () => ({ sidFor: (s: string) => s, mutateAlerts: mocks.rpc }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.lookup }) }) }) }) }));
import save from '../api/save-alert.js';
import list from '../api/get-alerts.js';
import remove from '../api/delete-alert.js';
const subscription = { endpoint: 'https://push.example/test', keys: { auth: 'a', p256dh: 'b' } };
const body = () => ({ subscription, endpoint: subscription.endpoint, ticker: 'AAA', alerts: [{ price: 10, direction: 'ABOVE' }], id: 'one' });
async function call(handler: any, input: any = body()) {
  const res: any = { setHeader: vi.fn(), end: vi.fn(), status: vi.fn(function(this: any, code) { this.code = code; return this; }),
    json: vi.fn(function(this: any, data) { this.data = data; return this; }) };
  await handler({ method: 'POST', body: input, headers: {} }, res);
  return res;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.gate.mockResolvedValue({ ok: true, user: { email: 'a@example.com' } });
  mocks.lookup.mockResolvedValue({ data: { approved: true, approved_at: '2020-01-01' }, error: null });
  mocks.rpc.mockResolvedValue({ alerts: [] });
});
describe('alert route authorization and validation', () => {
  it.each([save, list, remove])('requires authentication', async handler => {
    mocks.gate.mockResolvedValue({ ok: false, status: 401, error: 'Sign in' });
    expect((await call(handler)).code).toBe(401); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([save, list, remove])('passes the verified owner and propagates ownership rejection', async handler => {
    mocks.rpc.mockRejectedValue(Object.assign(new Error('Wrong owner'), { status: 403 }));
    expect((await call(handler, { ...body(), userEmail: 'victim@example.com' })).code).toBe(403);
    expect(mocks.rpc.mock.calls[0][1]).toBe('a@example.com');
  });
  it('denies pending accounts and lookup outages without storage mutations', async () => {
    mocks.lookup.mockResolvedValue({ data: { approved: false } });
    expect((await call(save)).code).toBe(403);
    mocks.lookup.mockResolvedValue({ data: null, error: new Error('DB unavailable') });
    expect((await call(save)).code).toBe(503);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([
    [{ approved: true, approved_at: '2020-01-01' }, 3],
    [{ approved: true, approved_at: new Date().toISOString() }, 15],
    [{ approved: true, access_until: '2099-01-01' }, 15],
    [{ approved: true, lifetime: true }, 15],
  ])('sends server-derived limits to the transaction', async (row, limit) => {
    mocks.lookup.mockResolvedValue({ data: row });
    expect((await call(save)).code).toBe(200);
    expect(mocks.rpc.mock.calls[0][3].quotas.alertsTickers).toBe(limit);
  });
  it('rejects malformed JSON and invalid directions before persistence', async () => {
    expect((await call(save, '{')).code).toBe(400);
    expect((await call(save, { ...body(), alerts: [{ price: 10, direction: 'WRONG' }] })).code).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
