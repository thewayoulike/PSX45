import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  user: { ok: true, user: { email: 'owner@example.invalid' } } as any,
  row: null as any, rpc: vi.fn(), upsert: vi.fn(), mail: vi.fn(), limits: vi.fn(),
}));
vi.mock('./serverDb.js', () => ({ serverDb: () => ({ rpc: mocks.rpc, from: () => ({
  select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mocks.row, error: null }) }) }), upsert: mocks.upsert,
}) }) }));
vi.mock('./sharedRateLimit.js', () => ({ limitRequest: mocks.limits, sharedRateLimit: async () => false }));
vi.mock('./requireOnlineUser.js', () => ({ requireOnlineUser: async () => mocks.user }));
vi.mock('./brevo.js', () => ({ sendBrevo: mocks.mail, escapeHtml: (s: string) => s.replaceAll('<','&lt;') }));
import approve from '../api/approve-user.js';
import access from '../api/check-access.js';
import requestAccess from '../api/notify-signup.js';
import cloud from '../api/cloud-sync.js';
import admin from '../api/admin-users.js';
import { validateMarketQuery } from './marketLimits.js';
const token = 'a'.repeat(64);
function res() { return { code:0, body:undefined as any, setHeader:vi.fn(), status(n:number) {this.code=n;return this;}, send(b:any){this.body=b;return this;}, json(b:any){this.body=b;return this;}, end(){return this;} }; }
beforeEach(() => {
  vi.clearAllMocks(); mocks.row=null; mocks.user={ok:true,user:{email:'owner@example.invalid'}};
  mocks.limits.mockResolvedValue(true); mocks.upsert.mockResolvedValue({error:null});
  vi.stubEnv('APP_URL','https://app.example.invalid'); vi.stubEnv('ADMIN_SECRET',undefined);
});
afterEach(() => vi.unstubAllEnvs());
describe('approval boundary', () => {
  it('rejects old shared-secret links and missing credentials', async () => {
    const r=res(); await approve({method:'GET',query:{email:'other@example.invalid'},headers:{}},r);
    expect(r.code).toBe(401); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('GET confirms without mutating or emailing', async () => {
    mocks.row={email:'member@example.invalid',expires_at:'2099-01-01',used_at:null};
    const r=res(); await approve({method:'GET',query:{token},headers:{}},r);
    expect(r.code).toBe(200); expect(r.body).toContain('method="post"');
    expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.mail).not.toHaveBeenCalled();
  });
  it('POST consumes only the token-bound identity, ignores a substituted email', async () => {
    mocks.rpc.mockResolvedValue({data:'member@example.invalid',error:null});
    const r=res(); await approve({method:'POST',body:{token,email:'substituted@example.invalid'},headers:{origin:'https://app.example.invalid'}},r);
    expect(r.code).toBe(200); expect(mocks.mail.mock.calls[0][0]).toBe('member@example.invalid');
    expect(mocks.rpc.mock.calls[0][1]).toEqual({p_hash:expect.stringMatching(/^[a-f0-9]{64}$/)});
  });
  it('used tokens and cross-origin submissions cannot approve', async () => {
    mocks.rpc.mockResolvedValue({data:null,error:null}); const r=res();
    await approve({method:'POST',body:{token},headers:{}},r); expect(r.code).toBe(410);
    const cross=res(); await approve({method:'POST',body:{token},headers:{origin:'https://elsewhere.invalid'}},cross); expect(cross.code).toBe(403);
  });
  it('admin never inherits the legacy approval secret', async () => {
    vi.stubEnv('APPROVE_SECRET','legacy'); const r=res();
    await admin({method:'GET',headers:{'x-admin-secret':'legacy'}},r); expect(r.code).toBe(500);
  });
});
describe('account and cloud boundaries', () => {
  it('rejects anonymous access before querying account data', async () => {
    mocks.user={ok:false}; const r=res(); await access({method:'POST',body:{email:'target'},headers:{}},r);
    expect(r.code).toBe(401); expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it('read-only lookup does not create a pending request', async () => {
    const r=res(); await access({method:'POST',body:{},headers:{}},r); expect(r.code).toBe(200); expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it('creates requests only for the verified identity', async () => {
    const bad=res(); await requestAccess({method:'POST',body:{email:'someone@example.invalid'},headers:{}},bad); expect(bad.code).toBe(403);
    const r=res(); await requestAccess({method:'POST',body:{name:'Member'},headers:{}},r); expect(r.code).toBe(200);
    expect(mocks.upsert.mock.calls[0][0].email).toBe('owner@example.invalid');
  });
  it('cloud commits use authenticated owner and surface a CAS conflict', async () => {
    mocks.rpc.mockResolvedValue({data:{conflict:true,revision:2,fileId:'fileBBBBBBBBBB'},error:null});
    const r=res(); await cloud({method:'POST',headers:{},body:{action:'commit',revision:1,fileId:'fileAAAAAAAAAA',email:'victim'}},r);
    expect(r.code).toBe(409); expect(mocks.rpc.mock.calls[0][1].p_email).toBe('owner@example.invalid');
  });
  it('caps batches and rejects malformed market queries', () => {
    expect(validateMarketQuery({symbols:Array(21).fill('OGDC').join(',')})).toBeTruthy();
    expect(validateMarketQuery({symbol:'../secret'})).toBeTruthy();
    expect(validateMarketQuery({symbol:'OGDC',period:'6mo'})).toBeNull();
  });
});
