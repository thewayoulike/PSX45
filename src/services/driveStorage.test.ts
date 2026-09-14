import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

let storage: Map<string, string>;
let service: typeof import('./driveStorage');
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
async function login(email = 'a@example.com') {
  storage.set('psx_drive_access_token', 'test-token');
  storage.set('psx_drive_user_profile', JSON.stringify({ email }));
  storage.set('psx_drive_token_expiry', String(Date.now() + 3600000));
  service.initDriveAuth(() => {});
}
beforeEach(async () => {
  vi.resetModules(); vi.useFakeTimers();
  storage = new Map();
  vi.stubGlobal('localStorage', { getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v), removeItem: (k: string) => storage.delete(k) });
  vi.stubGlobal('document', { getElementById: () => true });
  vi.stubGlobal('window', {});
  service = await import('./driveStorage');
  await login();
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('cloud save outcomes and recovery', () => {
  it.each([401, 403, 429, 500])('retains pending changes after HTTP %s', async status => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response({ files: [{ id: 'db' }] }))
      .mockResolvedValueOnce(response({}, status)));
    expect((await service.saveToDrive({ transactions: [1] })).ok).toBe(false);
    expect([...storage.keys()].some(k => k.startsWith('psx_pending_cloud'))).toBe(true);
  });
  it('does not create a replacement file when lookup fails', async () => {
    const fetcher = vi.fn().mockResolvedValue(response({}, 403)); vi.stubGlobal('fetch', fetcher);
    expect((await service.saveToDrive({})).ok).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('serializes snapshots and clears only the last successful pending revision', async () => {
    let finishFirst!: (r: Response) => void;
    let writes = 0;
    const fetcher = vi.fn(async (url: string) => {
      if (!url.includes('/upload/')) return response({ files: [{ id: 'db' }] });
      writes++;
      if (writes === 1) return new Promise<Response>(resolve => { finishFirst = resolve; });
      return response({});
    });
    vi.stubGlobal('fetch', fetcher);
    const first = service.saveToDrive({ marker: 1 });
    const second = service.saveToDrive({ marker: 2 });
    await vi.waitFor(() => expect(writes).toBe(1));
    expect(JSON.parse([...storage.entries()].find(([k]) => k.startsWith('psx_pending_cloud'))![1]).data.marker).toBe(2);
    finishFirst(response({}));
    expect((await first).ok).toBe(true);
    expect((await second).ok).toBe(true);
    expect(writes).toBe(2);
    expect([...storage.keys()].some(k => k.startsWith('psx_pending_cloud'))).toBe(false);
  });
  it('recovers failed snapshots only for their account and surfaces failed loads', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await service.saveToDrive({ marker: 'pending' });
    expect(await service.loadFromDrive()).toMatchObject({ marker: 'pending' });
    await login('b@example.com');
    await expect(service.loadFromDrive()).rejects.toThrow('offline');
  });
  it('keeps failed Sheets exports pending even when the Drive upload succeeded', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(response({ files: [{ id: 'db' }] }))
      .mockResolvedValueOnce(response({}))
      .mockResolvedValueOnce(response({ files: [{ id: 'sheet' }] }))
      .mockResolvedValueOnce(response({ sheets: [] }))
      .mockResolvedValueOnce(response({}, 500)));
    const result = await service.saveToDrive({ transactions: [], portfolios: [{ id: 'a', name: 'A' }] }, true);
    expect(result.ok).toBe(false);
    expect([...storage.keys()].some(k => k.startsWith('psx_pending_cloud'))).toBe(true);
  });
});
