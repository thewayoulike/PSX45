export const shortenRevision = (revision: string) => revision.slice(0, 4);
export const isCloudConflictError = (error?: string | null) => !!error?.startsWith('Another device saved a newer version.');
export function formatPendingAge(queuedAt: string, now = new Date()) {
  const minutes = Math.max(0, Math.floor((now.getTime() - Date.parse(queuedAt)) / 60000));
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h`;
}
export function shortenCloudError(error: string) {
  if (isCloudConflictError(error)) return 'Checking Google Drive. Your unsaved transactions are kept on this device.';
  if (error.startsWith('Sync paused to protect transactions.')) return 'Sync paused to protect transactions. Your local records are still here; download a copy before reviewing differences.';
  if (error.startsWith('Hosting security check')) return 'Hosting security check required. Open PSX Tracker in Chrome, complete the check, then retry. Changes kept locally.';
  if (error.startsWith('Cloud sync received a web page')) return 'Cloud check unavailable. Changes kept locally. Retry or download a local copy.';
  const status = error.match(/HTTP (\d{3})/);
  return status ? `HTTP ${status[1]} — changes kept locally` : error.split('. ')[0];
}
export function syncHealthStatus(s: { isSyncing: boolean; error: string | null; lastSave: string | null; hasPending: boolean }) {
  return s.isSyncing ? 'Syncing…' : isCloudConflictError(s.error) ? 'Loading Drive' : s.error ? 'Not synced' : s.hasPending ? 'Pending' : s.lastSave ? 'Synced' : 'Not yet saved';
}
