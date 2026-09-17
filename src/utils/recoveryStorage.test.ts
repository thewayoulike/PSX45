import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { saveRecoveryCopies, readRecoveryCopies } from './recoveryStorage';
let values: Map<string, string>;
const key = 'psx_cloud_recovery:a%40example.com:old';
beforeEach(() => {
  values = new Map();
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: () => { throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); },
    removeItem: (key: string) => values.delete(key),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('archives current and pending copies even when localStorage is full and migrates old copies', async () => {
  values.set(key, 'old-copy');
  values.set('psx_cloud_recovery:b%40example.com:other', 'other-account');
  const copies = [{ key: `${key}:current`, raw: 'current-copy' }, { key: `${key}:pending`, raw: 'pending-copy' }];
  await saveRecoveryCopies('a@example.com', copies);
  expect(values.has(key)).toBe(false);
  expect(values.get('psx_cloud_recovery:b%40example.com:other')).toBe('other-account');
  expect(await readRecoveryCopies('a@example.com')).toEqual(expect.arrayContaining([{key,raw:'old-copy'}, ...copies]));
  expect(await readRecoveryCopies('a@example.com')).toHaveLength(3);
});

it('leaves old copies intact if the archive transaction aborts after a successful put', async () => {
  values.set(key, 'only-copy');
  const original = IDBObjectStore.prototype.put;
  vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function(value, id) {
    const request = original.call(this, value, id);
    request.onsuccess = () => this.transaction.abort();
    return request;
  });
  await expect(saveRecoveryCopies('a@example.com', [])).rejects.toThrow('has not been replaced');
  expect(values.get(key)).toBe('only-copy');
  vi.restoreAllMocks();
  expect(await readRecoveryCopies('a@example.com')).toEqual([{key,raw:'only-copy'}]);
});

it('never removes a legacy copy changed while migration was committing', async () => {
  values.set(key, 'before');
  const original = IDBObjectStore.prototype.put;
  vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function(value, id) {
    const request = original.call(this, value, id);
    request.onsuccess = () => values.set(key, 'after');
    return request;
  });
  await saveRecoveryCopies('a@example.com', []);
  expect(values.get(key)).toBe('after');
  expect((await readRecoveryCopies('a@example.com')).map(copy => copy.raw).sort()).toEqual(['after', 'before']);
});

it('rejects mismatched account keys', async () => {
  await expect(saveRecoveryCopies('b@example.com', [{key,raw:'private-a'}])).rejects.toThrow('account');
  expect(await readRecoveryCopies('b@example.com')).toEqual([]);
});
