import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { recoveryActivationStatus } from './swRecovery';

let reload: ReturnType<typeof vi.fn>;
let storage: Map<string, string>;
let container: EventTarget & { controller: object; getRegistration: ReturnType<typeof vi.fn> };
beforeEach(() => {
  vi.resetModules(); reload = vi.fn(); storage = new Map();
  container = Object.assign(new EventTarget(), { controller: {}, getRegistration: vi.fn().mockResolvedValue(undefined) });
  vi.stubGlobal('window', { location: { reload } });
  vi.stubGlobal('navigator', { onLine: true, serviceWorker: container });
  vi.stubGlobal('localStorage', { length: 0, key: () => null });
  vi.stubGlobal('sessionStorage', { getItem: (k: string) => storage.get(k), setItem: (k: string, v: string) => storage.set(k, v) });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('safe app version recovery', () => {
  it('checks for an update before reloading and deduplicates concurrent failures', async () => {
    const { recoverAppVersion } = await import('./chunkRecovery');
    const a = recoverAppVersion(), b = recoverAppVersion();
    expect(a).toBe(b); expect(await a).toBe('reloading');
    expect(container.getRegistration).toHaveBeenCalledOnce(); expect(reload).toHaveBeenCalledOnce();
    expect(await recoverAppVersion()).toBe('cooldown');
  });
  it('preserves in-flight edits, open editors and pending backups, including manual retry', async () => {
    const m = await import('./chunkRecovery');
    m.setUnsavedLocalChanges(true); expect(await m.recoverAppVersion(true)).toBe('unsaved');
    m.setUnsavedLocalChanges(false); m.setRecoveryEditorOpen(true); expect(await m.recoverAppVersion(true)).toBe('unsaved');
    m.setRecoveryEditorOpen(false);
    vi.stubGlobal('localStorage', { length: 1, key: () => 'psx_pending_cloud_v1:other-account' });
    expect(await m.recoverAppVersion(true)).toBe('unsaved'); expect(reload).not.toHaveBeenCalled();
  });
  it('does not reload offline, on non-chunk failures, or when storage is inaccessible', async () => {
    const m = await import('./chunkRecovery');
    expect(await m.recoverMissingChunk(new Error('render failed'))).toBe(false);
    vi.stubGlobal('navigator', { onLine: false }); expect(await m.recoverAppVersion()).toBe('offline');
    vi.stubGlobal('navigator', { onLine: true }); vi.stubGlobal('localStorage', { get length() { throw new Error('blocked'); } });
    expect(await m.recoverAppVersion()).toBe('unsaved'); expect(reload).not.toHaveBeenCalled();
  });
  it('waits for the newer controller instead of reloading the old shell', async () => {
    const worker = { postMessage: vi.fn((_message, ports) => {
      ports[0].postMessage({ status: 'activating' });
      expect(reload).not.toHaveBeenCalled();
      container.controller = {}; container.dispatchEvent(new Event('controllerchange'));
    }) };
    container.getRegistration.mockResolvedValue({ waiting: worker, update: vi.fn().mockResolvedValue(undefined) });
    const { recoverAppVersion } = await import('./chunkRecovery');
    expect(await recoverAppVersion()).toBe('reloading'); expect(worker.postMessage).toHaveBeenCalledOnce(); expect(reload).toHaveBeenCalledOnce();
  });
  it('leaves other app tabs untouched and explains why activation is blocked', async () => {
    const worker = { postMessage: (_message, ports) => ports[0].postMessage({ status: 'other-tabs' }) };
    container.getRegistration.mockResolvedValue({ waiting: worker, update: vi.fn().mockResolvedValue(undefined) });
    const { recoverAppVersion } = await import('./chunkRecovery');
    expect(await recoverAppVersion()).toBe('other-tabs'); expect(reload).not.toHaveBeenCalled();
  });
  it('fails with a bounded wait when a legacy worker cannot answer', async () => {
    vi.useFakeTimers();
    container.getRegistration.mockResolvedValue({ waiting: { postMessage() {} }, update: vi.fn().mockResolvedValue(undefined) });
    const { recoverAppVersion } = await import('./chunkRecovery');
    const result = recoverAppVersion(); await vi.advanceTimersByTimeAsync(10_100);
    expect(await result).toBe('unavailable'); expect(reload).not.toHaveBeenCalled();
  });
  it('rechecks pending data after update installation', async () => {
    const m = await import('./chunkRecovery');
    container.getRegistration.mockResolvedValue({ update: async () => { m.setUnsavedLocalChanges(true); } });
    expect(await m.recoverAppVersion()).toBe('unsaved'); expect(reload).not.toHaveBeenCalled();
  });
  it('the worker refuses activation with any other window, including old clients', async () => {
    const matchAll = vi.fn().mockResolvedValue([{ id: 'requesting' }, { id: 'legacy' }]);
    expect(await recoveryActivationStatus({ clients: { matchAll } }, 'requesting')).toBe('other-tabs');
    matchAll.mockResolvedValue([{ id: 'requesting' }]);
    expect(await recoveryActivationStatus({ clients: { matchAll } }, 'requesting')).toBe('activating');
    expect(await recoveryActivationStatus({ clients: { matchAll } }, 'unknown')).toBe('unavailable');
  });
});
