// lib/access.js
// Single source of truth for what "has access" means, shared by the API routes.
//
// Rules (in order):
//   not approved            -> pending  (owner hasn't let them in yet)
//   lifetime = true         -> lifetime (never expires)
//   access_until in future  -> paid
//   approved_at + TRIAL_DAYS in future -> trial
//   otherwise               -> free (capped plan; not a hard lockout)

export const TRIAL_DAYS = Number(process.env.TRIAL_DAYS || 7);
const DAY = 24 * 60 * 60 * 1000;

export const FREE_QUOTAS = {
  stockTickers: 3,
  fundTickers: 3,
  portfolios: 1,
  stockProfiles: 7,
  chartViewsPerDay: 5,
  signalsPerDay: 1,
  signalsVisible: 5,
  dailyScanPerDay: 1,
  dailyScanVisible: 5,
  alertsTickers: 3,
  alertsTp: 2,
  alertsSl: 2,
  aiMessagesPerDay: 10,
  fairValuePerDay: 4,
  exportPerDay: 1,
};

export const PAID_QUOTAS = {
  ...FREE_QUOTAS,
  stockTickers: Number.POSITIVE_INFINITY,
  fundTickers: Number.POSITIVE_INFINITY,
  portfolios: Number.POSITIVE_INFINITY,
  stockProfiles: Number.POSITIVE_INFINITY,
  chartViewsPerDay: Number.POSITIVE_INFINITY,
  signalsPerDay: Number.POSITIVE_INFINITY,
  signalsVisible: Number.POSITIVE_INFINITY,
  dailyScanPerDay: Number.POSITIVE_INFINITY,
  dailyScanVisible: Number.POSITIVE_INFINITY,
  alertsTickers: 15,
  alertsTp: 4,
  alertsSl: 4,
  aiMessagesPerDay: Number.POSITIVE_INFINITY,
  fairValuePerDay: Number.POSITIVE_INFINITY,
  exportPerDay: Number.POSITIVE_INFINITY,
};

export function computeAccess(row) {
  const now = Date.now();
  const approved = !!(row && row.approved);
  const lifetime = !!(row && row.lifetime);
  const accessUntil = row && row.access_until ? new Date(row.access_until).getTime() : null;
  const approvedAt = row && row.approved_at ? new Date(row.approved_at).getTime() : null;

  if (!approved) {
    return {
      approved: false, active: false, status: 'pending', plan: 'pending',
      lifetime: false, accessUntil: null, trialEnds: null, daysLeft: 0, quotas: FREE_QUOTAS,
    };
  }
  if (lifetime) {
    return {
      approved: true, active: true, status: 'lifetime', plan: 'lifetime',
      lifetime: true, accessUntil: null, trialEnds: null, daysLeft: null, quotas: PAID_QUOTAS,
    };
  }
  if (accessUntil && now < accessUntil) {
    return {
      approved: true, active: true, status: 'paid', plan: 'paid',
      lifetime: false,
      accessUntil: row.access_until, trialEnds: null,
      daysLeft: Math.max(0, Math.ceil((accessUntil - now) / DAY)),
      quotas: PAID_QUOTAS,
    };
  }
  // Trial window. If approved_at is missing (older rows), start it now so the
  // user isn't locked out before you migrate / mark them lifetime.
  const start = approvedAt != null ? approvedAt : now;
  const trialEnd = start + TRIAL_DAYS * DAY;
  if (now < trialEnd) {
    return {
      approved: true, active: true, status: 'trial', plan: 'trial',
      lifetime: false,
      accessUntil: null, trialEnds: new Date(trialEnd).toISOString(),
      daysLeft: Math.max(0, Math.ceil((trialEnd - now) / DAY)),
      quotas: PAID_QUOTAS,
    };
  }
  return {
    approved: true, active: true, status: 'free', plan: 'free',
    lifetime: false,
    accessUntil: row.access_until || null, trialEnds: new Date(trialEnd).toISOString(),
    daysLeft: 0,
    quotas: FREE_QUOTAS,
  };
}
