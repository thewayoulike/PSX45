// api/check-access.js
// Single approval gate for BOTH email/password and Google sign-in.
// - Looks up the email in the allowlist (service role).
// - If it's new, creates a pending row and (optionally) emails the owner an
//   approve link. Returns whether the email is approved.

import { createClient } from '@supabase/supabase-js';
import { sendBrevo, escapeHtml } from '../lib/brevo.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const email = (body?.email || '').toString().trim().toLowerCase();
    const name = (body?.name || '').toString().trim();
    const notify = body?.notify === true;
    const resend = body?.resend === true; // re-email the owner even if already pending
    if (!email) return res.status(400).json({ error: 'email required' });

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    const { data: existing } = await supabase
      .from('allowlist')
      .select('approved')
      .eq('email', email)
      .maybeSingle();

    const approved = !!existing?.approved;

    // Create a pending row the first time we see this email.
    if (!existing) {
      await supabase.from('allowlist').insert({ email, name: name || null, approved: false });
    }

    // Email the owner an approve link: always for a brand-new email, and on the
    // signup path (resend) if they're still pending. Never re-spams on silent loads.
    const shouldNotify = notify && !approved && (!existing || resend);
    if (shouldNotify) {
      try {
        const owner = process.env.OWNER_EMAIL || 'itruth2011@gmail.com';
        const appUrl = process.env.APP_URL || `https://${req.headers.host}`;
        const approveUrl = `${appUrl}/api/approve-user?secret=${encodeURIComponent(process.env.APPROVE_SECRET || '')}&email=${encodeURIComponent(email)}`;
        await sendBrevo(
          owner,
          `New PSX Tracker access request: ${name || email}`,
          `<div style="font-family:sans-serif;line-height:1.6">
            <h2>New access request</h2>
            <p><b>Name:</b> ${escapeHtml(name || '-')}<br/><b>Email:</b> ${escapeHtml(email)}</p>
            <p><a href="${approveUrl}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold">✅ Approve this user</a></p>
          </div>`
        );
      } catch (e) { console.error('owner notify (Brevo) failed:', e); }
    }

    return res.status(200).json({ approved, pending: !approved, new: !existing });
  } catch (e) {
    console.error('check-access error', e);
    return res.status(500).json({ error: e.message });
  }
}
