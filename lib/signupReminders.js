import { escapeHtml } from './brevo.js';

const DAY = 86400000;
export const REMINDER_EVERY_DAYS = 5;
export const MAX_REMINDERS = 3;
// A visit within a day of registering is still the signup session, so it doesn't count as coming back.
const RETURN_GRACE_MS = DAY;
// Long-abandoned email signups are left alone.
const MAX_SIGNUP_AGE_DAYS = 60;

const time = value => (value ? Date.parse(value) : NaN);
const norm = email => String(email || '').trim().toLowerCase();

/** Who is owed a reminder right now. Inputs are plain rows, so the rules stay testable without a database. */
export function dueReminders({ authUsers, allowlist, sent, now = Date.now(), limit = 50 }) {
  const rows = new Map(allowlist.map(row => [norm(row.email), row]));
  const history = new Map(sent.map(row => [`${norm(row.email)}:${row.kind}`, row]));
  const candidates = [];
  for (const user of authUsers) {
    const email = norm(user.email), since = time(user.created_at);
    if (!email || rows.has(email) || !(now - since <= MAX_SIGNUP_AGE_DAYS * DAY)) continue;
    candidates.push({ email, kind: 'never_signed_in', since });
  }
  for (const row of allowlist) {
    const since = time(row.registered_at);
    if (!row.approved || !Number.isFinite(since)) continue;
    if (time(row.last_seen_at) >= since + RETURN_GRACE_MS) continue;
    candidates.push({ email: norm(row.email), kind: 'never_returned', since });
  }
  const due = [];
  for (const { email, kind, since } of candidates) {
    const record = history.get(`${email}:${kind}`);
    const count = record?.sent_count || 0;
    const last = record ? time(record.last_sent_at) : since;
    if (count >= MAX_REMINDERS || !(now - last >= REMINDER_EVERY_DAYS * DAY)) continue;
    due.push({ email, kind, step: count + 1 });
    if (due.length >= limit) break;
  }
  return due;
}

export function reminderEmail(kind, step, link) {
  const href = escapeHtml(link);
  const last = step >= MAX_REMINDERS ? '<p>This is our last reminder.</p>' : '';
  const footer = '<p style="color:#64748b;font-size:12px">PSX Tracker · Questions? Reply to this email or write to psxtracking@gmail.com.</p>';
  if (kind === 'never_signed_in') {
    return {
      subject: 'Your PSX Tracker account is waiting',
      html: `<p>Hi,</p><p>You created a PSX Tracker account but haven't signed in yet. Your free trial starts the moment you do.</p>`
        + `<p><a href="${href}">Sign in to PSX Tracker</a></p><p>This link confirms your email and signs you in. It works once and expires after a short time; you can always sign in at psx-tracker.com with your email and password.</p>${last}${footer}`,
    };
  }
  return {
    subject: 'Your PSX Tracker portfolio is ready when you are',
    html: `<p>Hi,</p><p>Your PSX Tracker trial is running. A few minutes now gets your portfolio set up:</p>`
      + '<ul><li>Add your first trades, or import them from a broker statement</li><li>Connect Google Drive to keep your records backed up</li><li>Set a price alert on a stock you follow</li></ul>'
      + `<p><a href="${href}">Open PSX Tracker</a></p>${last}${footer}`,
  };
}

async function listAuthUsers(db) {
  const users = [];
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) break;
  }
  return users;
}

async function rows(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function runSignupReminders({ db, send, now = Date.now(), origin }) {
  const [authUsers, allowlist, sent] = await Promise.all([
    listAuthUsers(db),
    rows(db.from('allowlist').select('email,approved,registered_at,last_seen_at')),
    rows(db.from('signup_reminders').select('email,kind,sent_count,last_sent_at')),
  ]);
  const due = dueReminders({ authUsers, allowlist, sent, now });
  let delivered = 0, failed = 0;
  for (const { email, kind, step } of due) {
    try {
      let link = `${origin}/login`;
      if (kind === 'never_signed_in') {
        const { data, error } = await db.auth.admin.generateLink({ type: 'magiclink', email, options: { redirectTo: `${origin}/` } });
        if (error || !data?.properties?.action_link) throw error || new Error('No sign-in link');
        link = data.properties.action_link;
      }
      const { subject, html } = reminderEmail(kind, step, link);
      await send(email, subject, html);
      const { error } = await db.from('signup_reminders').upsert({ email, kind, sent_count: step, last_sent_at: new Date(now).toISOString() }, { onConflict: 'email,kind' });
      if (error) console.warn('[signup-reminders] sent but not recorded', email, error.message);
      delivered++;
    } catch (error) {
      failed++;
      console.warn('[signup-reminders] failed', kind, error instanceof Error ? error.message : error);
    }
  }
  return { due: due.length, sent: delivered, failed };
}
