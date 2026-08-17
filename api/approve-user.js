// api/approve-user.js
// The one-click link from the owner's signup email lands here.
// Verifies the secret, flips profiles.approved = true (service role), and
// emails the user that their account is active.

import { createClient } from '@supabase/supabase-js';
import { sendBrevo } from '../lib/brevo.js';

const page = (title, body) =>
  `<!doctype html><html><body style="font-family:sans-serif;text-align:center;padding:60px;color:#0f172a">
   <h2>${title}</h2><p style="color:#475569">${body}</p></body></html>`;

export default async function handler(req, res) {
  const { secret, email } = req.query;

  if (secret !== process.env.APPROVE_SECRET) {
    return res.status(401).send(page('Unauthorized', 'Invalid approval link.'));
  }
  if (!email) {
    return res.status(400).send(page('Missing email', 'No user specified.'));
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const cleanEmail = String(email).trim().toLowerCase();

  // Start the trial clock on first approval only (don't reset it on re-clicks).
  const { data: existing } = await supabase
    .from('allowlist')
    .select('approved_at')
    .eq('email', cleanEmail)
    .maybeSingle();
  const approvedAt = existing?.approved_at || new Date().toISOString();

  const { error } = await supabase
    .from('allowlist')
    .upsert({ email: cleanEmail, approved: true, approved_at: approvedAt }, { onConflict: 'email' });

  if (error) {
    return res.status(500).send(page('Database error', error.message));
  }

  // Tell the user they're in (best-effort; approval already succeeded).
  try {
    const appUrl = process.env.APP_URL || `https://${req.headers.host}`;
    await sendBrevo(
      email,
      'Your PSX Tracker account is activated',
      `<div style="font-family:sans-serif;line-height:1.6">
        <h2>You're approved 🎉</h2>
        <p>Your account has been activated. You can now log in with your email and password.</p>
        <p><a href="${appUrl}" style="display:inline-block;background:#059669;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold">Log in to PSX Tracker</a></p>
      </div>`
    );
  } catch (e) {
    console.error('activation email failed', e);
  }

  return res.status(200).send(page('✅ User approved', `${email} can now log in.`));
}
