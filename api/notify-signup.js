// api/notify-signup.js
// Emails the OWNER an approve link. Locked down: requires a valid Supabase
// session whose email matches the requested address, plus a per-IP rate limit,
// so it can't be used anonymously to spam the owner / drain the email quota.

import { sendBrevo, escapeHtml } from '../lib/brevo.js';
import { getBearerUser } from '../lib/verifyUser.js';
import { rateLimit, clientIp } from '../lib/rateLimit.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = clientIp(req);
  if (!rateLimit(`ns:${ip}`, { windowMs: 3600000, max: 5 }).ok) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const email = (body?.email || '').toString().trim().toLowerCase();
    const name = (body?.name || '').toString().trim();
    if (!email) return res.status(400).json({ error: 'email required' });

    // Must be an authenticated user acting on their own email.
    const authed = await getBearerUser(req);
    if (!authed || authed.email !== email) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

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
        <p><a href="${approveUrl}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold">Approve this user</a></p>
      </div>`
    );

    return res.status(200).json({ success: true });
  } catch (e) {
    console.error('notify-signup error', e);
    return res.status(500).json({ error: e.message });
  }
}