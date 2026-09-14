import { randomUUID } from 'node:crypto';
import { mutateAlerts } from './alertsStore.js';

export async function deliverAlerts(records, prices, send) {
  let pushesSent = 0;
  let unconfirmed = 0;
  for (const { sid, rec } of records) {
    if (!rec.userEmail) continue; // Ownerless legacy data requires an explicit migration.
    for (const alert of rec.alerts || []) {
      if (alert.delivery) { unconfirmed++; continue; }
      const ticker = String(alert.ticker || '').toUpperCase();
      const price = prices[ticker];
      if (!Number.isFinite(price) || price <= 0) continue;
      const hit = (alert.direction === 'ABOVE' && price >= alert.targetPrice) ||
        (alert.direction === 'BELOW' && price <= alert.targetPrice);
      if (!hit) continue;
      const token = randomUUID();
      const claim = await mutateAlerts(sid, rec.userEmail, 'claim', { id: alert.id, token });
      if (!claim?.alert) continue; // Deleted or already claimed since the scan.
      let outcome = 'sent';
      try {
        await send(claim.subscription, JSON.stringify({
          title: `PSX Alert: ${ticker} hit Rs. ${price}`,
          body: `Target was Rs. ${alert.targetPrice}. Open the app to view your portfolio.`,
        }), { timeout: 10000 });
        pushesSent++;
      } catch (error) {
        // Only an explicit rejection is safe to retry. A timeout may have delivered.
        outcome = error.statusCode === 429 || error.statusCode === 503 ? 'retry' : 'unconfirmed';
        if (outcome === 'unconfirmed') unconfirmed++;
      }
      await mutateAlerts(sid, rec.userEmail, 'finish', { id: alert.id, token, outcome });
    }
  }
  return { pushesSent, unconfirmed };
}
