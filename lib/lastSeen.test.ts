import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  user: { ok: true, user: { email: 'member@example.invalid' } } as any,
  row: { approved: true, lifetime: true } as any,
  update: vi.fn(), eq: vi.fn(), or: vi.fn(),
}));
vi.mock('./serverDb.js', () => ({ serverDb: () => ({ from: () => ({
  select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mocks.row, error: null }) }) }),
  update: (values: unknown) => { mocks.update(values); return { eq: (col: string, val: string) => { mocks.eq(col, val); return { or: async (filter: string) => { mocks.or(filter); return { error: null }; } }; } }; },
}) }) }));
vi.mock('./sharedRateLimit.js', () => ({ limitRequest: async () => true, sharedRateLimit: async () => false }));
vi.mock('./requireOnlineUser.js', () => ({ requireOnlineUser: async () => mocks.user }));
vi.mock('./brevo.js', () => ({ sendBrevo: vi.fn(), escapeHtml: (s: string) => s }));
import access from '../api/check-access.js';

function res() { return { code: 0, body: undefined as any, setHeader: vi.fn(), status(n: number) { this.code = n; return this; }, json(b: any) { this.body = b; return this; } }; }
beforeEach(() => { vi.clearAllMocks(); mocks.row = { approved: true, lifetime: true }; });

it('records when the verified account last opened the app, at most every 15 minutes', async () => {
  const before = Date.now();
  const r = res(); await access({ method: 'POST', body: {}, headers: {} }, r);
  expect(r.code).toBe(200);
  const stamp = Date.parse(mocks.update.mock.calls[0][0].last_seen_at);
  expect(stamp).toBeGreaterThanOrEqual(before);
  expect(mocks.eq).toHaveBeenCalledWith('email', 'member@example.invalid');
  const cutoff = Date.parse(mocks.or.mock.calls[0][0].split('last_seen_at.lt.')[1]);
  expect(stamp - cutoff).toBe(15 * 60 * 1000);
  expect(mocks.or.mock.calls[0][0]).toContain('last_seen_at.is.null');
});

it('does not record a visit for an address with no account row', async () => {
  mocks.row = null;
  const r = res(); await access({ method: 'POST', body: {}, headers: {} }, r);
  expect(r.code).toBe(200);
  expect(mocks.update).not.toHaveBeenCalled();
});
