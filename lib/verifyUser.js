// lib/verifyUser.js
// Validates a Supabase access token (Authorization: Bearer <jwt>) server-side
// and returns the authenticated user's email (lowercased), or null.
import { createClient } from '@supabase/supabase-js';

let _client = null;
const client = () =>
  (_client ||= createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  }));

export async function getBearerUser(req) {
  const h = (req.headers['authorization'] || req.headers['Authorization'] || '').toString();
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  try {
    const { data, error } = await client().auth.getUser(m[1]);
    if (error || !data?.user?.email) return null;
    return { id: data.user.id, email: data.user.email.toLowerCase() };
  } catch {
    return null;
  }
}