// api/notify-signup.js
// Called by the client right after a successful Supabase sign-up.
// Emails the OWNER a one-click "Approve" link.

import { sendBrevo, escapeHtml } from '../lib/brevo.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const email = (body?.email || '').toString().trim();
    const name = (body?.name || '').toString().trim();
    if (!email) return res.status(400).json({ error: 'email required' });

    const owner = process.env.OWNER_EMAIL || 'itruth2011@gmail.com';
    const appUrl = process.env.APP_URL || `https://${req.headers.host}`;
    const approveUrl = `${appUrl}/api/approve-user?secret=${encodeURIComponent(process.env.APPROVE_SECRET || '')}&email=${encodeURIComponent(email)}`;

    await sendBrevo(
      owner,
      `New PSX Tracker signup: ${name || email}`,
      `<div style="font-family:sans-serif;line-height:1.6">
        <h2>New access request</h2>
        <p><b>Name:</b> ${escapeHtml(name || '-')}<br/>
           <b>Email:</b> ${escapeHtml(email)}</p>
        <p><a href="${approveUrl}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold">✅ Approve this user</a></p>
        <p style="color:#888;font-size:12px">Clicking approve activates the account and emails the user.</p>
      </div>`
    );

    return res.status(200).json({ success: true });
  } catch (e) {
    console.error('notify-signup error', e);
    return res.status(500).json({ error: e.message });
  }
}
