import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ run: vi.fn(), records: vi.fn() }));
vi.mock('./signupReminders.js', () => ({ runSignupReminders: mocks.run }));
vi.mock('./serverDb.js', () => ({ serverDb: () => ({}) }));
vi.mock('./brevo.js', () => ({ sendBrevo: vi.fn(), escapeHtml: (s: string) => s }));
vi.mock('./alertsStore.js', () => ({ getAllRecords: mocks.records }));
import handler from '../api/run-alerts.js';

function res() { return { code: 0, body: undefined as any, status(n: number) { this.code = n; return this; }, json(b: any) { this.body = b; return this; } }; }
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

it('runs signup reminders only for the cron caller, without touching price alerts', async () => {
  vi.stubEnv('CRON_SECRET', 'cron-secret'); vi.stubEnv('APP_URL', 'https://app.example.invalid');
  mocks.run.mockResolvedValue({ due: 2, sent: 2, failed: 0 });
  const denied = res(); await handler({ query: { job: 'signup-reminders' }, headers: { authorization: 'Bearer wrong' } }, denied);
  expect(denied.code).toBe(401); expect(mocks.run).not.toHaveBeenCalled();
  const ok = res(); await handler({ query: { job: 'signup-reminders' }, headers: { authorization: 'Bearer cron-secret' } }, ok);
  expect(ok.code).toBe(200); expect(ok.body).toEqual({ success: true, due: 2, sent: 2, failed: 0 });
  expect(mocks.run.mock.calls[0][0].origin).toBe('https://app.example.invalid');
  expect(mocks.records).not.toHaveBeenCalled();
});
