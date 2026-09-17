import { createHash } from 'node:crypto';
import { serverDb } from './serverDb.js';
import { clientIp } from './rateLimit.js';
export async function sharedRateLimit(key, max = 30, seconds = 60) {
  const hash = createHash('sha256').update(key).digest('hex');
  const { data, error } = await serverDb().rpc('psx_rate_limit', { p_key: hash, p_max: max, p_seconds: seconds });
  if (error) throw new Error('Request limits unavailable. Please retry shortly.');
  return data === true;
}
export async function limitRequest(req, res, scope, max = 60) {
  try {
    if (await sharedRateLimit(`${scope}:${clientIp(req)}`, max)) return true;
    res.setHeader('Retry-After', '60');
    res.status(429).json({ error: 'Too many requests. Please retry shortly.' });
  } catch { res.status(503).json({ error: 'Service temporarily unavailable. Please retry.' }); }
  return false;
}
