import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
let client;
const db = () => client ||= createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });
export const sidFor = endpoint => crypto.createHash('sha256').update(endpoint).digest('hex').slice(0, 32);
// All writes use migrations/20260914_alert_safety.sql. Verified normalized email
// is the common account identity for Google and Supabase sign-in.
export async function mutateAlerts(sid, owner, action, payload = {}) {
  const { data, error } = await db().rpc('psx_mutate_alerts', {
    p_sid: sid, p_owner: owner, p_action: action, p_payload: payload,
  });
  if (error) throw Object.assign(new Error('Alert storage unavailable. Please retry.'), { status: 503 });
  if (data?.error) throw Object.assign(new Error(data.error), { status: data.status || 400 });
  return data;
}
export async function getAllRecords() {
  const records = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db().from('alert_store').select('sid, record')
      .order('sid').range(offset, offset + 499);
    if (error) throw new Error('Unable to read alert records.');
    records.push(...(data || []).map(r => ({ sid: r.sid, rec: r.record })));
    if (!data || data.length < 500) return records;
  }
}
