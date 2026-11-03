import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ db: vi.fn(), limit: vi.fn(), gate: vi.fn(), core: vi.fn(), readFile: vi.fn() }));

// A chainable stand-in for the Supabase query builder: every call is recorded and the
// awaited result comes from mocks.db(table, operation, filters).
function query(table: string) {
  const state: any = { table, op: 'select', filters: {}, patch: null };
  const builder: any = {
    select: (_cols?: string, opts?: any) => { if (opts?.head) state.op = 'count'; return builder; },
    insert: (row: any) => { state.op = 'insert'; state.patch = row; return builder; },
    update: (row: any) => { state.op = 'update'; state.patch = row; return builder; },
    eq: (k: string, v: any) => { state.filters[k] = v; return builder; },
    is: (k: string, v: any) => { state.filters[k] = v; return builder; },
    order: () => builder,
    maybeSingle: () => Promise.resolve(mocks.db(state)),
    single: () => Promise.resolve(mocks.db(state)),
    then: (ok: any, bad: any) => Promise.resolve(mocks.db(state)).then(ok, bad),
  };
  return builder;
}
vi.mock('./serverDb.js', () => ({ serverDb: () => ({ from: query }) }));
vi.mock('./sharedRateLimit.js', () => ({ sharedRateLimit: mocks.limit, limitRequest: async () => true }));
vi.mock('./requireOnlineUser.js', () => ({ requireOnlineUser: mocks.gate }));
vi.mock('./driveConnections.js', () => ({ readPortfolioFileForEmail: mocks.readFile }));
vi.mock('../api/proxy.js', () => ({ default: vi.fn() }));
vi.mock('../api/fund-nav.js', () => ({ default: vi.fn() }));
vi.mock('./generated/psx-mcp.mjs', () => ({ handleConnectorRequest: mocks.core }));

import { CONNECTOR_DAILY_LIMITS, handleConnector, handleConnectorSettings } from './mcpConnector.js';

const TOKEN = `psx_${'a'.repeat(43)}`;
async function call(handler: any, req: any) {
  const res: any = { headers: {}, setHeader(k: string, v: string) { this.headers[k] = v; }, status(c: number) { this.code = c; return this; },
    json(d: any) { this.data = d; return this; }, end() { this.ended = true; return this; } };
  await handler({ method: 'POST', headers: {}, query: {}, ...req }, res);
  return res;
}
const toolCall = { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'get_holdings', arguments: {} } };
let plan: any;
let link: any;

beforeEach(() => {
  vi.clearAllMocks();
  plan = { approved: true, approved_at: '2020-01-01' }; // past the trial: Free
  link = { id: '11111111-1111-1111-1111-111111111111', email: 'User@Example.com', share_portfolio: true };
  mocks.db.mockImplementation((s: any) => {
    if (s.table === 'mcp_connections' && s.op === 'select' && s.filters.token_hash) return { data: link, error: null };
    if (s.table === 'allowlist') return { data: plan, error: null };
    if (s.table === 'mcp_connections' && s.op === 'count') return { count: 1, error: null };
    if (s.table === 'mcp_connections' && s.op === 'insert') return { data: { id: 'new-id' }, error: null };
    if (s.table === 'mcp_connections' && s.op === 'select') return { data: [], error: null };
    return { data: null, error: null };
  });
  mocks.limit.mockResolvedValue(true);
  mocks.core.mockResolvedValue({ jsonrpc: '2.0', id: 7, result: { content: [] } });
  mocks.gate.mockResolvedValue({ ok: true, user: { email: 'user@example.com' } });
});

describe('connector requests', () => {
  it('rejects a GET and a malformed or unknown link', async () => {
    expect((await call(handleConnector, { method: 'GET' })).code).toBe(405);
    expect((await call(handleConnector, { query: { token: 'nope' }, body: toolCall })).code).toBe(404);
    link = null;
    expect((await call(handleConnector, { query: { token: TOKEN }, body: toolCall })).code).toBe(404);
    expect(mocks.core).not.toHaveBeenCalled();
  });
  it('accepts the link as a Bearer token too', async () => {
    const res = await call(handleConnector, { headers: { authorization: `Bearer ${TOKEN}` }, body: toolCall });
    expect(res.code).toBe(200);
  });
  it('passes Free-plan limits and the sharing setting to the core', async () => {
    await call(handleConnector, { query: { token: TOKEN }, body: toolCall });
    const arg = mocks.core.mock.calls[0][0];
    expect(arg).toMatchObject({ plan: 'free', sharePortfolio: true, limits: { stockTickers: 5, fundTickers: 3 } });
    expect(mocks.limit).toHaveBeenCalledWith(expect.stringMatching(/^mcp-day:user@example\.com:\d{4}-\d{2}-\d{2}$/), CONNECTOR_DAILY_LIMITS.free, 86400);
    await arg.readPortfolioFile();
    expect(mocks.readFile).toHaveBeenCalledWith('user@example.com');
  });
  it('gives paid plans the higher allowance and no ticker limits', async () => {
    plan = { approved: true, lifetime: true };
    await call(handleConnector, { query: { token: TOKEN }, body: toolCall });
    expect(mocks.core.mock.calls[0][0]).toMatchObject({ plan: 'lifetime', limits: null });
    expect(mocks.limit).toHaveBeenCalledWith(expect.stringMatching(/^mcp-day:/), 1000, 86400);
  });
  it('answers with a readable tool error once the daily allowance is used', async () => {
    mocks.limit.mockImplementation(async (key: string) => !key.startsWith('mcp-day:'));
    const res = await call(handleConnector, { query: { token: TOKEN }, body: toolCall });
    expect(res.code).toBe(200);
    expect(res.data.id).toBe(7);
    expect(res.data.result.isError).toBe(true);
    expect(res.data.result.content[0].text).toMatch(/Free plan includes 30 PSX Tracker lookups a day/);
    expect(mocks.core).not.toHaveBeenCalled();
  });
  it('does not count protocol messages such as tools/list', async () => {
    await call(handleConnector, { query: { token: TOKEN }, body: { jsonrpc: '2.0', id: 1, method: 'tools/list' } });
    expect(mocks.limit).not.toHaveBeenCalled();
    expect(mocks.core).toHaveBeenCalled();
  });
  it('replies 202 to notifications', async () => {
    mocks.core.mockResolvedValue(null);
    expect((await call(handleConnector, { query: { token: TOKEN }, body: { jsonrpc: '2.0', method: 'notifications/initialized' } })).code).toBe(202);
  });
});

describe('connector settings', () => {
  it('requires sign-in', async () => {
    mocks.gate.mockResolvedValue({ ok: false });
    expect((await call(handleConnectorSettings, { body: { action: 'list' } })).code).toBe(401);
  });
  it('creates a link once and stores only its hash', async () => {
    const res = await call(handleConnectorSettings, { body: { action: 'create', label: 'Claude' } });
    expect(res.data.link).toMatch(/\/api\/mcp\/psx_[A-Za-z0-9_-]{43}$/);
    const insert = mocks.db.mock.calls.map((c) => c[0]).find((s: any) => s.op === 'insert');
    const token = res.data.link.split('/').pop();
    expect(insert.patch).toMatchObject({ email: 'user@example.com', label: 'Claude', token_hint: token.slice(-4) });
    expect(insert.patch.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(insert.patch)).not.toContain(token);
  });
  it('only changes the signed-in user’s own links', async () => {
    await call(handleConnectorSettings, { body: { action: 'revoke', id: link.id } });
    const update = mocks.db.mock.calls.map((c) => c[0]).find((s: any) => s.op === 'update');
    expect(update.filters).toMatchObject({ id: link.id, email: 'user@example.com', revoked_at: null });
    expect(update.patch.revoked_at).toBeTruthy();
  });
  it('reports plan, allowance and usage', async () => {
    const res = await call(handleConnectorSettings, { body: { action: 'list' } });
    expect(res.data).toMatchObject({ plan: 'free', dailyLimit: 30, usedToday: 0, driveConnected: false, connections: [] });
  });
});
