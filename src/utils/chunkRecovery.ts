let unsavedLocalChanges = false;
export const setUnsavedLocalChanges = (value: boolean) => { unsavedLocalChanges = value; };
export function recoverMissingChunk(error: Error): boolean {
  if (!/Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk .+ failed/i.test(error.message) || !navigator.onLine) return false;
  if (unsavedLocalChanges) return false;
  try {
    // Never force a refresh while any account has a pending durable save.
    for (let i = 0; i < localStorage.length; i++) if (localStorage.key(i)?.startsWith('psx_pending_cloud_v1:')) return false;
    const previous = Number(sessionStorage.getItem('psx_chunk_reload') || 0);
    if (Date.now() - previous < 120000) return false;
    sessionStorage.setItem('psx_chunk_reload', String(Date.now()));
    window.location.reload();
    return true;
  } catch { return false; }
}
