// lib/alertsStore.js
// Per-subscription alert storage, backed by Supabase (Postgres).
//
// Each push subscription is one row, keyed by a stable hash of its endpoint,
// so concurrent writes for different devices can never clobber each other.
//
// Table (create it once with the SQL in the setup steps):
//   alert_store ( sid text primary key,
//                 record jsonb not null,      -- { subscription, alerts: [...] }
//                 updated_at timestamptz default now() )
//
// The `record` shape is unchanged from the old Vercel KV version, so every
// API endpoint that imports this file keeps working without edits:
//   record = {
//     subscription,                              // the web-push subscription object
//     alerts: [ { id, ticker, targetPrice, direction, createdAt } ]
//   }

import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

const TABLE = 'alert_store';

// Server-only client. The service-role key bypasses Row Level Security and must
// NEVER be shipped to the browser — it only lives in these serverless functions.
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// Stable, short id derived from the (very long) push endpoint URL.
export const sidFor = (endpoint) =>
  crypto.createHash('sha256').update(endpoint).digest('hex').slice(0, 32);

export const getRecord = async (sid) => {
  const { data, error } = await supabase
    .from(TABLE)
    .select('record')
    .eq('sid', sid)
    .maybeSingle();
  if (error) throw new Error(`getRecord failed: ${error.message}`);
  return data ? data.record : null;
};

export const putRecord = async (sid, record) => {
  const { error } = await supabase
    .from(TABLE)
    .upsert({ sid, record, updated_at: new Date().toISOString() }, { onConflict: 'sid' });
  if (error) throw new Error(`putRecord failed: ${error.message}`);
};

export const deleteRecord = async (sid) => {
  const { error } = await supabase.from(TABLE).delete().eq('sid', sid);
  if (error) throw new Error(`deleteRecord failed: ${error.message}`);
};

export const allSids = async () => {
  const { data, error } = await supabase.from(TABLE).select('sid');
  if (error) throw new Error(`allSids failed: ${error.message}`);
  return (data || []).map((r) => r.sid);
};

// Efficient bulk read for the cron: every record in a single query.
// Returns [{ sid, rec }] so run-alerts doesn't have to do N+1 lookups.
export const getAllRecords = async () => {
  const { data, error } = await supabase.from(TABLE).select('sid, record');
  if (error) throw new Error(`getAllRecords failed: ${error.message}`);
  return (data || []).map((r) => ({ sid: r.sid, rec: r.record }));
};
