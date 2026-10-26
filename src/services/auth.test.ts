import { beforeEach, afterEach, expect, it, vi } from 'vitest';
vi.mock('../utils/signupConversion', () => ({ trackSuccessfulSignup: vi.fn() }));
import { trackSuccessfulSignup } from '../utils/signupConversion';
const mock = vi.hoisted(() => { vi.stubEnv('VITE_SUPABASE_URL','https://unit.example.invalid');vi.stubEnv('VITE_SUPABASE_ANON_KEY','unit-key');return {session:vi.fn(),reset:vi.fn(),update:vi.fn(),out:vi.fn(),otp:vi.fn(),login:vi.fn()}; });
vi.mock('@supabase/supabase-js', () => ({createClient:() => ({auth:{getSession:mock.session,resetPasswordForEmail:mock.reset,updateUser:mock.update,signOut:mock.out,signInWithOtp:mock.otp,signInWithPassword:mock.login}})}));
vi.mock('./driveStorage', () => ({ getValidToken:vi.fn(), getRememberedDriveConfig:vi.fn(), setDrivePasswordProviders:vi.fn(), installLinkedDriveSession:vi.fn(),clearDriveSession:vi.fn() }));
import { getValidToken, getRememberedDriveConfig, installLinkedDriveSession } from './driveStorage';
import { getAccessStatus, requestPasswordReset, completePasswordReset, requestPasswordSetup, changeAccountPassword, getPasswordAccountBackupStatus, restorePasswordDriveSession } from './auth';
beforeEach(() => {
  vi.clearAllMocks(); mock.session.mockResolvedValue({data:{session:{access_token:'test-token',user:{email:'a@example.invalid'}}}});
  vi.mocked(getRememberedDriveConfig).mockResolvedValue({enabled:false});
  vi.mocked(getValidToken).mockResolvedValue(null);
  mock.out.mockResolvedValue({error:null});
  vi.stubGlobal('localStorage',{getItem:() => null});
  vi.stubGlobal('window',{location:{origin:'https://app.example.invalid'}});
});
it('Google password setup verifies the email through an allowed recovery route',async()=>{mock.otp.mockResolvedValue({error:null});await requestPasswordSetup(' a@example.invalid ');expect(mock.otp).toHaveBeenCalledWith({email:'a@example.invalid',options:{shouldCreateUser:true,emailRedirectTo:'https://app.example.invalid/reset-password'}});expect(mock.update).not.toHaveBeenCalled();});
it('password reset uses the explicit recovery route',async()=>{mock.reset.mockResolvedValue({error:null});await requestPasswordReset('a@example.invalid');expect(mock.reset).toHaveBeenCalledWith('a@example.invalid',{redirectTo:'https://app.example.invalid/reset-password'});});
it('wrong current password or account mismatch never changes a password',async()=>{mock.login.mockResolvedValue({data:{user:null},error:new Error('wrong')});await expect(changeAccountPassword('a@example.invalid','wrong','new-long-password')).rejects.toThrow('verified');mock.login.mockResolvedValue({data:{user:{email:'other@example.invalid'}},error:null});await expect(changeAccountPassword('a@example.invalid','current','new-long-password')).rejects.toThrow('verified');expect(mock.update).not.toHaveBeenCalled();});
it('changes a password only after verifying the same email and removes the temporary session',async()=>{mock.login.mockResolvedValue({data:{user:{email:'a@example.invalid'}},error:null});mock.update.mockResolvedValue({error:null});await changeAccountPassword('a@example.invalid','current','new-long-password');expect(mock.update).toHaveBeenCalledWith({password:'new-long-password'});expect(mock.out).toHaveBeenCalledWith({scope:'local'});});
afterEach(() => vi.unstubAllGlobals());
it('reports a sign-up only after the server confirms a new active registration for the authenticated account', async () => {
  const response = { status: 'trial', approved: true, active: true, new: true, accountEmail: 'a@example.invalid' };
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(response))));
  expect((await getAccessStatus(' A@example.invalid ', 'A', true)).active).toBe(true);
  expect(trackSuccessfulSignup).toHaveBeenCalledOnce();
  expect(trackSuccessfulSignup).toHaveBeenCalledWith('a@example.invalid');
});
it('does not count logins, read-only checks, pending accounts, failed responses or another identity as sign-ups', async () => {
  const base = { status: 'trial', approved: true, active: true, new: true, accountEmail: 'a@example.invalid' };
  for (const [data, notify, httpStatus] of [
    [{ ...base, new: false }, true, 200],
    [base, false, 200],
    [{ ...base, status: 'pending', active: false }, true, 200],
    [{ ...base, accountEmail: 'other@example.invalid' }, true, 200],
    [{ ...base, new: 'true' }, true, 200],
    [base, true, 503],
  ] as const) {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(data), { status: httpStatus })));
    await getAccessStatus('a@example.invalid', 'A', notify);
  }
  expect(trackSuccessfulSignup).not.toHaveBeenCalled();
});
it('tracks a new Google registration through the same verified account endpoint', async () => {
  mock.session.mockResolvedValue({data:{session:null}});
  vi.mocked(getValidToken).mockResolvedValue('google-test-token');
  vi.stubGlobal('localStorage',{getItem:() => JSON.stringify({email:'a@example.invalid'})});
  const request = vi.fn(async () => new Response(JSON.stringify({status:'trial',active:true,new:true,accountEmail:'a@example.invalid'})));
  vi.stubGlobal('fetch',request);
  expect((await getAccessStatus('a@example.invalid','A',true)).active).toBe(true);
  expect(request).toHaveBeenCalledWith('/api/request-access',expect.objectContaining({headers:expect.objectContaining({Authorization:'Bearer google-test-token'})}));
  expect(trackSuccessfulSignup).toHaveBeenCalledOnce();
});
it('does not count an email registration while confirmation has not produced an authenticated session', async () => {
  mock.session.mockResolvedValue({data:{session:null}});
  const request = vi.fn();vi.stubGlobal('fetch',request);
  expect((await getAccessStatus('a@example.invalid','A',true)).status).toBe('unavailable');
  expect(request).not.toHaveBeenCalled();
  expect(trackSuccessfulSignup).not.toHaveBeenCalled();
});
it.each([429,503])('HTTP %s is unavailable, never pending approval', async status => {
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{}',{status})));
  expect((await getAccessStatus('a@example.invalid')).status).toBe('unavailable');
});
it('network errors are unavailable while a valid pending response remains pending', async () => {
  vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('offline')));
  expect((await getAccessStatus('a@example.invalid')).status).toBe('unavailable');
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({status:'pending',active:false}))));
  expect((await getAccessStatus('a@example.invalid')).status).toBe('pending');
});
it('accepts projection access only from a matching verified account response', async () => {
  for (const [accountEmail, flag, expected] of [
    ['a@example.invalid', true, true], ['another@example.invalid', true, false],
    [undefined, true, false], ['a@example.invalid', 'true', false],
  ] as const) {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: 'lifetime', active: true, accountEmail, features: { chartProjection: flag },
    }))));
    expect((await getAccessStatus('a@example.invalid')).features?.chartProjection).toBe(expected);
  }
});
it('shares simultaneous access checks but rechecks a newly approved lifetime account', async () => {
  let release!: (response: Response) => void;
  const request = vi.fn(() => new Promise<Response>(resolve => { release = resolve; }));
  vi.stubGlobal('fetch', request);
  const a = getAccessStatus('a@example.invalid'), b = getAccessStatus(' A@example.invalid ');
  expect(a).toBe(b);
  await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  release(new Response(JSON.stringify({ status: 'pending', approved: false, active: false })));
  expect((await a).status).toBe('pending');
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: 'lifetime', approved: true, active: true, lifetime: true }))));
  expect(await getAccessStatus('a@example.invalid')).toMatchObject({ status: 'lifetime', active: true, lifetime: true });
});
it('expired recovery sessions cannot update a password', async () => {
  mock.session.mockResolvedValue({data:{session:null}});
  await expect(completePasswordReset('a-long-password')).rejects.toThrow('expired');
  expect(mock.update).not.toHaveBeenCalled();
});
it('password update signs out only after the update succeeds', async () => {
  mock.update.mockResolvedValue({error:null});
  await completePasswordReset('a-long-password'); expect(mock.out).toHaveBeenCalledTimes(1);
  mock.update.mockResolvedValue({error:new Error('expired')});
  await expect(completePasswordReset('a-long-password')).rejects.toThrow('fresh link');
  expect(mock.out).toHaveBeenCalledTimes(1);
});
it('recognizes the same email’s saved Drive backup using the password session',async()=>{
  mock.session.mockResolvedValue({data:{session:{access_token:'password-token',user:{email:'a@example.invalid'}}}});
  const fetchMock=vi.fn().mockResolvedValue(new Response(JSON.stringify({revision:5,fileId:'existing-drive-file'})));
  vi.stubGlobal('fetch',fetchMock);
  expect(await getPasswordAccountBackupStatus(' A@example.invalid ')).toBe('saved');
  expect(fetchMock).toHaveBeenCalledWith('/api/cloud-sync',expect.objectContaining({
    headers:expect.objectContaining({Authorization:'Bearer password-token'}),body:JSON.stringify({action:'head'}),
  }));
});
it('never checks another account’s backup using a mismatched password session',async()=>{
  mock.session.mockResolvedValue({data:{session:{access_token:'other-token',user:{email:'b@example.invalid'}}}});
  const fetchMock=vi.fn();vi.stubGlobal('fetch',fetchMock);
  await expect(getPasswordAccountBackupStatus('a@example.invalid')).rejects.toThrow('Sign in');
  expect(fetchMock).not.toHaveBeenCalled();
});
it('does not treat legacy backups or a failed version check as a missing portfolio',async()=>{
  mock.session.mockResolvedValue({data:{session:{access_token:'password-token',user:{email:'a@example.invalid'}}}});
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({revision:0,fileId:null}))));
  expect(await getPasswordAccountBackupStatus('a@example.invalid')).toBe('unknown');
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{}',{status:503})));
  await expect(getPasswordAccountBackupStatus('a@example.invalid')).rejects.toThrow('unavailable');
});
it('password login restores the linked Drive session and waits for portfolio loading',async()=>{
  mock.session.mockResolvedValue({data:{session:{access_token:'password-token',user:{email:'a@example.invalid'}}}});
  vi.mocked(getRememberedDriveConfig).mockResolvedValue({enabled:true});
  const session={connected:true,accessToken:'google-token',expiresIn:3600,user:{email:'a@example.invalid',name:'A',picture:''}};
  const fetchMock=vi.fn().mockResolvedValue(new Response(JSON.stringify(session)));vi.stubGlobal('fetch',fetchMock);
  expect(await restorePasswordDriveSession('a@example.invalid')).toBe(true);
  expect(installLinkedDriveSession).toHaveBeenCalledWith(session,'a@example.invalid');
  expect(fetchMock).toHaveBeenCalledWith('/api/cloud-sync',expect.objectContaining({headers:expect.objectContaining({Authorization:'Bearer password-token','X-Requested-With':'PSXTracker'}),body:JSON.stringify({action:'drive-token'})}));
});
it('sign-out during automatic Drive restore never installs the returned session',async()=>{
  mock.session.mockResolvedValueOnce({data:{session:{access_token:'password-token',user:{email:'a@example.invalid'}}}}).mockResolvedValueOnce({data:{session:null}});
  vi.mocked(getRememberedDriveConfig).mockResolvedValue({enabled:true});
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({connected:true}))));
  await expect(restorePasswordDriveSession('a@example.invalid')).rejects.toThrow('Account changed');expect(installLinkedDriveSession).not.toHaveBeenCalled();
});
it('missing remembered permission shows the linking fallback, never an empty cloud success',async()=>{
  mock.session.mockResolvedValue({data:{session:{access_token:'password-token',user:{email:'a@example.invalid'}}}});
  vi.mocked(getRememberedDriveConfig).mockResolvedValue({enabled:true});
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({connected:false,reason:'not-linked'}))));
  expect(await restorePasswordDriveSession('a@example.invalid')).toBe(false);expect(installLinkedDriveSession).not.toHaveBeenCalled();
});
it('invalid server setup reports its error instead of asking for a connection that cannot be remembered',async()=>{
  mock.session.mockResolvedValue({data:{session:{access_token:'password-token',user:{email:'a@example.invalid'}}}});
  vi.mocked(getRememberedDriveConfig).mockResolvedValue({enabled:false,error:'The server encryption key needs correction.'});
  await expect(restorePasswordDriveSession('a@example.invalid')).rejects.toThrow('encryption key needs correction');
  expect(installLinkedDriveSession).not.toHaveBeenCalled();
});
it('password setup links Drive while fresh email proof is available, then signs out',async()=>{
  mock.session.mockResolvedValue({data:{session:{access_token:'email-proof',user:{email:'a@example.invalid'}}}});
  mock.update.mockResolvedValue({error:null});vi.mocked(getRememberedDriveConfig).mockResolvedValue({enabled:true});
  const fetchMock=vi.fn().mockResolvedValue(new Response(JSON.stringify({connected:true})));vi.stubGlobal('fetch',fetchMock);
  expect(await completePasswordReset('new-long-password')).toEqual({driveLinkFailed:false});
  expect(fetchMock.mock.calls[0][1].body).toBe(JSON.stringify({action:'drive-bind'}));
  expect(fetchMock.mock.invocationCallOrder[0]).toBeLessThan(mock.out.mock.invocationCallOrder[0]);
});
it('a password that was saved successfully is not reported as failed when Drive linking is unavailable',async()=>{
  mock.session.mockResolvedValue({data:{session:{access_token:'email-proof',user:{email:'a@example.invalid'}}}});
  mock.update.mockResolvedValue({error:null});vi.mocked(getRememberedDriveConfig).mockResolvedValue({enabled:true});
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{}',{status:503})));
  expect(await completePasswordReset('new-long-password')).toEqual({driveLinkFailed:true});expect(mock.out).toHaveBeenCalledOnce();
});
