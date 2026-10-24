/** Screens that never read or write the portfolio book, so they stay usable while Drive loads. */
const DRIVE_FREE_VIEWS = new Set(['MARKETS', 'INSIDERS', 'PRACTICE', 'CHARTS', 'CALCS', 'HOW_IT_WORKS', 'SUGGESTIONS']);

export function isDriveBooting(s: {
  restoringDrive: boolean;
  hasDriveUser: boolean;
  readyToSave: boolean;
  loadingLatestCloud: boolean;
  cloudSyncing: boolean;
}): boolean {
  if (s.restoringDrive) return true;
  return s.hasDriveUser && !s.readyToSave && !s.loadingLatestCloud && s.cloudSyncing;
}

export function viewWaitsForDrive(view: string, booting: boolean): boolean {
  return booting && !DRIVE_FREE_VIEWS.has(view);
}
