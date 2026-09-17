import { expect, it, vi } from 'vitest';
const getUser=vi.hoisted(()=>vi.fn());
vi.mock('@supabase/supabase-js',()=>({createClient:()=>({auth:{getUser}})}));
import { getBearerUser } from './verifyUser.js';
it('does not treat an unverified email as a verified account identity',async()=>{getUser.mockResolvedValue({data:{user:{id:'x',email:'a@example.invalid',email_confirmed_at:null}},error:null});expect(await getBearerUser({headers:{authorization:'Bearer synthetic-token'}})).toBeNull();getUser.mockResolvedValue({data:{user:{id:'x',email:'a@example.invalid',email_confirmed_at:'2026-09-17'}},error:null});expect(await getBearerUser({headers:{authorization:'Bearer synthetic-token'}})).toMatchObject({email:'a@example.invalid'});});
