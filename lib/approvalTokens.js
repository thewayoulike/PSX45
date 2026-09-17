import { randomBytes, createHash } from 'node:crypto';
import { serverDb } from './serverDb.js';
export const tokenHash = token => createHash('sha256').update(token).digest('hex');
export function appOrigin() {
  const url = new URL(process.env.APP_URL || '');
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('APP_URL must use HTTPS');
  return url.origin;
}
export async function approvalLink(email) {
  const origin = appOrigin();
  const token = randomBytes(32).toString('hex');
  const { error } = await serverDb().from('approval_tokens').insert({
    token_hash: tokenHash(token), email, expires_at: new Date(Date.now() + 24 * 3600000).toISOString(),
  });
  if (error) throw new Error('Could not create approval request');
  return `${origin}/api/approve-user?token=${token}`;
}
