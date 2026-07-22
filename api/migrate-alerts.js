// ONE-TIME migration: converts the legacy single-array `psx_alerts` into
// per-subscription records, then deletes the old key.
//
// Run once after deploying:
//   curl "https://<your-app>.vercel.app/api/migrate-alerts?secret=YOUR_CRON_SECRET"
//
// Safe to delete this file afterwards.

import { kv } from '@vercel/kv';
import { sidFor, getRecord, putRecord } from '../lib/alertsStore.js';

export default async function handler(req, res) {
  if (req.query.secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const legacy = (await kv.get('psx_alerts')) || [];
    if (!Array.isArray(legacy) || legacy.length === 0) {
      return res.status(200).json({ migrated: 0, message: 'Nothing to migrate' });
    }

    const byEndpoint = new Map();
    for (const a of legacy) {
      const ep = a.subscription?.endpoint;
      if (!ep) continue;
      if (!byEndpoint.has(ep)) byEndpoint.set(ep, { subscription: a.subscription, alerts: [] });
      byEndpoint.get(ep).alerts.push({
        id: a.id,
        ticker: a.ticker,
        targetPrice: a.targetPrice,
        direction: a.direction,
        createdAt: a.createdAt
      });
    }

    let migrated = 0;
    for (const [ep, rec] of byEndpoint) {
      const sid = sidFor(ep);
      const existing = await getRecord(sid);
      const merged = existing
        ? { subscription: rec.subscription, alerts: [...existing.alerts, ...rec.alerts] }
        : rec;
      await putRecord(sid, merged);
      migrated += rec.alerts.length;
    }

    await kv.del('psx_alerts'); // remove the legacy key once migrated

    return res.status(200).json({ migrated, subscriptions: byEndpoint.size });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
