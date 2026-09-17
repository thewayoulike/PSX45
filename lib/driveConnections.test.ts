import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
const mock = vi.hoisted(() => ({ row: null as any, user: null as any, dbError: false, writes: [] as any[], online: null as any }));
vi.mock('./verifyUser.js', () => ({ getBearerUser: async () => mock.user }));
vi.mock('./requireOnlineUser.js', () => ({ requireOnlineUser: async () => mock.online || { ok: false } }));
vi.mock('./serverDb.js', () => ({ serverDb: () => ({ from: () => {
  let operation = 'read', values: any, filters: [string, any][] = [];
  const execute = () => {
    if (mock.dbError) return { data: null, error: new Error('database private detail') };
    const matches = mock.row && filters.every(([k,v]) => mock.row[k] === v);
    if (operation === 'upsert') { mock.writes.push(values); mock.row = { ...values }; }
    if (operation === 'update' && matches) { mock.writes.push(values); mock.row = { ...mock.row, ...values }; }
    const data = matches || operation === 'upsert' ? { ...mock.row } : null;
    if (operation === 'delete' && matches) mock.row = null;
    return { data, error: null };
  };
  const q: any = { select: () => q, eq: (k:string,v:any) => { filters.push([k,v]);return q; },
    maybeSingle: async () => execute(), update: (v:any) => { operation='update';values=v;return q; },
    upsert: (v:any) => { operation='upsert';values=v;return q; }, delete: () => { operation='delete';return q; },
    then: (resolve:any) => Promise.resolve(execute()).then(resolve) };
  return q;
} }) }));
import { encryptDriveToken, decryptDriveToken, handleDriveConnection } from './driveConnections.js';
const email = 'member@example.invalid', sub = 'google-member';
const origin = 'https://app.example.invalid';
const linkedTime = '2026-09-17T12:00:00.000Z';
const key = randomBytes(32);
const response = (data:any,status=200) => new Response(JSON.stringify(data),{status});
function req(action:string, claims:any = {}, extra:any = {}) {
  const jwt = `test.${Buffer.from(JSON.stringify({sub:'auth-member',session_id:'new-session',amr:[{method:'password',timestamp:Date.now()/1000}],...claims})).toString('base64url')}.signature`;
  return { headers:{origin,'x-requested-with':'PSXTracker',authorization:`Bearer ${jwt}`}, body:{action,...extra} };
}
async function run(request:any) {
  const res = { code:0, body:null as any, setHeader:vi.fn(), status(n:number){this.code=n;return this;},json(data:any){this.body=data;return this;} };
  await handleDriveConnection(request,res,request.body);return res;
}
beforeEach(() => {
  vi.stubEnv('GOOGLE_CLIENT_ID','unit-client');vi.stubEnv('GOOGLE_CLIENT_SECRET','unit-secret');
  vi.stubEnv('DRIVE_TOKEN_ENCRYPTION_KEY',key.toString('base64'));vi.stubEnv('APP_URL',origin);
  mock.user={id:'auth-member',email};mock.online=null;mock.dbError=false;mock.writes=[];
  mock.row={email,google_sub:sub,connection_id:'connection-1',refresh_ciphertext:encryptDriveToken('refresh-private',email,sub,key),auth_user_id:'auth-member',linked_session_id:'linked-session',linked_at:linkedTime};
  vi.stubGlobal('fetch',vi.fn(async (url:string) => url.includes('/token')
    ? response({access_token:'fresh-access',expires_in:3600,scope:'https://www.googleapis.com/auth/drive.file'})
    : response({sub,email,email_verified:true,name:'Member'})));
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});

it('encrypts differently each time and binds ciphertext to both email and Google identity',()=>{
  const a=encryptDriveToken('secret',email,sub,key),b=encryptDriveToken('secret',email,sub,key);
  expect(a).not.toBe(b);expect(a).not.toContain('secret');expect(decryptDriveToken(a,email,sub,key)).toBe('secret');
  expect(()=>decryptDriveToken(a,'other@example.invalid',sub,key)).toThrow();
  expect(()=>decryptDriveToken(a,email,'other-sub',key)).toThrow();
  expect(()=>decryptDriveToken(a,email,sub,randomBytes(32))).toThrow();
});
it('public configuration reveals neither secrets nor credentials and disables incomplete setup',async()=>{
  expect((await run(req('drive-config'))).body).toEqual({enabled:true,clientId:'unit-client'});
  vi.stubEnv('DRIVE_TOKEN_ENCRYPTION_KEY','1234');expect((await run(req('drive-config'))).body).toEqual({enabled:false,error:expect.stringContaining('32-byte random key')});
});
it('rejects foreign origins and missing CSRF headers before contacting Google',async()=>{
  const a=req('drive-token');a.headers.origin='https://foreign.invalid';expect((await run(a)).code).toBe(403);
  const b=req('drive-token');delete (b.headers as any)['x-requested-with'];expect((await run(b)).code).toBe(403);
  expect(fetch).not.toHaveBeenCalled();
});
it('rejects anonymous and unverifiable password tokens',async()=>{
  mock.user=null;expect((await run(req('drive-token'))).code).toBe(401);
  mock.user={id:'different',email};expect((await run(req('drive-token'))).code).toBe(401);
  expect(fetch).not.toHaveBeenCalled();
});
it('password login on a new device renews access for the same linked account only',async()=>{
  const result=await run(req('drive-token',{}, {email:'victim@example.invalid'}));
  expect(result.code).toBe(200);expect(result.body).toMatchObject({connected:true,accessToken:'fresh-access',user:{email}});
  expect(JSON.stringify(result.body)).not.toContain('refresh-private');
  expect(fetch).toHaveBeenCalledWith('https://oauth2.googleapis.com/token',expect.objectContaining({body:expect.any(URLSearchParams)}));
  expect((vi.mocked(fetch).mock.calls[0][1]?.body as URLSearchParams).get('refresh_token')).toBe('refresh-private');
  expect(result.setHeader).toHaveBeenCalledWith('Cache-Control','no-store');
});
it('an older auto-confirmed account session cannot gain newly linked Drive access by refreshing',async()=>{
  const result=await run(req('drive-token',{amr:[{method:'password',timestamp:1},{method:'token_refresh',timestamp:Date.now()/1000}]}));
  expect(result.body).toEqual({connected:false,reason:'verification-required'});expect(fetch).not.toHaveBeenCalled();
});
it('the exact session that explicitly linked Google can resume after JWT refresh',async()=>{
  expect((await run(req('drive-token',{session_id:'linked-session',amr:[{method:'password',timestamp:1}]}))).body.connected).toBe(true);
});
it('a different password user ID or missing connection never receives access',async()=>{
  mock.row.auth_user_id='other-id';expect((await run(req('drive-token'))).body.connected).toBe(false);
  mock.row=null;expect((await run(req('drive-token'))).body).toEqual({connected:false,reason:'not-linked'});expect(fetch).not.toHaveBeenCalled();
});
it('password setup requires fresh inbox proof and rotates the binding version',async()=>{
  expect((await run(req('drive-bind'))).code).toBe(403);
  expect((await run(req('drive-bind',{amr:[{method:'otp',timestamp:1}]}))).code).toBe(403);
  expect((await run(req('drive-bind',{amr:[{method:'otp',timestamp:Date.now()/1000}]}))).code).toBe(200);
  expect(mock.row.auth_user_id).toBe('auth-member');expect(mock.row.connection_id).not.toBe('connection-1');
});
it('Google exchange rejects a different Google email without replacing the saved connection',async()=>{
  vi.mocked(fetch).mockResolvedValueOnce(response({access_token:'access',refresh_token:'new-refresh',expires_in:3600,scope:'https://www.googleapis.com/auth/drive.file'}))
    .mockResolvedValueOnce(response({sub:'other',email:'other@example.invalid',email_verified:true}));
  expect((await run(req('drive-connect',{}, {code:'authorization-code'}))).code).toBe(403);expect(mock.writes).toHaveLength(0);
});
it('stores only encrypted refresh permission and returns only short-lived access after Google approval',async()=>{
  vi.mocked(fetch).mockResolvedValueOnce(response({access_token:'access',refresh_token:'new-refresh-private',expires_in:3600,scope:'https://www.googleapis.com/auth/drive.file'}));
  const result=await run(req('drive-connect',{}, {code:'authorization-code'}));expect(result.code).toBe(200);
  expect(mock.row.auth_user_id).toBe('auth-member');expect(decryptDriveToken(mock.row.refresh_ciphertext,email,sub,key)).toBe('new-refresh-private');
  expect(JSON.stringify(mock.writes)).not.toContain('new-refresh-private');expect(JSON.stringify(result.body)).not.toContain('refresh');
  expect((vi.mocked(fetch).mock.calls[0][1]?.body as URLSearchParams).get('redirect_uri')).toBe(origin);
});
it('first Google sign-in may save an unbound connection but never trust a client-supplied password ID',async()=>{
  mock.user=null;mock.row=null;
  vi.mocked(fetch).mockResolvedValueOnce(response({access_token:'access',refresh_token:'refresh',expires_in:3600,scope:'https://www.googleapis.com/auth/drive.file'}));
  const r=req('drive-connect',{}, {code:'authorization-code',auth_user_id:'forged'});delete (r.headers as any).authorization;
  expect((await run(r)).code).toBe(200);expect(mock.row.auth_user_id).toBeNull();
});
it('requires Drive scope and verified Google email',async()=>{
  vi.mocked(fetch).mockResolvedValueOnce(response({access_token:'access',expires_in:3600,scope:'openid'}));
  expect((await run(req('drive-connect',{}, {code:'authorization-code'}))).code).toBe(403);
  vi.mocked(fetch).mockResolvedValueOnce(response({access_token:'access',expires_in:3600,scope:'https://www.googleapis.com/auth/drive.file'})).mockResolvedValueOnce(response({sub,email,email_verified:false}));
  expect((await run(req('drive-connect',{}, {code:'authorization-code'}))).code).toBe(401);expect(mock.writes).toHaveLength(0);
});
it('revoked permission returns a reconnect error without exposing Google diagnostics',async()=>{
  vi.mocked(fetch).mockResolvedValueOnce(response({error:'invalid_grant',error_description:'private-provider-detail'},400));
  const r=await run(req('drive-token'));expect(r.code).toBe(409);expect(r.body.error).toContain('revoked');expect(JSON.stringify(r.body)).not.toContain('private-provider-detail');
});
it('invalid Google client credentials show a setup error without exposing credential values',async()=>{
  vi.mocked(fetch).mockResolvedValueOnce(response({error:'invalid_client',error_description:'private-provider-detail'},401));
  const r=await run(req('drive-connect',{}, {code:'authorization-code'}));expect(r.code).toBe(503);expect(r.body.error).toContain('client ID and client secret');
  expect(JSON.stringify(r.body)).not.toContain('private-provider-detail');expect(mock.writes).toHaveLength(0);
});
it('a refreshed token with mismatched Google identity is not delivered',async()=>{
  vi.mocked(fetch).mockResolvedValueOnce(response({access_token:'access',expires_in:3600})).mockResolvedValueOnce(response({email,sub:'wrong-sub',email_verified:true}));
  expect((await run(req('drive-token'))).code).toBe(403);
});
it('a concurrent disconnect prevents delivery of an in-flight renewed token',async()=>{
  vi.mocked(fetch).mockResolvedValueOnce(response({access_token:'access',expires_in:3600})).mockImplementationOnce(async()=>{mock.row=null;return response({email,sub,email_verified:true});});
  expect((await run(req('drive-token'))).code).toBe(409);
});
it('disconnect deletes the saved permission even when Google revocation is unreachable',async()=>{
  mock.online={ok:true,user:{email,id:'auth-member'}};vi.mocked(fetch).mockRejectedValue(new Error('offline'));
  expect((await run(req('drive-disconnect'))).code).toBe(200);expect(mock.row).toBeNull();
  expect(vi.mocked(fetch).mock.calls[0][0]).toBe('https://oauth2.googleapis.com/revoke');
});
it('database failure returns a safe error and does not expose internal details',async()=>{
  mock.dbError=true;const r=await run(req('drive-token'));expect(r.code).toBe(503);expect(JSON.stringify(r.body)).not.toContain('private detail');
});
