// api/admin-users.js
// Owner-only admin for the access allowlist. Gated by a shared secret
// (reuses APPROVE_SECRET). Lets the owner list users and approve / disable /
// remove them directly from the app. Uses the service role (bypasses RLS).
//
// GET  /api/admin-users            -> { users: [...] }
// POST /api/admin-users { action, email }  action = approve | disable | remove
// Auth: send the secret as header `x-admin-secret` (or ?secret= for GET).

import { createClient } from '@supabase/supabase-js';
import { computeAccess } from '../lib/access.js';

const getSecret = (req) =>
  (req.headers['x-admin-secret'] ||
    (req.query && req.query.secret) ||
    (req.body && typeof req.body === 'object' && req.body.secret) ||
    '').toString();

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-secret');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const expected = (process.env.ADMIN_SECRET || process.env.APPROVE_SECRET || '').toString();
  if (!expected) return res.status(500).json({ error: 'Admin secret not configured' });
  if (getSecret(req) !== expected) return res.status(401).json({ error: 'Unauthorized' });

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('allowlist')
        .select('*')
        .order('approved', { ascending: true })
        .order('email', { ascending: true });
      if (error) throw error;
      const users = (data || []).map(row => ({ ...row, access: computeAccess(row) }));
      return res.status(200).json({ users });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const action = (body?.action || '').toString();
      const email = (body?.email || '').toString().trim().toLowerCase();
      if (!email) return res.status(400).json({ error: 'email required' });

      if (action === 'approve') {
        // Approve = start the 15-day trial (stamp approved_at only if not set).
        const { data: cur } = await supabase
          .from('allowlist').select('approved_at').eq('email', email).maybeSingle();
        const approvedAt = cur?.approved_at || new Date().toISOString();
        const { error } = await supabase
          .from('allowlist')
          .upsert({ email, approved: true, approved_at: approvedAt }, { onConflict: 'email' });
        if (error) throw error;

      } else if (action === 'mark_paid') {
        // Paid access until (start date/time) + a period in months and/or days.
        const start = body?.start ? new Date(body.start) : new Date();
        const months = Number(body?.months || 0);
        const days = Number(body?.days || 0);
        if (isNaN(start.getTime()) || (months <= 0 && days <= 0)) {
          return res.status(400).json({ error: 'Provide a valid start and a period' });
        }
        const until = new Date(start);
        if (months) until.setMonth(until.getMonth() + months);
        if (days) until.setDate(until.getDate() + days);
        const { error } = await supabase
          .from('allowlist')
          .upsert({ email, approved: true, access_until: until.toISOString(), lifetime: false }, { onConflict: 'email' });
        if (error) throw error;

      } else if (action === 'lifetime') {
        const value = body?.value !== false; // default true
        const { error } = await supabase
          .from('allowlist')
          .upsert({ email, approved: true, lifetime: value }, { onConflict: 'email' });
        if (error) throw error;

      } else if (action === 'start_trial') {
        // Reset to a fresh 15-day trial from now.
        const { error } = await supabase
          .from('allowlist')
          .upsert({ email, approved: true, approved_at: new Date().toISOString(), access_until: null, lifetime: false }, { onConflict: 'email' });
        if (error) throw error;

      } else if (action === 'disable') {
        const { error } = await supabase
          .from('allowlist')
          .update({ approved: false })
          .eq('email', email);
        if (error) throw error;

      } else if (action === 'remove') {
        const { error } = await supabase
          .from('allowlist')
          .delete()
          .eq('email', email);
        if (error) throw error;

      } else {
        return res.status(400).json({ error: 'Unknown action' });
      }

      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('admin-users error', e);
    return res.status(500).json({ error: e.message });
  }
}
