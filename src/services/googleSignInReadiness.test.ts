import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
let service: typeof import('./googleSignInReadiness');
let scripts: FakeScript[];
class FakeScript extends EventTarget {
  id = ''; src = ''; async = false; defer = false; removed = false;
  remove() { this.removed = true; }
}
const sdk = () => { window.google = { accounts: { oauth2: { initTokenClient: vi.fn(), initCodeClient: vi.fn() } } }; };
beforeEach(async () => {
  vi.resetModules(); vi.useFakeTimers(); scripts = [];
  vi.stubGlobal('window', {});
  vi.stubGlobal('document', {
    getElementById: (id: string) => scripts.find(s => s.id === id && !s.removed) || null,
    createElement: () => new FakeScript(),
    head: { appendChild: (s: FakeScript) => scripts.push(s) },
  });
  service = await import('./googleSignInReadiness');
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('Google sign-in preparation', () => {
  it('shows hosting challenge guidance without repeating the blocked settings request', async () => {
    sdk();
    const { ApiResponseError } = await import('./apiResponse');
    const config = vi.fn().mockRejectedValue(new ApiResponseError('Hosting security check required. Open Chrome.', 429, 'hosting-check'));
    const flow = service.createGoogleSignInReadiness(config);
    await flow.prepare();
    expect(flow.getSnapshot()).toMatchObject({status:'error',message:expect.stringContaining('Hosting security check')});
    expect(config).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('waits for both settings and the delayed SDK, shares work, and never opens OAuth', async () => {
    let finish!: () => void;
    const config = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    const flow = service.createGoogleSignInReadiness(config), listener = vi.fn();
    const unsubscribe = flow.subscribe(listener);
    const first = flow.prepare(); expect(flow.prepare()).toBe(first);
    expect(flow.getSnapshot().status).toBe('loading'); expect(config).toHaveBeenCalledOnce(); expect(scripts).toHaveLength(1);
    finish(); await vi.advanceTimersByTimeAsync(3000);
    expect(flow.getSnapshot().status).toBe('loading');
    sdk(); scripts[0].dispatchEvent(new Event('load')); await first;
    expect(flow.getSnapshot().status).toBe('ready');
    expect(window.google.accounts.oauth2.initTokenClient).not.toHaveBeenCalled();
    expect(window.google.accounts.oauth2.initCodeClient).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0); expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe(); await flow.prepare(); expect(config).toHaveBeenCalledOnce();
  });
  it('automatically retries one transient settings failure', async () => {
    sdk(); const config = vi.fn().mockRejectedValueOnce(new Error('503')).mockResolvedValueOnce({ enabled: true });
    const flow = service.createGoogleSignInReadiness(config), request = flow.prepare();
    await vi.advanceTimersByTimeAsync(600); await request;
    expect(flow.getSnapshot().status).toBe('ready'); expect(config).toHaveBeenCalledTimes(2);
  });
  it('shows a bounded settings failure and recovers on explicit retry', async () => {
    sdk(); const config = vi.fn().mockRejectedValue(new Error('offline'));
    const flow = service.createGoogleSignInReadiness(config), request = flow.prepare();
    await vi.advanceTimersByTimeAsync(600); await request;
    expect(flow.getSnapshot()).toMatchObject({ status: 'error', message: expect.stringContaining('PSX Tracker') });
    expect(config).toHaveBeenCalledTimes(2); await vi.advanceTimersByTimeAsync(60000); expect(config).toHaveBeenCalledTimes(2);
    config.mockResolvedValue({ enabled: true }); await flow.prepare(); expect(flow.getSnapshot().status).toBe('ready');
  });
  it('removes a failed script and loads a replacement when retried', async () => {
    const flow = service.createGoogleSignInReadiness(async () => ({})), first = flow.prepare();
    scripts[0].dispatchEvent(new Event('error')); await first;
    expect(flow.getSnapshot().status).toBe('error'); expect(scripts[0].removed).toBe(true);
    const retry = flow.prepare(); expect(scripts).toHaveLength(2);
    sdk(); scripts[1].dispatchEvent(new Event('load')); await retry;
    expect(flow.getSnapshot().status).toBe('ready'); expect(vi.getTimerCount()).toBe(0);
  });
  it('times out an existing stuck script instead of polling forever', async () => {
    const stale = new FakeScript(); stale.id = 'google-gsi-script'; scripts.push(stale);
    const flow = service.createGoogleSignInReadiness(async () => ({})), request = flow.prepare();
    await vi.advanceTimersByTimeAsync(12000); await request;
    expect(flow.getSnapshot()).toMatchObject({ status: 'error', message: expect.stringContaining('could not load') });
    expect(stale.removed).toBe(true); expect(vi.getTimerCount()).toBe(0);
  });
  it('does not announce ready while the configuration remains pending', async () => {
    sdk(); let finish!: () => void;
    const flow = service.createGoogleSignInReadiness(() => new Promise<void>(resolve => { finish = resolve; }));
    const request = flow.prepare(); await vi.advanceTimersByTimeAsync(1000);
    expect(flow.getSnapshot().status).toBe('loading'); expect(scripts).toHaveLength(0);
    finish(); await request; expect(flow.getSnapshot().status).toBe('ready');
  });
});
