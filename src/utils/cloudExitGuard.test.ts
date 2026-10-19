import { describe, expect, it, vi } from 'vitest';
import { installCloudExitGuard, UNSAVED_LOGOUT_MESSAGE } from './cloudExitGuard';

describe('unsaved cloud exit guard', () => {
  it('warns on close while unsynced, preserves on mobile backgrounding, and stops warning after sync', () => {
    const target = new EventTarget(), doc = Object.assign(new EventTarget(), { visibilityState: 'hidden' });
    let unsaved = true;
    const preserve = vi.fn();
    const dispose = installCloudExitGuard(target as unknown as Window, doc as unknown as Document, () => unsaved, preserve);
    const close = new Event('beforeunload', { cancelable: true });
    target.dispatchEvent(close);
    expect(close.defaultPrevented).toBe(true);
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(preserve).toHaveBeenCalledTimes(2);
    unsaved = false;
    const synced = new Event('beforeunload', { cancelable: true });
    target.dispatchEvent(synced);
    expect(synced.defaultPrevented).toBe(false);
    dispose(); unsaved = true;
    target.dispatchEvent(new Event('beforeunload', { cancelable: true }));
    expect(preserve).toHaveBeenCalledTimes(2);
    expect(UNSAVED_LOGOUT_MESSAGE).toContain('have not saved to Google Drive');
  });
  it('still warns if the local recovery write fails', () => {
    const target = new EventTarget(), doc = new EventTarget();
    const dispose = installCloudExitGuard(target as unknown as Window, doc as unknown as Document, () => true, () => { throw new Error('full'); });
    const close = new Event('beforeunload', { cancelable: true });
    target.dispatchEvent(close);
    expect(close.defaultPrevented).toBe(true);
    dispose();
  });
});
