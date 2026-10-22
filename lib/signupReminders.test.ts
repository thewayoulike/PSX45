import { describe, expect, it, vi } from 'vitest';
import { dueReminders, reminderEmail, runSignupReminders } from './signupReminders.js';

const DAY = 86400000;
const now = Date.parse('2026-11-20T12:00:00Z');
const ago = (days: number) => new Date(now - days * DAY).toISOString();

describe('dueReminders', () => {
  it('reminds an email signup that never reached the app on day 5, 10 and 15, then stops', () => {
    const authUsers = [{ email: 'a@example.invalid', created_at: ago(5) }];
    expect(dueReminders({ authUsers, allowlist: [], sent: [], now })).toEqual([{ email: 'a@example.invalid', kind: 'never_signed_in', step: 1 }]);
    expect(dueReminders({ authUsers: [{ email: 'a@example.invalid', created_at: ago(4) }], allowlist: [], sent: [], now })).toEqual([]);
    const sent = (count: number, days: number) => [{ email: 'a@example.invalid', kind: 'never_signed_in', sent_count: count, last_sent_at: ago(days) }];
    expect(dueReminders({ authUsers, allowlist: [], sent: sent(1, 4), now })).toEqual([]);
    expect(dueReminders({ authUsers, allowlist: [], sent: sent(1, 5), now })).toEqual([{ email: 'a@example.invalid', kind: 'never_signed_in', step: 2 }]);
    expect(dueReminders({ authUsers, allowlist: [], sent: sent(3, 30), now })).toEqual([]);
  });

  it('skips email signups that reached the app, and very old abandoned signups', () => {
    const allowlist = [{ email: 'in@example.invalid', approved: true, registered_at: null, last_seen_at: null }];
    expect(dueReminders({ authUsers: [{ email: 'IN@example.invalid', created_at: ago(9) }, { email: 'old@example.invalid', created_at: ago(61) }], allowlist, sent: [], now })).toEqual([]);
  });

  it('reminds a newly registered user who never came back after their first day', () => {
    const row = (seen: string | null) => ({ email: 'b@example.invalid', approved: true, registered_at: ago(6), last_seen_at: seen });
    expect(dueReminders({ authUsers: [], allowlist: [row(null)], sent: [], now })).toEqual([{ email: 'b@example.invalid', kind: 'never_returned', step: 1 }]);
    expect(dueReminders({ authUsers: [], allowlist: [row(ago(5.9))], sent: [], now })).toEqual([{ email: 'b@example.invalid', kind: 'never_returned', step: 1 }]);
    expect(dueReminders({ authUsers: [], allowlist: [row(ago(4))], sent: [], now })).toEqual([]);
  });

  it('never reminds disabled accounts or users registered before tracking began', () => {
    const allowlist = [
      { email: 'off@example.invalid', approved: false, registered_at: ago(10), last_seen_at: null },
      { email: 'legacy@example.invalid', approved: true, registered_at: null, last_seen_at: null },
    ];
    expect(dueReminders({ authUsers: [], allowlist, sent: [], now })).toEqual([]);
  });

  it('caps one run', () => {
    const authUsers = Array.from({ length: 5 }, (_, i) => ({ email: `u${i}@example.invalid`, created_at: ago(7) }));
    expect(dueReminders({ authUsers, allowlist: [], sent: [], now, limit: 2 })).toHaveLength(2);
  });
});

describe('reminderEmail', () => {
  it('escapes the link and words each kind for its situation', () => {
    const a = reminderEmail('never_signed_in', 1, 'https://app.example.invalid/x?a=1&b=2');
    expect(a.subject).toContain('waiting'); expect(a.html).toContain('a=1&amp;b=2');
    const b = reminderEmail('never_returned', 3, 'https://app.example.invalid/login');
    expect(b.subject).toContain('ready'); expect(b.html).toContain('last reminder');
  });
});

function fakeDb({ users = [] as any[], allowlist = [] as any[], sent = [] as any[] } = {}) {
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const generateLink = vi.fn(async ({ email }: any) => ({ data: { properties: { action_link: `https://auth.example.invalid/verify?for=${email}` } }, error: null }));
  const db = {
    auth: { admin: { listUsers: vi.fn(async ({ page }: any) => ({ data: { users: page === 1 ? users : [] }, error: null })), generateLink } },
    from: (table: string) => ({
      select: async () => ({ data: table === 'allowlist' ? allowlist : sent, error: null }),
      upsert,
    }),
  };
  return { db, upsert, generateLink };
}

describe('runSignupReminders', () => {
  it('sends a sign-in link to unconfirmed signups and records each delivery', async () => {
    const { db, upsert, generateLink } = fakeDb({ users: [{ email: 'a@example.invalid', created_at: ago(6) }] });
    const send = vi.fn().mockResolvedValue(true);
    const result = await runSignupReminders({ db, send, now, origin: 'https://app.example.invalid' });
    expect(result).toEqual({ due: 1, sent: 1, failed: 0 });
    expect(generateLink).toHaveBeenCalledWith({ type: 'magiclink', email: 'a@example.invalid', options: { redirectTo: 'https://app.example.invalid/' } });
    expect(send.mock.calls[0][0]).toBe('a@example.invalid');
    expect(send.mock.calls[0][2]).toContain('verify?for=a@example.invalid');
    expect(upsert).toHaveBeenCalledWith({ email: 'a@example.invalid', kind: 'never_signed_in', sent_count: 1, last_sent_at: new Date(now).toISOString() }, { onConflict: 'email,kind' });
  });

  it('does not record a reminder that failed to send', async () => {
    const { db, upsert } = fakeDb({ allowlist: [{ email: 'b@example.invalid', approved: true, registered_at: ago(6), last_seen_at: null }] });
    const result = await runSignupReminders({ db, send: vi.fn().mockRejectedValue(new Error('brevo down')), now, origin: 'https://app.example.invalid' });
    expect(result).toEqual({ due: 1, sent: 0, failed: 1 });
    expect(upsert).not.toHaveBeenCalled();
  });
});
