import {beforeEach,afterEach,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({open:vi.fn()}));
vi.mock('../../services/isolatedDriveDocuments',()=>({openDriveDocuments:mock.open,isolatedDriveQueue:(_e:string,_k:string,job:()=>Promise<any>)=>job()}));
import {syncLabToDrive} from './driveSync';
import {labKey,readLab,writeLab,hasPendingLab,mergeLabs,deleteLabTicket} from './storage';
import {DEFAULT_PLAN} from './engine';
const email='lab@example.test';
const ticket=(id:string)=>({id,createdAt:'2026-10-24T15:00:00Z',plan:{...DEFAULT_PLAN,entry:100,stop:98,target:105},quantity:10,sourceDate:'2026-10-23',note:id});
const book=(id:string)=>({watchlist:'OGDC',watchlistUpdatedAt:'2026-10-24T15:00:00Z',tickets:[ticket(id)]});
let local:Map<string,string>;
beforeEach(()=>{local=new Map();vi.stubGlobal('localStorage',{getItem:(key:string)=>local.get(key)||null,setItem:(key:string,value:string)=>local.set(key,value)});mock.open.mockReset();});
afterEach(()=>vi.unstubAllGlobals());
it('restores the remote journal on a fresh device without uploading empty defaults',async()=>{
  const save=vi.fn(),remote=book('remote');mock.open.mockResolvedValue({read:async()=>[{fileId:'cloud',savedAt:'2026-10-24',value:remote}],save});
  await syncLabToDrive(email);expect(readLab(email)).toEqual(remote);expect(save).not.toHaveBeenCalled();expect(hasPendingLab(email)).toBe(false);
});
it('keeps edits made during upload pending, then includes them in the next save',async()=>{
  writeLab(email,book('local'));const remote=book('remote');
  const copies=[{fileId:'cloud',savedAt:'2026-10-24',value:remote}];
  const save=vi.fn(async(value:any)=>{writeLab(email,mergeLabs(readLab(email),book('during-upload')));return {fileId:'new',savedAt:'2026-10-24',value};});
  mock.open.mockResolvedValue({read:async()=>copies,save});
  await syncLabToDrive(email);
  expect(readLab(email).tickets.map(t=>t.id).sort()).toEqual(['during-upload','local','remote']);expect(hasPendingLab(email)).toBe(true);
  mock.open.mockResolvedValue({read:async()=>[{fileId:'new',savedAt:'2026-10-24',value:save.mock.calls[0][0]}],save:async(value:any)=>({fileId:'final',savedAt:'2026-10-24',value})});
  await syncLabToDrive(email);expect(hasPendingLab(email)).toBe(false);expect(readLab(email).tickets).toHaveLength(3);
});
it('keeps local edits pending after network failure and never uploads corrupt local data',async()=>{
  writeLab(email,book('local'));mock.open.mockRejectedValue(new Error('Offline'));
  await expect(syncLabToDrive(email)).rejects.toThrow('Offline');expect(hasPendingLab(email)).toBe(true);expect(readLab(email).tickets[0].id).toBe('local');
  local.set(labKey(email),'{broken');const save=vi.fn();mock.open.mockResolvedValue({read:async()=>[],save});
  await expect(syncLabToDrive(email)).rejects.toThrow();expect(local.get(labKey(email))).toBe('{broken');expect(save).not.toHaveBeenCalled();
});
it('keeps a deletion made during upload pending and syncs it without resurrecting the plan',async()=>{
  writeLab(email,book('local'));
  const save=vi.fn(async(value:any)=>{writeLab(email,deleteLabTicket(readLab(email),'local'));return {fileId:'upload',savedAt:'2026-10-24',value};});
  mock.open.mockResolvedValue({read:async()=>[{fileId:'remote',savedAt:'2026-10-24',value:book('remote')}],save});
  await syncLabToDrive(email);
  expect(readLab(email).tickets.map(t=>t.id)).toEqual(['remote']);expect(hasPendingLab(email)).toBe(true);
  const finalSave=vi.fn(async(value:any)=>({fileId:'final',savedAt:'2026-10-24',value}));
  mock.open.mockResolvedValue({read:async()=>[{fileId:'upload',savedAt:'2026-10-24',value:save.mock.calls[0][0]}],save:finalSave});
  await syncLabToDrive(email);
  expect(finalSave.mock.calls[0][0].deletedTicketIds).toEqual(['local']);
  expect(readLab(email).tickets.map(t=>t.id)).toEqual(['remote']);expect(hasPendingLab(email)).toBe(false);
});
it('honors remote deletions on a fresh device even alongside a stale Drive copy',async()=>{
  const original=book('removed'),deleted=deleteLabTicket(original,'removed');
  const save=vi.fn(async(value:any)=>({fileId:'merged',savedAt:'2026-10-24',value}));
  mock.open.mockResolvedValue({read:async()=>[{fileId:'old',savedAt:'2026-10-23',value:original},{fileId:'new',savedAt:'2026-10-24',value:deleted}],save});
  await syncLabToDrive(email);
  expect(readLab(email).tickets).toEqual([]);expect(readLab(email).deletedTicketIds).toEqual(['removed']);expect(hasPendingLab(email)).toBe(false);
});
