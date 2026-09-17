import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => { vi.stubEnv('VITE_SUPABASE_URL','https://unit.example.invalid');vi.stubEnv('VITE_SUPABASE_ANON_KEY','unit-key');return {session:vi.fn(),reset:vi.fn(),update:vi.fn(),out:vi.fn(),otp:vi.fn(),login:vi.fn()}; });
vi.mock('@supabase/supabase-js', () => ({createClient:() => ({auth:{getSession:mock.session,resetPasswordForEmail:mock.reset,updateUser:mock.update,signOut:mock.out,signInWithOtp:mock.otp,signInWithPassword:mock.login}})}));
vi.mock('./driveStorage', () => ({ getValidToken:async () => null }));
import { getAccessStatus, requestPasswordReset, completePasswordReset, requestPasswordSetup, changeAccountPassword } from './auth';
beforeEach(() => {
  vi.clearAllMocks(); mock.session.mockResolvedValue({data:{session:{access_token:'test-token'}}});
  mock.out.mockResolvedValue({error:null});
  vi.stubGlobal('localStorage',{getItem:() => null});
  vi.stubGlobal('window',{location:{origin:'https://app.example.invalid'}});
});
it('Google password setup verifies the email through an allowed recovery route',async()=>{mock.otp.mockResolvedValue({error:null});await requestPasswordSetup(' a@example.invalid ');expect(mock.otp).toHaveBeenCalledWith({email:'a@example.invalid',options:{shouldCreateUser:true,emailRedirectTo:'https://app.example.invalid/reset-password'}});expect(mock.update).not.toHaveBeenCalled();});
it('password reset uses the explicit recovery route',async()=>{mock.reset.mockResolvedValue({error:null});await requestPasswordReset('a@example.invalid');expect(mock.reset).toHaveBeenCalledWith('a@example.invalid',{redirectTo:'https://app.example.invalid/reset-password'});});
it('wrong current password or account mismatch never changes a password',async()=>{mock.login.mockResolvedValue({data:{user:null},error:new Error('wrong')});await expect(changeAccountPassword('a@example.invalid','wrong','new-long-password')).rejects.toThrow('verified');mock.login.mockResolvedValue({data:{user:{email:'other@example.invalid'}},error:null});await expect(changeAccountPassword('a@example.invalid','current','new-long-password')).rejects.toThrow('verified');expect(mock.update).not.toHaveBeenCalled();});
it('changes a password only after verifying the same email and removes the temporary session',async()=>{mock.login.mockResolvedValue({data:{user:{email:'a@example.invalid'}},error:null});mock.update.mockResolvedValue({error:null});await changeAccountPassword('a@example.invalid','current','new-long-password');expect(mock.update).toHaveBeenCalledWith({password:'new-long-password'});expect(mock.out).toHaveBeenCalledWith({scope:'local'});});
afterEach(() => vi.unstubAllGlobals());
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
