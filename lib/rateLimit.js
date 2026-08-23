// lib/rateLimit.js
// Best-effort in-memory rate limiter. Serverless instances are ephemeral and
// scaled horizontally, so this is a friction layer rather than a hard guarantee
// — but it still blunts rapid abuse from one source on a warm instance. For a
// hard limit, front these routes with Vercel's built-in rate limiting / WAF.
const HITS = new Map(); // key -> number[] timestamps (ms)

export function rateLimit(key, { windowMs = 60000, max = 10 } = {}) {
  const now = Date.now();
  const arr = (HITS.get(key) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  HITS.set(key, arr);
  if (HITS.size > 5000) {
    for (const [k, v] of HITS) if (!v.some((t) => now - t < windowMs)) HITS.delete(k);
  }
  return { ok: arr.length <= max, remaining: Math.max(0, max - arr.length) };
}

export function clientIp(req) {
  const xff = (req.headers['x-forwarded-for'] || '').toString();
  return xff.split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
}