import { timingSafeEqual } from 'node:crypto';
export function isCronAuthorized(req, secret = process.env.CRON_SECRET) {
  if (typeof secret !== 'string' || !secret.trim()) return false;
  const match = String(req.headers?.authorization || '').match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  const supplied = match[1];
  const a = Buffer.from(supplied), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
