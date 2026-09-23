import { getAllRecords } from '../lib/alertsStore.js';
import { alertRequest } from '../lib/alertRequest.js';
export default async function handler(req, res) {
  try {
    const context = await alertRequest(req, res);
    if (!context) return;
    const email = String(context.user.email || '').toLowerCase();
    const records = (await getAllRecords()).filter(({ rec }) => String(rec?.userEmail || '').toLowerCase() === email);
    const alerts = records.flatMap(({ sid, rec }) => (rec.alerts || []).map((alert) => ({ ...alert, sid })));
    return res.status(200).json({ alerts });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
}
