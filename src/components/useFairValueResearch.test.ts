import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readResearch, type FetchedResearch } from '../utils/fairValue';

// A deterministic hook runner lets deferred requests finish in any order. It runs
// the production hook, with only React scheduling and network I/O substituted.
const runtime = vi.hoisted(() => ({ slots: [] as any[], cursor: 0, cleanup: undefined as undefined | (() => void) }));
vi.mock('react', () => ({
  useState(initial: any) {
    const index = runtime.cursor++;
    if (!(index in runtime.slots)) runtime.slots[index] = typeof initial === 'function' ? initial() : initial;
    return [runtime.slots[index], (value: any) => { runtime.slots[index] = typeof value === 'function' ? value(runtime.slots[index]) : value; }];
  },
  useRef(initial: any) {
    const index = runtime.cursor++;
    return runtime.slots[index] ??= { current: initial };
  },
  useEffect(callback: () => () => void) {
    const index = runtime.cursor++;
    if (!(index in runtime.slots)) { runtime.slots[index] = true; runtime.cleanup = callback(); }
  },
}));
vi.mock('../services/fairValueData', () => ({ fetchFairValueData: vi.fn() }));
import { fetchFairValueData } from '../services/fairValueData';
import { useFairValueResearch } from './useFairValueResearch';

const fetcher = vi.mocked(fetchFairValueData);
const result = (price: number): FetchedResearch => ({ facts: { price, eps: 10 }, sources: { price: { name: 'Market quote', retrievedAt: '2026-09-21T12:00:00Z' }, eps: { name: 'Fundamentals feed', retrievedAt: '2026-09-21T12:00:00Z' } }, reportedDividend: { value: 0, retrievedAt: '2026-09-21T12:00:00Z', source: 'pyPSX annual dividend', basis: 'Annual cash per share.' }, warnings: [] });
function deferred() {
  let resolve!: (value: FetchedResearch) => void;
  const promise = new Promise<FetchedResearch>(done => { resolve = done; });
  return { promise, resolve };
}
function harness(initial: Record<string, any> = {}) {
  let cache = initial;
  const setter = vi.fn(next => { cache = typeof next === 'function' ? next(cache) : next; });
  const render = () => { runtime.cursor = 0; return useFairValueResearch(cache, setter); };
  return { render, setter, get cache() { return cache; }, externalSave(key: string, value: any) { cache = { ...cache, [key]: value }; } };
}
beforeEach(() => { runtime.slots = []; runtime.cursor = 0; runtime.cleanup = undefined; fetcher.mockReset(); });

describe('fair value research interactions', () => {
  it('auto-fills annual dividends, refreshes source values and protects a manual zero override', async () => {
    const h = harness(); h.render().changeTicker('OGDC');
    fetcher.mockResolvedValue({ ...result(100), reportedDividend: { ...result(100).reportedDividend!, value: 6 } });
    await h.render().refresh();
    expect(h.render().research.inputs.expectedDiv).toBe(6);
    expect(h.cache.OGDC.dividendSource.source).toBe('pyPSX annual dividend');
    fetcher.mockResolvedValue({ ...result(100), reportedDividend: { ...result(100).reportedDividend!, value: 8 } });
    await h.render().refresh();
    expect(h.render().research.inputs.expectedDiv).toBe(8);
    h.render().edit('expectedDiv', '0');
    await h.render().refresh();
    expect(h.render().research.inputs.expectedDiv).toBe(0);
    expect(h.render().research.dividendMode).toBe('manual');
    expect(h.render().research.dividendSource).toBeNull();
    h.render().useSourceDividend();
    expect(h.render().research.inputs.expectedDiv).toBe(8);
    expect(h.render().research.dividendMode).toBe('source');
  });

  it('preserves a dividend edited during loading', async () => {
    const pending = deferred(); fetcher.mockReturnValue(pending.promise);
    const h = harness(); h.render().changeTicker('OGDC');
    const refresh = h.render().refresh();
    h.render().edit('expectedDiv', '9');
    pending.resolve(result(150)); await refresh;
    expect(h.cache.OGDC.inputs.expectedDiv).toBe(9);
    expect(h.cache.OGDC.dividendMode).toBe('manual');
  });
  it('refreshes a cached ticker and keeps deliberate assumptions, including zero growth', async () => {
    const saved = readResearch(); saved.inputs = { ...saved.inputs, price: 42, fairPE: 12, cagr: 0, expectedDiv: 6, requiredReturn: 12 }; saved.dividendMode = 'manual';
    const h = harness({ OGDC: saved });
    h.render().changeTicker(' ogdc ');
    expect(h.render().research.inputs.price).toBe(42);
    fetcher.mockResolvedValue(result(150));
    await h.render().refresh();
    expect(fetcher).toHaveBeenCalledWith('OGDC', expect.any(AbortSignal));
    expect(h.render().research.inputs).toMatchObject({ price: 150, fairPE: 12, cagr: 0, expectedDiv: 6, requiredReturn: 12 });
    expect(h.cache.OGDC.reportedDividend.value).toBe(0);
    expect(h.cache.OGDC.savedAt).toBeTruthy();
  });

  it('ignores an old company reply even if the network ignores cancellation', async () => {
    const first = deferred(); const second = deferred();
    fetcher.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const h = harness(); h.render().changeTicker('OGDC');
    const pendingOld = h.render().refresh();
    const oldSignal = fetcher.mock.calls[0][1]!;
    h.render().changeTicker('MEBL');
    const pendingNew = h.render().refresh();
    first.resolve(result(123)); await pendingOld;
    expect(h.render().busy).toBe(true);
    expect(h.render().research.inputs.price).toBe('');
    expect(h.setter).not.toHaveBeenCalled();
    expect(oldSignal.aborted).toBe(true);
    second.resolve(result(456)); await pendingNew;
    expect(h.render().research.inputs.price).toBe(456);
    expect(h.cache).not.toHaveProperty('OGDC');
    expect(h.cache.MEBL.inputs.price).toBe(456);
  });

  it('preserves in-flight edits, even when a field is edited away and back to its old value', async () => {
    const request = deferred(); fetcher.mockReturnValue(request.promise);
    const h = harness(); h.render().changeTicker('OGDC');
    h.render().edit('price', '100');
    const pending = h.render().refresh();
    h.render().edit('price', '120'); h.render().edit('price', '100');
    h.render().edit('fairPE', '15');
    request.resolve(result(150)); await pending;
    expect(h.render().research.inputs).toMatchObject({ price: 100, eps: 10, fairPE: 15 });
    expect(h.cache.OGDC.sources.price.name).toBe('Entered manually');
    expect(h.render().message).toContain('Edits made during loading were kept');
  });

  it('does not cache a failed lookup and allows retrying', async () => {
    fetcher.mockRejectedValueOnce(new Error('No usable company figures')).mockResolvedValueOnce(result(150));
    const h = harness(); h.render().changeTicker('OGDC');
    await h.render().refresh();
    expect(h.setter).not.toHaveBeenCalled();
    expect(h.render().busy).toBe(false);
    expect(h.render().message).toContain('No usable company figures');
    await h.render().refresh();
    expect(h.cache.OGDC.inputs.price).toBe(150);
  });

  it('keeps missing figures with their original source date and preserves other cache entries', async () => {
    const saved = readResearch(); saved.inputs.bookValue = 40;
    saved.sources.bookValue = { name: 'Fundamentals feed', retrievedAt: '2026-09-01T12:00:00Z' };
    const pending = deferred(); fetcher.mockReturnValue(pending.promise);
    const h = harness({ OGDC: saved }); h.render().changeTicker('OGDC');
    const refresh = h.render().refresh();
    h.externalSave('FFC', { external: true });
    pending.resolve(result(150)); await refresh;
    expect(h.cache.FFC).toEqual({ external: true });
    expect(h.cache.OGDC.inputs.bookValue).toBe(40);
    expect(h.cache.OGDC.sources.bookValue.retrievedAt).toBe('2026-09-01T12:00:00Z');
  });

  it('saves manual assumptions and retains unsaved drafts when switching companies', () => {
    const h = harness(); h.render().changeTicker('OGDC');
    h.render().edit('fairPE', '12'); h.render().edit('cagr', '0');
    h.render().changeTicker('FFC'); h.render().changeTicker('OGDC');
    expect(h.render().research.inputs.fairPE).toBe(12);
    expect(h.render().dirty).toBe(true);
    h.render().save();
    expect(h.render().dirty).toBe(false);
    expect(readResearch(h.cache.OGDC).inputs).toMatchObject({ fairPE: 12, cagr: 0 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('prevents duplicate requests and respects a denied free-plan quota', async () => {
    const pending = deferred(); fetcher.mockReturnValue(pending.promise);
    const h = harness(); h.render().changeTicker('OGDC');
    await h.render().refresh(() => false);
    expect(fetcher).not.toHaveBeenCalled();
    const allowed = vi.fn(() => true);
    const first = h.render().refresh(allowed);
    await h.render().refresh(allowed);
    expect(allowed).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    pending.resolve(result(150)); await first;
  });

  it('does not save or update after unmount', async () => {
    const pending = deferred(); fetcher.mockReturnValue(pending.promise);
    const h = harness(); h.render().changeTicker('OGDC');
    const refresh = h.render().refresh();
    runtime.cleanup!();
    pending.resolve(result(150)); await refresh;
    expect(h.setter).not.toHaveBeenCalled();
    expect(fetcher.mock.calls[0][1]!.aborted).toBe(true);
  });
});
