import {it,expect,vi} from 'vitest';
import {labKey,parseWatchlist,readLab,writeLab,mergeLabs,parseLab} from './storage';
import {DEFAULT_PLAN,sizePlan} from './engine';
it('keeps a historical plan with a low reward/risk warning after reload',()=>{const plan={...DEFAULT_PLAN,entry:100,stop:98,target:103},sizing=sizePlan(plan);let saved='';const ticket={id:'test',createdAt:'2026-10-24T15:00:00Z',plan,quantity:sizing.quantity,sourceDate:'2026-10-23',note:'Past setup',entrySource:'Historical breakout: 23 Oct 2026, 14:55 PKT'};writeLab('lab@example.test',{watchlist:'HBL',tickets:[ticket]},{setItem:(_key,value)=>{saved=value;}});const restored=readLab('lab@example.test',{getItem:()=>saved});expect(sizing.errors).toEqual([]);expect(sizing.warnings.length).toBe(1);expect(restored.tickets).toEqual([ticket]);});
it('keeps test data under a distinct login-scoped key',()=>{expect(labKey(' A@EXAMPLE.COM ')).toBe(labKey('a@example.com'));expect(labKey('a@example.com')).not.toBe(labKey('b@example.com'));const setItem=vi.fn();writeLab('a@example.com',{watchlist:'HBL',tickets:[]},{setItem});expect(setItem.mock.calls[0][0]).toMatch(/^psx-trading-lab:v1:/);});
it('limits and validates scans before they create requests',()=>{expect(parseWatchlist('hbl, HBL OGDC')).toEqual(['HBL','OGDC']);expect(()=>parseWatchlist('HBL,<script>')).toThrow();expect(()=>parseWatchlist(Array.from({length:21},(_,i)=>'S'+i).join(','))).toThrow();});
it('recovers from corrupt local data without touching portfolio storage',()=>{const getItem=vi.fn(()=>'{invalid');expect(readLab('a@example.com',{getItem}).tickets).toEqual([]);expect(getItem).toHaveBeenCalledTimes(1);});
const ticket=(id:string)=>({id,createdAt:'2026-10-24T15:00:00Z',plan:{...DEFAULT_PLAN,entry:100,stop:98,target:105},quantity:10,sourceDate:'2026-10-23',note:id});
it('combines concurrent devices without truncating journals at the creation limit',()=>{
  const a={watchlist:'HBL',watchlistUpdatedAt:'2026-10-23T15:00:00Z',tickets:Array.from({length:75},(_,i)=>ticket('a'+i))};
  const b={watchlist:'OGDC',watchlistUpdatedAt:'2026-10-24T15:00:00Z',tickets:Array.from({length:75},(_,i)=>ticket('b'+i))};
  const merged=mergeLabs(a,b);expect(merged.tickets).toHaveLength(150);expect(merged.watchlist).toBe('OGDC');expect(mergeLabs(merged,a)).toEqual(merged);
  let stored='';writeLab('a@example.test',merged,{setItem:(_k,v)=>{stored=v;}});expect(readLab('a@example.test',{getItem:()=>stored}).tickets).toHaveLength(150);
});
it('refuses conflicting IDs and malformed plans instead of silently dropping them',()=>{
  const a={watchlist:'HBL',tickets:[ticket('one')]};
  expect(()=>mergeLabs(a,{...a,tickets:[{...a.tickets[0],note:'changed'}]})).toThrow('differ');
  expect(()=>parseLab({...a,tickets:[...a.tickets,{bad:true}]})).toThrow('could not be read');
});
