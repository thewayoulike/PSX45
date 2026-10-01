import { randomUUID } from 'node:crypto';
import { mutateAlerts } from './alertsStore.js';

// A claim whose push outcome was unknown (timeout, crash) is retried after this long. A rare
// duplicate notification is better than an alert that silently never fires again.
export const STALE_CLAIM_MS = 2 * 3600000;

/** How a failed push should be finished. Only an outcome that may have delivered stays claimed. */
export function pushFailureOutcome(error) {
  const status = Number(error?.statusCode);
  if (status === 404 || status === 410) return 'expired'; // Subscription gone: nothing was delivered.
  // Rejected before delivery: rate limit, outage, bad request, or our VAPID keys refused.
  if ([400, 401, 403, 413, 429, 503].includes(status)) return 'retry';
  return 'unconfirmed'; // Timeout or network error: the push may have arrived.
}

export async function deliverAlerts(records, prices, send, { deadline = Infinity, now = Date.now } = {}) {
  let pushesSent = 0, unconfirmed = 0, released = 0, expired = 0, deferred = 0;
  for (const { sid, rec } of records) {
    if (!rec.userEmail) continue; // Ownerless legacy data requires an explicit migration.
    let subscriptionGone = false;
    for (const alert of rec.alerts || []) {
      if (alert.delivery) {
        const claimedAt = Date.parse(alert.delivery.claimedAt || '');
        if (alert.delivery.token && Number.isFinite(claimedAt) && now() - claimedAt > STALE_CLAIM_MS) {
          await mutateAlerts(sid, rec.userEmail, 'finish', { id: alert.id, token: alert.delivery.token, outcome: 'retry' });
          released++; // Evaluated again on the next run.
        } else unconfirmed++;
        continue;
      }
      if (subscriptionGone) continue;
      const ticker = String(alert.ticker || '').toUpperCase();
      const price = prices[ticker];
      if (!Number.isFinite(price) || price <= 0) continue;
      const hit = (alert.direction === 'ABOVE' && price >= alert.targetPrice) ||
        (alert.direction === 'BELOW' && price <= alert.targetPrice);
      if (!hit) continue;
      // Never start a claim the function may not live to finish; the next run picks it up.
      if (now() > deadline) { deferred++; continue; }
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
        outcome = pushFailureOutcome(error);
        if (outcome === 'expired') {
          // Keep the alert: it works again once notifications are re-enabled on that device.
          outcome = 'retry'; subscriptionGone = true; expired++;
        } else if (outcome === 'unconfirmed') unconfirmed++;
        else if (Number(error?.statusCode) === 401 || Number(error?.statusCode) === 403) {
          console.error('[alerts] Push service refused the VAPID credentials:', error.statusCode);
        }
      }
      await mutateAlerts(sid, rec.userEmail, 'finish', { id: alert.id, token, outcome });
    }
  }
  return { pushesSent, unconfirmed, released, expired, deferred };
}
