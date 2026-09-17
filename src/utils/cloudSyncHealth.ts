export const shortenRevision = (revision: string) => revision.slice(0, 4);
export const isCloudConflictError = (error?: string | null) => !!error?.startsWith('Another device saved a newer version.');
export function formatPendingAge(queuedAt: string, now = new Date()) {
  const minutes = Math.max(0, Math.floor((now.getTime() - Date.parse(queuedAt)) / 60000));
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h`;
}
export function shortenCloudError(error: string) {
  if (isCloudConflictError(error)) return 'Another device saved newer data. Load latest to use it; a local recovery copy will be kept.';
  const status = error.match(/HTTP (\d{3})/);
  return status ? `HTTP ${status[1]} — changes kept locally` : error.split('. ')[0];
}
export function syncHealthStatus(s: { isSyncing: boolean; error: string | null; lastSave: string | null; hasPending: boolean }) {
  return s.isSyncing ? 'Syncing…' : isCloudConflictError(s.error) ? 'Newer cloud copy' : s.error ? 'Not synced' : s.hasPending ? 'Pending' : s.lastSave ? 'Synced' : 'Not yet saved';
}
