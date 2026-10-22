export const SITE_URL = 'https://www.psx-tracker.com';
export const SUPPORT_EMAIL = 'psxtracking@gmail.com';
export const SUPPORT_PHONE = '+92 347 4440983';
export const WHATSAPP_URL = 'https://wa.me/923474440983';
/** Paste Google Search Console meta token here (or leave empty). */
export const GOOGLE_SITE_VERIFICATION = '';
/** GA4 Measurement ID (G-…). Empty disables this destination. */
export const GOOGLE_ANALYTICS_ID = 'G-Q82NMWSH9X';
/** Google Ads destination, sharing the existing Google tag loader. */
export const GOOGLE_ADS_ID = 'AW-18531621415';
export const PUBLIC_LINKS = [
  ['How it works', '/how-it-works'], ['Video guide', '/how-to-use'], ['Guides', '/guides'], ['Markets', '/markets'], ['Tools', '/tools'], ['About', '/about'], ['Privacy', '/privacy'], ['Terms', '/terms'], ['Contact', '/contact'],
];
export const HOME_FAQS = [
  ['What can I track?', 'Track Pakistan Stock Exchange shares and mutual funds, including holdings, dividends, cash movements and trade history. Charts and research tools help you explore the market.'],
  ['Can I log in without Google?', 'Yes. Use email and a password for account access. Connecting Google Drive is optional and enables portfolio backups and sync across devices.'],
  ['Can I add a password after signing in with Google?', 'Yes. Follow the password setup email offered after Google sign-in, or request it later in Profile & security. Your Google sign-in will still work.'],
  ['Does PSX Tracker place trades?', 'No. PSX Tracker is a portfolio and research tool. It does not execute real trades, and its trading simulator uses simulated positions.'],
];
export function feedbackLinks(category, subject, message) {
  const title = `PSX Tracker ${category}: ${subject.trim()}`;
  const body = message.trim();
  return {
    email: `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`,
    whatsapp: `${WHATSAPP_URL}?text=${encodeURIComponent(`${title}\n\n${body}`)}`,
  };
}
