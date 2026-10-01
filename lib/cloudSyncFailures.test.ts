import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({auth:vi.fn(),limits:vi.fn(),connection:vi.fn(),rpc:vi.fn()}));
vi.mock('./requireOnlineUser.js', () => ({requireOnlineUser:mocks.auth}));
vi.mock('./sharedRateLimit.js', () => ({limitRequest:mocks.limits}));
vi.mock('./driveConnections.js', () => ({handleDriveConnection:mocks.connection}));
vi.mock('./serverDb.js', () => ({serverDb:() => ({rpc:mocks.rpc})}));
import handler from '../api/cloud-sync.js';
beforeEach(() => {vi.resetAllMocks();mocks.limits.mockResolvedValue(true);mocks.auth.mockResolvedValue({ok:true,user:{email:'test@example.invalid'}});});
it.each(['auth','limits','connection'] as const)('returns JSON even when %s setup fails', async part => {
  mocks[part].mockRejectedValue(new Error('private upstream detail'));
  const res = {code:0,body:null as any,setHeader:vi.fn(),status(n:number){this.code=n;return this;},json(body:any){this.body=body;return this;}};
  await handler({method:'POST',headers:{},body:{action:part === 'connection' ? 'drive-config' : 'head'}},res);
  expect(res.code).toBe(503);
  expect(res.body.error).toContain('Cloud version check unavailable');
  expect(res.body.error).not.toContain('private upstream detail');
  expect(mocks.rpc).not.toHaveBeenCalled();
});
