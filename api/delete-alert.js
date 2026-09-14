import { sidFor, mutateAlerts } from '../lib/alertsStore.js';
import { alertRequest } from '../lib/alertRequest.js';
export default async function handler(req, res) {
  try {
    const context = await alertRequest(req, res);
    if (!context) return;
    const { endpoint, id } = context.body;
    if (typeof endpoint !== 'string' || !endpoint || typeof id !== 'string' || !id) {
      return res.status(400).json({ error: 'Missing alert ID or endpoint' });
    }
    await mutateAlerts(sidFor(endpoint), context.user.email, 'remove', { id });
    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
}
