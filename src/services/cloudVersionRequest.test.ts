import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requestCloudVersion } from './cloudVersionRequest';
import { shortenCloudError } from '../utils/cloudSyncHealth';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
describe('cloud response recovery', () => {
  it('recognizes a hosting challenge and stops automatic retries', async () => {
    const request = vi.fn(async () => new Response('<html>checkpoint</html>', {status:429,headers:{'x-vercel-mitigated':'challenge'}}));
    const error = await requestCloudVersion(request, true).catch(error => error);
    expect(error.message).toContain('Hosting security check');
    expect(error.message).not.toContain('wait a minute');
    expect(shortenCloudError(error.message)).toContain('complete the check');
    expect(request).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each([200, 502, 503])('retries one HTML read failure (HTTP %s) and returns only the valid result', async status => {
    const request = vi.fn().mockResolvedValueOnce(new Response('<html>temporary page</html>', {status})).mockResolvedValueOnce(json({revision:3,fileId:'file'}));
    const result = requestCloudVersion(request, true);
    await vi.advanceTimersByTimeAsync(600);
    await expect(result).resolves.toEqual({revision:3,fileId:'file'});
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('stops after two failures and does not tell users to refresh with unsaved data', async () => {
    const request = vi.fn(async () => new Response('<html>private upstream detail</html>', {status:503}));
    const result = requestCloudVersion(request, true).catch(error => error);
    await vi.advanceTimersByTimeAsync(600);
    const error = await result;
    expect(error.message).toContain('HTTP 503');
    expect(error.message).toContain('download a local copy');
    expect(error.message).not.toMatch(/private upstream|refresh/);
    expect(shortenCloudError(error.message)).toContain('Cloud check unavailable');
    expect(request).toHaveBeenCalledTimes(2);
  });
  it.each([401, 403, 409, 429])('never automatically retries an access, conflict, or rate-limit response (HTTP %s)', async status => {
    const request = vi.fn(async () => new Response('<html>error</html>', {status}));
    await expect(requestCloudVersion(request, true)).rejects.toBeInstanceOf(Error);
    expect(request).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('never replays a commit when its response is HTML', async () => {
    const request = vi.fn(async () => new Response('<html>timeout</html>', {status:504}));
    await expect(requestCloudVersion(request, false)).rejects.toThrow('HTTP 504');
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('retries a network interruption only on a read', async () => {
    const request = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValue(json({revision:0,fileId:null}));
    const result = requestCloudVersion(request, true);
    await vi.advanceTimersByTimeAsync(600);
    await expect(result).resolves.toEqual({revision:0,fileId:null});
    expect(request).toHaveBeenCalledTimes(2);
  });
});
