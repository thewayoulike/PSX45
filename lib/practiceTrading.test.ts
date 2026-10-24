import { describe, it, expect, vi } from 'vitest';
import { createPracticeBroker, practiceIdentity, validatePracticeOrder, PAPER_BASE } from './practiceTrading.js';
import { createPracticeHandler } from './practiceTradingRoute.js';
const env = { PSX_PAPER_KEY_ID: 'PYPSX-SANDBOX-TEST', PSX_PAPER_SECRET: 'test-only-secret', PSX_PAPER_IDENTITY_SECRET: 'a'.repeat(64) };
const email = 'first@example.test';
const identity = practiceIdentity(email, env.PSX_PAPER_IDENTITY_SECRET);
const account = { account_id: 'TEST-001', email: identity.email, partner_reference_id: identity.reference, broker_account_number: 'SANDBOX-001', status: 'ACTIVE' };
const input = { symbol: 'HBL', side: 'BUY', quantity: 1, orderType: 'LIMIT', price: 280, clientOrderId: 'practice-test-1' };
function fixture(overrides: Record<string, unknown> = {}) {
  const fetchImpl = vi.fn(async (url: string, options: any) => {
    const path = url.slice(PAPER_BASE.length).split('?')[0];
    const defaults: Record<string, unknown> = {
      '/config': { environment: 'sandbox', default_portfolio_value: 10000, commission_rate: 0.15 },
      '/accounts': { accounts: [account] },
      '/accounts/TEST-001/portfolio': { account_id: 'TEST-001', cash: 10000, available_cash: 10000, positions: [], equity: 10000 },
      '/accounts/TEST-001/orders': { account_id: 'TEST-001', orders: [], total: 0 },
      '/market/status': { session: 'WEEKEND', can_fill: false },
      '/orders': { order_id: 'order-1', status: 'PENDING', sub_account_id: 'TEST-001' },
      '/orders/order-1': { order_id: 'order-1', status: 'PENDING', sub_account_id: 'TEST-001' },
    };
    const body = path in overrides ? overrides[path] : defaults[path];
    if (body instanceof Error) throw body;
    const response = typeof body === 'function' ? body(options) : body;
    return new Response(JSON.stringify(response), { status: 200 });
  });
  return { fetchImpl, broker: createPracticeBroker({ env, fetchImpl }) };
}
describe('practice sandbox boundary and ownership', () => {
  it('uses a stable private alias across devices and sign-in methods without sharing the real email', () => {
    expect(practiceIdentity(' FIRST@example.test ', env.PSX_PAPER_IDENTITY_SECRET)).toEqual(identity);
    expect(identity.email).not.toContain('first');
    expect(practiceIdentity('other@example.test', env.PSX_PAPER_IDENTITY_SECRET)).not.toEqual(identity);
  });
  it('rejects a live key before any network request', async () => {
    const fetchImpl = vi.fn();
    await expect(createPracticeBroker({ env: { ...env, PSX_PAPER_KEY_ID: 'PYPSX-LIVE-TEST' }, fetchImpl }).config()).rejects.toThrow('not configured');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('rejects a production environment even with a sandbox-looking key', async () => {
    const { broker, fetchImpl } = fixture({ '/config': { environment: 'live' } });
    await expect(broker.place(email, input)).rejects.toThrow('sandbox connection');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('refuses an account already linked to a real broker', async () => {
    const { broker } = fixture({ '/accounts': { accounts: [{ ...account, broker_account_number: 'REAL-123' }] } });
    await expect(broker.place(email, input)).rejects.toThrow('unlinked sandbox');
  });
  it('rejects a forged mapping with the wrong reference', async () => {
    const { broker } = fixture({ '/accounts': { accounts: [{ ...account, partner_reference_id: 'different-user' }] } });
    await expect(broker.snapshot(email)).rejects.toThrow('verify this practice account');
  });
  it('does not adopt another user returned by fuzzy account search', async () => {
    const { broker } = fixture({ '/accounts': { accounts: [{ ...account, email: 'someone-else@example.test' }] } });
    expect((await broker.snapshot(email)).account).toBeNull();
  });
  it('does not create accounts during a read', async () => {
    const { broker, fetchImpl } = fixture({ '/accounts': { accounts: [] } });
    expect((await broker.snapshot(email)).account).toBeNull();
    expect(fetchImpl.mock.calls.every(([, options]) => options.method === 'GET')).toBe(true);
  });
  it('creates only a pseudonymous account with the server-derived reference', async () => {
    const { broker, fetchImpl } = fixture({ '/accounts': (o: any) => o.method === 'POST' ? account : { accounts: [] } });
    await broker.start(email);
    const creation = fetchImpl.mock.calls.find(([, o]) => o.method === 'POST')!;
    const body = JSON.parse(creation[1].body);
    expect(body).toEqual({ full_name: 'PSX Tracker Practice', email: identity.email, partner_reference_id: identity.reference });
    expect(JSON.stringify(body)).not.toContain(email);
  });
  it('recovers concurrent start conflicts without creating duplicate accounts', async () => {
    let lookups = 0;
    const fetchImpl = vi.fn(async (url: string, o: any) => {
      if (url.endsWith('/config')) return new Response('{"environment":"sandbox"}');
      if (o.method === 'POST') return new Response('{"code":"PYPSX-1302"}', { status: 409 });
      return new Response(JSON.stringify({ accounts: ++lookups === 1 ? [] : [account] }));
    });
    expect((await createPracticeBroker({ env, fetchImpl }).start(email)).account_id).toBe('TEST-001');
  });
  it('pins every request to the sandbox, prohibits redirects and supplies the same idempotency key', async () => {
    const { broker, fetchImpl } = fixture();
    await broker.place(email, input); await broker.place(email, input);
    const calls = fetchImpl.mock.calls.filter(([, o]) => o.method === 'POST');
    expect(calls).toHaveLength(2);
    expect(calls[0][1].body).toBe(calls[1][1].body);
    for (const [url, options] of fetchImpl.mock.calls) {
      expect(url.startsWith(PAPER_BASE + '/')).toBe(true);
      expect(options.redirect).toBe('error');
    }
    expect(calls[0][1].headers['Idempotency-Key']).toBe(input.clientOrderId);
    expect(JSON.parse(calls[0][1].body).sub_account_id).toBe('TEST-001');
  });
  it('checks order ownership before cancelling', async () => {
    const { broker, fetchImpl } = fixture({ '/orders/order-1': { sub_account_id: 'TEST-OTHER' } });
    await expect(broker.cancel(email, 'order-1')).rejects.toMatchObject({ status: 404 });
    expect(fetchImpl.mock.calls.some(([, o]) => o.method === 'DELETE')).toBe(false);
  });
  it('cancels an owned order', async () => {
    const { broker, fetchImpl } = fixture();
    await broker.cancel(email, 'order-1');
    expect(fetchImpl.mock.calls.some(([, o]) => o.method === 'DELETE')).toBe(true);
  });
  it('rejects a mismatched account in the portfolio response', async () => {
    const { broker } = fixture({ '/accounts/TEST-001/portfolio': { account_id: 'OTHER', positions: [] } });
    await expect(broker.snapshot(email)).rejects.toThrow('verify your practice portfolio');
  });
  it('preserves market-closed and pending-order states without inventing fills', async () => {
    const { broker } = fixture();
    const state = await broker.snapshot(email);
    expect(state.session).toMatchObject({ name: 'WEEKEND', canFill: false });
    expect((await broker.place(email, input)).status).toBe('PENDING');
  });
  it('sanitizes upstream errors rather than leaking credentials or raw provider responses', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ detail: env.PSX_PAPER_SECRET }), { status: 401 }));
    await expect(createPracticeBroker({ env, fetchImpl }).config()).rejects.not.toThrow(env.PSX_PAPER_SECRET);
  });
});
describe('practice request validation', () => {
  for (const invalid of [{ quantity: 0 }, { quantity: 1.5 }, { quantity: Infinity }, { quantity: '10' }, { price: 0 }, { price: Infinity }, { side: 'TRANSFER' }, { orderType: 'LIVE' }, { clientOrderId: '' }, { symbol: '../../live-link' }, { sub_account_id: 'OTHER' }, { commission_rate: 0 }]) {
    it(`rejects invalid input ${JSON.stringify(invalid)}`, () => expect(() => validatePracticeOrder({ ...input, ...invalid })).toThrow());
  }
  it('never includes a limit price in a market order', () => expect(validatePracticeOrder({ ...input, orderType: 'MARKET' })).not.toHaveProperty('price'));
});
function routeFixture(options: Record<string, unknown> = {}) {
  const broker = { snapshot: vi.fn(async () => ({ account: null })), start: vi.fn(), quote: vi.fn(), place: vi.fn(), cancel: vi.fn() };
  const query: any = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: { approved: true }, error: null }) };
  const handler = createPracticeHandler({ broker, authenticate: async () => ({ ok: true, user: { email } }), db: () => ({ from: () => query }), limit: async () => true, userLimit: async () => true, ...options });
  const res: any = { statusCode: 200, setHeader: vi.fn(), status(n: number) { this.statusCode = n; return this; }, json: vi.fn() };
  return { handler, broker, res, req: { method: 'POST', headers: { 'content-type': 'application/json' }, body: { action: 'snapshot' } } };
}
describe('practice HTTP route access', () => {
  it('rejects signed-out requests', async () => { const x = routeFixture({ authenticate: async () => ({ ok: false }) }); await x.handler(x.req, x.res); expect(x.res.statusCode).toBe(401); expect(x.broker.snapshot).not.toHaveBeenCalled(); });
  it('denies disabled accounts', async () => { const q: any = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: { approved: false } }) }; const x = routeFixture({ db: () => ({ from: () => q }) }); await x.handler(x.req, x.res); expect(x.res.statusCode).toBe(403); });
  it('uses only the verified identity and disables response caching', async () => { const x = routeFixture(); await x.handler(x.req, x.res); expect(x.broker.snapshot).toHaveBeenCalledWith(email, 0); expect(x.res.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store'); });
  it('rejects attempts to choose another user account', async () => { const x = routeFixture(); await x.handler({ ...x.req, body: { action: 'snapshot', accountId: 'OTHER' } }, x.res); expect(x.res.statusCode).toBe(400); });
  it('rejects unsupported financial actions', async () => { const x = routeFixture(); await x.handler({ ...x.req, body: { action: 'withdraw' } }, x.res); expect(x.res.statusCode).toBe(400); });
  it('hides internal errors even when the database supplies a code', async () => { const x = routeFixture({ db: () => { throw { code: 'PGRST', message: 'private database diagnostic' }; } }); await x.handler(x.req, x.res); expect(x.res.statusCode).toBe(503); expect(JSON.stringify(x.res.json.mock.calls)).not.toContain('private database diagnostic'); });
});
