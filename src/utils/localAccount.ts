// Active portfolio caches are account-scoped. Archive before changing owners;
// authentication tokens and other accounts' pending saves are never archived here.
export function preparePortfolioAccount(email: string): boolean {
  const next = email.trim().toLowerCase();
  if (!next) throw new Error('An account is required to open a portfolio.');
  const previous = localStorage.getItem('psx_local_account');
  if (previous && previous !== next) {
    const data: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('psx_') && !key.startsWith('psx_drive_') && !key.startsWith('psx_pending_cloud_v1:') && !key.startsWith('psx_cloud_recovery:') && !key.startsWith('psx_password_prompt:') && key !== 'psx_theme') data[key] = localStorage.getItem(key)!;
    }
    // If storage is full, throw before removing anything or changing the owner.
    localStorage.setItem(`psx_cloud_recovery:${encodeURIComponent(previous)}:${Date.now()}`, JSON.stringify({format:'browser-cache',email:previous,data}));
    Object.keys(data).forEach(key => localStorage.removeItem(key));
  }
  localStorage.setItem('psx_local_account', next);
  return !!previous && previous !== next;
}
