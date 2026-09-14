// The old ownerless KV migration is retired. Do not reintroduce whole-record
// writes or infer ownership from a caller-supplied endpoint. See the audit rollout guide.
import { isCronAuthorized } from '../lib/cronAuth.js';
export default async function handler(req, res) {
  if (!isCronAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  return res.status(410).json({
    error: 'Legacy migration retired. Verify owners and use the transactional alert migration. No data was changed.',
  });
}
