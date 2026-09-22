import { afterEach, expect, it, vi } from 'vitest';
import { createSliceWriter, mergeChanged } from './slicePersistence';
import { recoverMissingChunk, setUnsavedLocalChanges } from './chunkRecovery';
afterEach(() => { vi.unstubAllGlobals(); setUnsavedLocalChanges(false); });
it('does not serialize unchanged transactions during a price update; switching accounts rewrites them', () => {
  const setItem = vi.fn(), serialize = vi.fn(() => []), tx = { toJSON: serialize };
  const write = createSliceWriter({ setItem });
  write('a', { transactions: tx, prices: { A: 1 } });
  write('a', { transactions: tx, prices: { A: 2 } });
  expect(serialize).toHaveBeenCalledTimes(1); expect(setItem).toHaveBeenCalledTimes(3);
  write('b', { transactions: tx }); expect(serialize).toHaveBeenCalledTimes(2);
});
it('retries a slice that failed to save and preserves equal price-map references', () => {
  const setItem = vi.fn().mockImplementationOnce(() => { throw new Error('quota'); });
  const write = createSliceWriter({ setItem }); const data = { A: 1 };
  expect(() => write('a', { data })).toThrow('quota'); write('a', { data }); expect(setItem).toHaveBeenCalledTimes(2);
  expect(mergeChanged(data, { A: 1 })).toBe(data); expect(mergeChanged(data, { B: 2 })).toEqual({ A: 1, B: 2 });
});
it('never reloads during the save debounce or with a pending backup, and stops reload loops', async () => {
  const reload = vi.fn(), store = new Map<string, string>();
  vi.stubGlobal('window', { location: { reload } }); vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('localStorage', { length: 0, key: () => null });
  vi.stubGlobal('sessionStorage', { getItem: (k: string) => store.get(k), setItem: (k: string, v: string) => store.set(k, v) });
  const error = new Error('Failed to fetch dynamically imported module');
  setUnsavedLocalChanges(true); expect(await recoverMissingChunk(error)).toBe(false);
  setUnsavedLocalChanges(false); vi.stubGlobal('localStorage', { length: 1, key: () => 'psx_pending_cloud_v1:a' });
  expect(await recoverMissingChunk(error)).toBe(false);
  vi.stubGlobal('localStorage', { length: 0 }); expect(await recoverMissingChunk(error)).toBe(true); expect(await recoverMissingChunk(error)).toBe(false);
  expect(reload).toHaveBeenCalledTimes(1);
});
