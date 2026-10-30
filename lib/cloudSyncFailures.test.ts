import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({auth:vi.fn(),limits:vi.fn(),connection:vi.fn(),rpc:vi.fn()}));
vi.mock('./requireOnlineUser.js', () => ({requireOnlineUser:mocks.auth}));
vi.mock('./sharedRateLimit.js', () => ({limitRequest:mocks.limits}));
vi.mock('./driveConnections.js', () => ({handleDriveConnection:mocks.connection}));
vi.mock('./serverDb.js', () => ({serverDb:() => ({rpc:mocks.rpc})}));
import handler from '../api/cloud-sync.js';
function response() {
  return { code: 0, body: null as any, setHeader: vi.fn(), end: vi.fn(), status(n: number) { this.code = n; return this; }, json(body: any) { this.body = body; return this; } };
}
beforeEach(() => {vi.resetAllMocks();mocks.limits.mockResolvedValue(true);mocks.auth.mockResolvedValue({ok:true,user:{email:'test@example.invalid'}});});
it('lets a browser navigate through the edge check and returns only to this app login without reading or changing accounts', async () => {
  const res = response();
  await handler({ method: 'GET', query: { 'security-check': '1', returnTo: 'https://example.invalid' }, body: { action: 'commit' } }, res);
  expect(res.code).toBe(303);
  expect(res.setHeader).toHaveBeenCalledWith('Location', '/login');
  expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  expect(res.end).toHaveBeenCalledOnce();
  expect(res.body).toBeNull();
  for (const mock of Object.values(mocks)) expect(mock).not.toHaveBeenCalled();
});
it.each([{}, { 'security-check': '0' }, { 'security-check': ['1', '1'] }])('keeps other GET requests unsupported', async query => {
  const res = response();
  await handler({ method: 'GET', query }, res);
  expect(res.code).toBe(405);
  for (const mock of Object.values(mocks)) expect(mock).not.toHaveBeenCalled();
});
it('still requires authentication for a POST with the recovery query', async () => {
  mocks.auth.mockResolvedValue({ok:false});
  const res = response();
  await handler({ method: 'POST', query: { 'security-check': '1' }, headers: {}, body: { action: 'head' } }, res);
  expect(res.code).toBe(401);
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(res.setHeader).not.toHaveBeenCalledWith('Location', expect.anything());
});
it.each(['auth','limits','connection'] as const)('returns JSON even when %s setup fails', async part => {
  mocks[part].mockRejectedValue(new Error('private upstream detail'));
  const res = {code:0,body:null as any,setHeader:vi.fn(),status(n:number){this.code=n;return this;},json(body:any){this.body=body;return this;}};
  await handler({method:'POST',headers:{},body:{action:part === 'connection' ? 'drive-config' : 'head'}},res);
  expect(res.code).toBe(503);
  expect(res.body.error).toContain('Cloud version check unavailable');
  expect(res.body.error).not.toContain('private upstream detail');
  expect(mocks.rpc).not.toHaveBeenCalled();
});
