import { randomUUID } from 'node:crypto';
import { sidFor, mutateAlerts } from '../lib/alertsStore.js';
import { alertQuotas } from '../lib/alertAccess.js';
import { alertRequest } from '../lib/alertRequest.js';
export default async function handler(req, res) {
  try {
    const context = await alertRequest(req, res);
    if (!context) return;
    const { subscription, ticker, alerts } = context.body;
    if (typeof subscription?.endpoint !== 'string' || !subscription.endpoint.startsWith('https://') ||
        !subscription.keys?.p256dh || !subscription.keys?.auth ||
        typeof ticker !== 'string' || !/^[A-Z0-9.-]{1,24}$/i.test(ticker.trim()) ||
        !Array.isArray(alerts) || !alerts.length || alerts.length > 8) {
      return res.status(400).json({ error: 'Invalid subscription, ticker or alerts.' });
    }
    if (alerts.some(a => !a || !Number.isFinite(Number(a.price)) || Number(a.price) <= 0 ||
        !['ABOVE', 'BELOW'].includes(a.direction))) {
      return res.status(400).json({ error: 'Each alert needs a positive price and ABOVE or BELOW direction.' });
    }
    const quotas = await alertQuotas(context.user.email);
    const toAdd = alerts.map(a => ({ id: randomUUID(), ticker: ticker.trim().toUpperCase(),
      targetPrice: Number(a.price), direction: a.direction, createdAt: new Date().toISOString() }));
    await mutateAlerts(sidFor(subscription.endpoint), context.user.email, 'append', {
      subscription, alerts: toAdd, quotas,
    });
    return res.status(200).json({ success: true, message: `Successfully saved ${toAdd.length} alert(s)` });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || 'Unable to save alerts.' });
  }
}
