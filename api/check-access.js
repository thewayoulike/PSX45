// api/check-access.js
// Single approval gate for BOTH email/password and Google sign-in.
// Hardened: per-IP rate limiting; owner-notification emails are only sent for a
// user's OWN new/pending account (or a brand-new email) under a strict email
// rate limit; if a token is presented it must match the queried email.

import { createClient } from '@supabase/supabase-js';
import { sendBrevo, escapeHtml } from '../lib/brevo.js';
import { computeAccess } from '../lib/access.js';
import { getBearerUser } from '../lib/verifyUser.js';
import { rateLimit, clientIp } from '../lib/rateLimit.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = clientIp(req);
  if (!rateLimit(`ca:${ip}`, { windowMs: 60000, max: 30 }).ok) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const email = (body?.email || '').toString().trim().toLowerCase();
    const name = (body?.name || '').toString().trim();
    const notify = body?.notify === true;
    const resend = body?.resend === true;
    if (!email) return res.status(400).json({ error: 'email required' });

    // If a session token is presented, it must belong to the queried email.
    const authed = await getBearerUser(req);
    if (authed && authed.email !== email) {
      return res.status(403).json({ error: 'Token/email mismatch' });
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    const { data: existing } = await supabase
      .from('allowlist')
      .select('approved, approved_at, access_until, lifetime')
      .eq('email', email)
      .maybeSingle();

    const approved = !!existing?.approved;
    const brandNew = !existing;
    if (brandNew) {
      await supabase.from('allowlist').insert({ email, name: name || null, approved: false });
    }

    // Owner notification: only for an authenticated user about their own account,
    // or a brand-new email (one-shot). Always throttled per IP so the endpoint
    // cannot be turned into an owner-spam / quota-drain vector.
    const isSelf = !!authed && authed.email === email;
    const wantNotify = notify && !approved && (resend || brandNew);
    if (wantNotify && (isSelf || brandNew)) {
      const mail = rateLimit(`ca-mail:${ip}`, { windowMs: 3600000, max: 5 });
      if (mail.ok) {
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
              <p><a href="${approveUrl}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold">Approve this user</a></p>
            </div>`
          );
        } catch (e) { console.error('owner notify (Brevo) failed:', e); }
      }
    }

    const access = computeAccess(existing || { approved: false });
    return res.status(200).json({
      approved,
      pending: !approved,
      new: brandNew,
      active: access.active,
      accessStatus: access.status,
      lifetime: access.lifetime,
      accessUntil: access.accessUntil,
      trialEnds: access.trialEnds,
      daysLeft: access.daysLeft,
    });
  } catch (e) {
    console.error('check-access error', e);
    return res.status(500).json({ error: e.message });
  }
}