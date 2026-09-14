import { createClient } from '@supabase/supabase-js';
import { computeAccess } from './access.js';
export async function alertQuotas(email) {
  try {
    const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await db.from('allowlist')
      .select('approved, approved_at, access_until, lifetime')
      .eq('email', email.toLowerCase()).maybeSingle();
    if (error) throw error;
    const access = computeAccess(data);
    if (!access.approved) throw Object.assign(new Error('Account approval required.'), { status: 403 });
    return access.quotas;
  } catch (error) {
    if (error.status === 403) throw error;
    throw Object.assign(new Error('Unable to verify alert access. Please retry.'), { status: 503 });
  }
}
