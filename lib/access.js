// lib/access.js
// Single source of truth for what "has access" means, shared by the API routes.
//
// Rules (in order):
//   not approved            -> pending  (owner hasn't let them in yet)
//   lifetime = true         -> lifetime (never expires)
//   access_until in future  -> paid
//   approved_at + TRIAL_DAYS in future -> trial
//   otherwise               -> expired  (needs to pay)

export const TRIAL_DAYS = Number(process.env.TRIAL_DAYS || 15);
const DAY = 24 * 60 * 60 * 1000;

export function computeAccess(row) {
  const now = Date.now();
  const approved = !!(row && row.approved);
  const lifetime = !!(row && row.lifetime);
  const accessUntil = row && row.access_until ? new Date(row.access_until).getTime() : null;
  const approvedAt = row && row.approved_at ? new Date(row.approved_at).getTime() : null;

  if (!approved) {
    return { approved: false, active: false, status: 'pending', lifetime: false, accessUntil: null, trialEnds: null, daysLeft: 0 };
  }
  if (lifetime) {
    return { approved: true, active: true, status: 'lifetime', lifetime: true, accessUntil: null, trialEnds: null, daysLeft: null };
  }
  if (accessUntil && now < accessUntil) {
    return {
      approved: true, active: true, status: 'paid', lifetime: false,
      accessUntil: row.access_until, trialEnds: null,
      daysLeft: Math.max(0, Math.ceil((accessUntil - now) / DAY)),
    };
  }
  // Trial window. If approved_at is missing (older rows), start it now so the
  // user isn't locked out before you migrate / mark them lifetime.
  const start = approvedAt != null ? approvedAt : now;
  const trialEnd = start + TRIAL_DAYS * DAY;
  if (now < trialEnd) {
    return {
      approved: true, active: true, status: 'trial', lifetime: false,
      accessUntil: null, trialEnds: new Date(trialEnd).toISOString(),
      daysLeft: Math.max(0, Math.ceil((trialEnd - now) / DAY)),
    };
  }
  return {
    approved: true, active: false, status: 'expired', lifetime: false,
    accessUntil: row.access_until || null, trialEnds: new Date(trialEnd).toISOString(),
    daysLeft: 0,
  };
}
