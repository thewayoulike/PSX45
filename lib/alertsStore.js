// lib/alertsStore.js
// Per-subscription alert storage. Each push subscription gets its own KV key,
// so concurrent writes for different devices can never clobber each other.
//
// Data model:
//   SET  "alert:subs"        -> set of subscription ids (sid)
//   KEY  "alert:sub:<sid>"   -> { subscription, alerts: [{ id, ticker, targetPrice, direction, createdAt }] }

import { kv } from '@vercel/kv';
import crypto from 'node:crypto';

const SUBS_SET = 'alert:subs';
const subKey = (sid) => `alert:sub:${sid}`;

// Stable, short id derived from the (very long) push endpoint URL.
export const sidFor = (endpoint) =>
  crypto.createHash('sha256').update(endpoint).digest('hex').slice(0, 32);

export const getRecord = async (sid) => {
  const rec = await kv.get(subKey(sid));
  if (!rec) return null;
  return typeof rec === 'string' ? JSON.parse(rec) : rec;
};

export const putRecord = async (sid, record) => {
  await kv.set(subKey(sid), record);
  await kv.sadd(SUBS_SET, sid);
};

export const deleteRecord = async (sid) => {
  await kv.del(subKey(sid));
  await kv.srem(SUBS_SET, sid);
};

export const allSids = async () => (await kv.smembers(SUBS_SET)) || [];
