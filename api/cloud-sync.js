import { serverDb } from '../lib/serverDb.js';
import { requireOnlineUser } from '../lib/requireOnlineUser.js';
import { limitRequest } from '../lib/sharedRateLimit.js';
import { handleDriveConnection } from '../lib/driveConnections.js';
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!await limitRequest(req, res, 'cloud', 120)) return;
  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}; }
  catch { return res.status(400).json({ error: 'Invalid sync request' }); }
  if (['drive-config', 'drive-status', 'drive-connect', 'drive-bind', 'drive-token', 'drive-disconnect'].includes(body?.action)) return handleDriveConnection(req, res, body);
  const auth = await requireOnlineUser(req);
  if (!auth.ok) return res.status(401).json({ error: 'Sign in to sync.' });
  try {
    const commit = body.action === 'commit';
    if (!['head', 'commit'].includes(body.action) || (commit && (!Number.isSafeInteger(body.revision) || body.revision < 0 || !/^[A-Za-z0-9_-]{10,200}$/.test(body.fileId || '')))) return res.status(400).json({ error: 'Invalid sync request' });
    const { data, error } = await serverDb().rpc('psx_cloud_head', {
      p_email: auth.user.email, p_expected: commit ? body.revision : null, p_file: commit ? body.fileId : null,
    });
    if (error) throw error;
    return res.status(data.conflict ? 409 : 200).json(data);
  } catch { return res.status(503).json({ error: 'Cloud version check unavailable. Your changes remain on this device.' }); }
}
