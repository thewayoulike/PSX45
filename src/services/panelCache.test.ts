import { describe, expect, it } from 'vitest';
import {
  applyDrivePanelCache,
  exportPanelCacheForDrive,
  panelKeys,
  readPanel,
  savePanel,
} from './panelCache';

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => { map.delete(key); },
    setItem: (key, value) => { map.set(key, value); },
  };
}

describe('panel cache', () => {
  it('returns the last saved panel immediately', () => {
    const storage = memoryStorage();
    savePanel(panelKeys.profile('ogdc'), { companyInfo: { symbol: 'OGDC' } }, storage, () => '2026-09-22T12:00:00.000Z');
    expect(readPanel<{ companyInfo: { symbol: string } }>(panelKeys.profile('OGDC'), storage)?.data.companyInfo.symbol).toBe('OGDC');
  });

  it('does not replace a saved list with an empty failure', () => {
    const storage = memoryStorage();
    savePanel('meetings:market', [{ ticker: 'OGDC' }], storage, () => '2026-09-22T10:00:00.000Z');
    expect(savePanel('meetings:market', [], storage, () => '2026-09-22T11:00:00.000Z')).toBe(false);
    expect(readPanel<Array<{ ticker: string }>>('meetings:market', storage)?.data[0].ticker).toBe('OGDC');
  });

  it('does not rewrite an unchanged panel', () => {
    const storage = memoryStorage();
    const now = () => '2026-09-22T12:00:00.000Z';
    expect(savePanel('movers:KSE100', [{ ticker: 'OGDC' }], storage, now)).toBe(true);
    expect(savePanel('movers:KSE100', [{ ticker: 'OGDC' }], storage, () => '2026-09-22T13:00:00.000Z')).toBe(false);
    expect(readPanel('movers:KSE100', storage)?.savedAt).toBe('2026-09-22T12:00:00.000Z');
  });

  it('keeps the newer copy when Drive and this browser disagree', () => {
    const storage = memoryStorage();
    savePanel('meetings:market', [{ ticker: 'OLD' }], storage, () => '2026-09-22T10:00:00.000Z');
    applyDrivePanelCache({
      'meetings:market': { savedAt: '2026-09-22T11:00:00.000Z', data: [{ ticker: 'NEW', date: '2026-10-01T00:00:00.000Z' }] },
      'movers:KSE100': { savedAt: '2026-09-21T00:00:00.000Z', data: [{ ticker: 'CLOUD' }] },
    }, storage);
    savePanel('movers:KMI30', [{ ticker: 'LOCAL' }], storage, () => '2026-09-22T12:00:00.000Z');
    applyDrivePanelCache({
      'movers:KMI30': { savedAt: '2026-09-22T09:00:00.000Z', data: [{ ticker: 'STALE' }] },
    }, storage);
    const meetings = readPanel<Array<{ ticker: string; date: Date }>>('meetings:market', storage);
    expect(meetings?.data[0].ticker).toBe('NEW');
    expect(meetings?.data[0].date).toBeInstanceOf(Date);
    expect(readPanel<Array<{ ticker: string }>>('movers:KMI30', storage)?.data[0].ticker).toBe('LOCAL');
  });

  it('drops the oldest profiles past the cap and leaves huge rows off the Drive copy', () => {
    const storage = memoryStorage();
    savePanel('profile:AAA', { n: 1 }, storage, () => '2026-09-22T01:00:00.000Z');
    savePanel('profile:BBB', { n: 2 }, storage, () => '2026-09-22T02:00:00.000Z');
    savePanel('profile:CCC', { n: 3 }, storage, () => '2026-09-22T03:00:00.000Z', { profile: 2 });
    expect(readPanel('profile:AAA', storage)).toBeNull();
    expect(readPanel('profile:CCC', storage)?.data).toEqual({ n: 3 });

    savePanel('profile:BIG', { blob: 'x'.repeat(90_000) }, storage, () => '2026-09-22T04:00:00.000Z', { profile: 2 });
    expect(readPanel('profile:BIG', storage)).not.toBeNull();
    const drive = exportPanelCacheForDrive(storage, { maxEntryChars: 80_000 });
    expect(drive['profile:BIG']).toBeUndefined();
    expect(drive['profile:CCC']).toBeTruthy();
  });
});
