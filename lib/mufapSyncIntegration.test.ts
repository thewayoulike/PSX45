import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { afterEach, expect, it, vi } from 'vitest';
import { main } from '../scripts/sync-mufap-nav.mjs';

const roots: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) {
    if (path.dirname(path.resolve(root)) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('psx-mufap-test-')) throw new Error('Unsafe cleanup path');
    fs.rmSync(root, { recursive:true, force:true });
  }
});
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'psx-mufap-test-')); roots.push(root);
  const catalog = Object.fromEntries(Array.from({length:60},(_,i)=>[`MF:${i}`, { id:`MF:${i}`,nav:10,repurchase:10,validityDate:'Oct 21, 2026' }]));
  const payload = { count:60, reportDate:'Oct 21, 2026', today:'2026-10-22', catalog, previousNavs:{} };
  for (const file of ['data/fund-nav-catalog.json','public/data/fund-nav-catalog.json']) {
    fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true}); fs.writeFileSync(path.join(root,file),JSON.stringify(payload));
  }
  vi.stubEnv('MUFAP_WRITE_EXCEL','0');
  return { root, payload, saved:fs.readFileSync(path.join(root,'data/fund-nav-catalog.json'),'utf8') };
}
it('a blocked download or older report leaves both catalog copies untouched', async () => {
  const {root,payload,saved}=fixture();
  await expect(main({root,anchor:'2026-10-24',latest:async()=>{throw new Error('security challenge');}})).rejects.toThrow('security challenge');
  const funds = Object.values(payload.catalog).map(f=>({...f,validityDate:'Oct 20, 2026'}));
  await expect(main({root,anchor:'2026-10-24',latest:async()=>({funds,reportDate:'Oct 20, 2026',dateYmd:'2026-10-20'})})).rejects.toThrow(/older NAVs/);
  expect(fs.readFileSync(path.join(root,'data/fund-nav-catalog.json'),'utf8')).toBe(saved);
  expect(fs.readFileSync(path.join(root,'public/data/fund-nav-catalog.json'),'utf8')).toBe(saved);
  expect(fs.existsSync(path.join(root,'data/fund-nav-previous.json'))).toBe(false);
});
it('publishes valid new prices and uses actual prior NAV dates when historical fetches are blocked', async () => {
  const {root,payload}=fixture();
  const funds = Object.values(payload.catalog).map(f=>({...f,nav:11,repurchase:11,validityDate:'Oct 22, 2026'}));
  const result=await main({root,anchor:'2026-10-24',latest:async()=>({funds,reportDate:'2026-10-22',dateYmd:'2026-10-22',source:'test'}),previous:async()=>{throw Object.assign(new Error('blocked'),{code:'SOURCE_BLOCKED'});}});
  expect(result).toMatchObject({today:'2026-10-22',yesterday:'2026-10-21',count:60});
  expect(result.catalog['MF:0']).toMatchObject({nav:11,prevNav:10});
  expect(fs.readFileSync(path.join(root,'data/fund-nav-catalog.json'),'utf8')).toBe(fs.readFileSync(path.join(root,'public/data/fund-nav-catalog.json'),'utf8'));
});
