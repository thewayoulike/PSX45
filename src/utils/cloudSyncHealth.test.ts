import { describe, expect, it } from 'vitest';
import {
  formatPendingAge,
  shortenCloudError,
  shortenRevision,
  syncHealthStatus,
} from './cloudSyncHealth';

describe('cloudSyncHealth', () => {
  it('shortens a revision to 4 leading hex chars', () => {
    expect(shortenRevision('a3f9c21e-1234-5678-9abc-def012345678')).toBe('a3f9');
  });

  it('formats pending age in minutes under an hour', () => {
    const queuedAt = '2026-09-17T14:00:00.000Z';
    const now = new Date('2026-09-17T14:02:30.000Z');
    expect(formatPendingAge(queuedAt, now)).toBe('2m');
  });

  it('shortens long cloud errors to a single actionable line', () => {
    expect(shortenCloudError('Cloud request failed (HTTP 429). Your changes remain unsynced. Please retry or sign in again.'))
      .toBe('HTTP 429 — changes kept locally');
  });

  it('maps syncing / error / synced / pending statuses', () => {
    expect(syncHealthStatus({ isSyncing: true, error: null, lastSave: null, hasPending: false })).toBe('Saving…');
    expect(syncHealthStatus({ isSyncing: false, error: 'fail', lastSave: 'x', hasPending: true })).toBe('Not synced');
    expect(syncHealthStatus({ isSyncing: false, error: null, lastSave: 'x', hasPending: false })).toBe('Synced');
    expect(syncHealthStatus({ isSyncing: false, error: null, lastSave: null, hasPending: true })).toBe('Pending');
    expect(syncHealthStatus({ isSyncing: false, error: null, lastSave: null, hasPending: false })).toBe('Not yet saved');
  });
});
