import { sidFor, mutateAlerts, getAllRecords } from '../lib/alertsStore.js';
import { alertRequest } from '../lib/alertRequest.js';
export default async function handler(req, res) {
  try {
    const context = await alertRequest(req, res);
    if (!context) return;
    const { endpoint, id } = context.body;
    if (typeof id !== 'string' || !id) return res.status(400).json({ error: 'Missing alert ID' });
    const email = String(context.user.email || '').toLowerCase();
    const records = (await getAllRecords()).filter(({ rec }) => String(rec?.userEmail || '').toLowerCase() === email);
    const targets = records.filter(({ rec }) => (rec.alerts || []).some((alert) => alert.id === id));
    if (typeof endpoint === 'string' && endpoint && targets.length === 0) {
      await mutateAlerts(sidFor(endpoint), context.user.email, 'remove', { id });
    }
    for (const { sid } of targets) await mutateAlerts(sid, context.user.email, 'remove', { id });
    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
}
