import { GOOGLE_ADS_SIGNUP_DESTINATION } from '../../config/site.js';

type GoogleTag = (command: 'event', event: 'conversion', parameters: { send_to: string }) => void;
const reportedAccounts = new Set<string>();

/** Called after authenticated account creation, never on a login or page view. */
export function trackSuccessfulSignup(email: string): void {
  // Account identity is used locally to suppress duplicate callbacks. It is never
  // included in the Google event, along with names, tokens or portfolio data.
  const account = email.trim().toLowerCase();
  if (!account || reportedAccounts.has(account) || typeof window === 'undefined') return;
  if (!['psx-tracker.com', 'www.psx-tracker.com'].includes(window.location.hostname)) return;
  const tag = (window as Window & { gtag?: GoogleTag }).gtag;
  if (typeof tag !== 'function') return;
  try {
    tag('event', 'conversion', { send_to: GOOGLE_ADS_SIGNUP_DESTINATION });
    reportedAccounts.add(account);
  } catch {
    // Analytics blocking or failure must never prevent access to the app.
  }
}
