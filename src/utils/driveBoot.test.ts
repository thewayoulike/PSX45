import { describe, expect, it } from 'vitest';
import { isDriveBooting, viewWaitsForDrive } from './driveBoot';

const idle = { restoringDrive: false, hasDriveUser: false, readyToSave: false, loadingLatestCloud: false, cloudSyncing: false };

describe('Drive loading in the background', () => {
  it('counts restoring the saved Drive session as loading', () => {
    expect(isDriveBooting({ ...idle, restoringDrive: true })).toBe(true);
  });

  it('counts the first open of the latest backup as loading', () => {
    expect(isDriveBooting({ ...idle, hasDriveUser: true, cloudSyncing: true })).toBe(true);
  });

  it('is done once the backup is open, or when a later refresh runs over a ready portfolio', () => {
    expect(isDriveBooting({ ...idle, hasDriveUser: true, readyToSave: true, cloudSyncing: true })).toBe(false);
    expect(isDriveBooting({ ...idle, hasDriveUser: true, loadingLatestCloud: true, cloudSyncing: true })).toBe(false);
    expect(isDriveBooting(idle)).toBe(false);
  });

  it('keeps market and reference screens open and holds portfolio screens until the backup is in', () => {
    for (const view of ['MARKETS', 'INSIDERS', 'PRACTICE', 'TRADING_LAB', 'CHARTS', 'CALCS', 'HOW_IT_WORKS', 'SUGGESTIONS']) {
      expect(viewWaitsForDrive(view, true)).toBe(false);
    }
    for (const view of ['DASHBOARD', 'HOLDINGS', 'HISTORY', 'WATCHLIST', 'ALERTS', 'PROFILE_SETTINGS']) {
      expect(viewWaitsForDrive(view, true)).toBe(true);
    }
    expect(viewWaitsForDrive('DASHBOARD', false)).toBe(false);
  });
});
