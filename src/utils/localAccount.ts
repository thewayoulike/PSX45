// Active portfolio caches are account-scoped. Archive before changing owners;
// authentication tokens and other accounts' pending saves are never archived here.
// API keys are restored from the account's own Drive backup, so archives never need them.
const SECRET_KEYS = new Set(['psx_gemini_api_key', 'psx_scraping_api_key', 'psx_webscraping_ai_key']);
const SECRET_FIELDS = ['geminiApiKey', 'scrapingApiKey', 'webScrapingAIKey'];

/** Remove API keys from a recovery copy's JSON, leaving the portfolio data intact. */
export function stripSecrets(raw: string): string {
  try {
    const copy = JSON.parse(raw);
    const scrub = (o: any) => { if (o && typeof o === 'object') { SECRET_KEYS.forEach(k => delete o[k]); SECRET_FIELDS.forEach(k => delete o[k]); } };
    scrub(copy); scrub(copy?.data);
    return JSON.stringify(copy);
  } catch { return raw; }
}
/** On sign-out: older account-switch archives may still hold the previous user's API key. */
export function scrubSecretsFromRecoveryCopies() {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith('psx_cloud_recovery:')) continue;
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    const clean = stripSecrets(raw);
    if (clean !== raw) { try { localStorage.setItem(key, clean); } catch { /* Same size or smaller; ignore. */ } }
  }
}

export function preparePortfolioAccount(email: string): boolean {
  const next = email.trim().toLowerCase();
  if (!next) throw new Error('An account is required to open a portfolio.');
  const previous = localStorage.getItem('psx_local_account');
  if (previous && previous !== next) {
    const data: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('psx_') && !SECRET_KEYS.has(key) && !key.startsWith('psx_drive_') && !key.startsWith('psx_pending_cloud_v1:') && !key.startsWith('psx_cloud_recovery:') && !key.startsWith('psx_password_prompt:') && key !== 'psx_theme') data[key] = localStorage.getItem(key)!;
    }
    // If storage is full, throw before removing anything or changing the owner.
    localStorage.setItem(`psx_cloud_recovery:${encodeURIComponent(previous)}:${Date.now()}`, JSON.stringify({format:'browser-cache',email:previous,data}));
    Object.keys(data).forEach(key => localStorage.removeItem(key));
  }
  localStorage.setItem('psx_local_account', next);
  return !!previous && previous !== next;
}
