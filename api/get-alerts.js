import { sidFor, mutateAlerts } from '../lib/alertsStore.js';
import { alertRequest } from '../lib/alertRequest.js';
export default async function handler(req, res) {
  try {
    const context = await alertRequest(req, res);
    if (!context) return;
    const { endpoint } = context.body;
    if (typeof endpoint !== 'string' || !endpoint) return res.status(400).json({ error: 'Missing push endpoint' });
    const record = await mutateAlerts(sidFor(endpoint), context.user.email, 'read');
    return res.status(200).json({ alerts: record?.alerts || [] });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
}
