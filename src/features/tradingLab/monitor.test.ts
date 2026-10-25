import {describe,it,expect,vi} from 'vitest';
import {createLabMonitor} from './monitor';
import {DEFAULT_PLAN,type Plan} from './engine';
import {DEFAULT_RULES} from './workflow';
import type {CandleSet} from './data';
const at=(time:string)=>Date.parse(`2026-10-22T${time}:00+05:00`);
const plan=(symbol:string):Plan=>({...DEFAULT_PLAN,symbol,entry:102,stop:99,target:110});
const candles=(symbol:string):CandleSet=>({symbol,source:'test',retrievedAt:'',bars:[0,1,2,3].map(i=>({time:at('09:35')+i*300000,open:100,high:i===3?103:101,low:99,close:i===3?102:100,volume:100}))});
function deferred<T>(){let resolve!:(value:T)=>void,reject!:(reason:Error)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
const flush=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};

describe('independent Trading Lab monitors',()=>{
 it('adds PPL without replacing CNERGY or taking references to the edited plan',async()=>{
  const load=vi.fn(async(symbol:string)=>candles(symbol)),monitor=createLabMonitor({load,visible:()=>true,now:()=>at('09:55')});monitor.resume();
  const original=plan('CNERGY'),rules={...DEFAULT_RULES};monitor.start(original,rules,'CNERGY saved levels');await flush();
  const first=monitor.getSnapshot()[0];original.target=400;rules.targetR=8;
  monitor.start({...plan('PPL'),entry:210.15,stop:208.90,target:212.65},DEFAULT_RULES);await flush();
  expect(monitor.getSnapshot().map(item=>item.symbol)).toEqual(['CNERGY','PPL']);
  expect(monitor.getSnapshot()[0]).toBe(first);expect(first.plan.target).toBe(110);expect(first.rules.targetR).toBe(2);
  monitor.start(plan('CNERGY'),DEFAULT_RULES);expect(monitor.getSnapshot()).toHaveLength(2);expect(load).toHaveBeenCalledTimes(2);
 });
 it('keeps independent alerts, deduplicates polls and stops one item only',async()=>{
  const monitor=createLabMonitor({load:async symbol=>candles(symbol),visible:()=>true,now:()=>at('09:55')});monitor.resume();
  monitor.start(plan('CNERGY'),DEFAULT_RULES);monitor.start(plan('PPL'),DEFAULT_RULES);await flush();
  const before=monitor.getSnapshot().map(item=>item.alerts);
  expect(before.every(alerts=>alerts.length>0)).toBe(true);
  expect(before[0].every(a=>a.text.startsWith('CNERGY:'))).toBe(true);expect(before[1].every(a=>a.text.startsWith('PPL:'))).toBe(true);
  monitor.refresh();await flush();expect(monitor.getSnapshot().map(item=>item.alerts)).toEqual(before);
  monitor.stop('PPL');expect(monitor.getSnapshot().map(item=>item.symbol)).toEqual(['CNERGY']);expect(monitor.getSnapshot()[0].alerts).toEqual(before[0]);
 });
 it('does not let a removed or restarted request overwrite a new monitor',async()=>{
  const old=deferred<CandleSet>(),latest=deferred<CandleSet>(),onData=vi.fn();
  const load=vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);
  const monitor=createLabMonitor({load,visible:()=>true,now:()=>at('09:55'),onData});monitor.resume();monitor.start(plan('CNERGY'),DEFAULT_RULES);
  monitor.stop('CNERGY');monitor.start({...plan('CNERGY'),target:120},DEFAULT_RULES);
  old.resolve(candles('CNERGY'));await flush();expect(onData).not.toHaveBeenCalled();expect(monitor.getSnapshot()[0].refreshedAt).toBeNull();
  latest.resolve(candles('CNERGY'));await flush();expect(monitor.getSnapshot()[0].plan.target).toBe(120);expect(onData).toHaveBeenCalledTimes(1);
 });
 it('isolates feed failures and refuses a different symbol',async()=>{
  const load=vi.fn(async(symbol:string)=>{if(symbol==='CNERGY')throw Error('offline');return candles('HBL');});
  const monitor=createLabMonitor({load,visible:()=>true,now:()=>at('09:55')});monitor.resume();monitor.start(plan('CNERGY'),DEFAULT_RULES);monitor.start(plan('PPL'),DEFAULT_RULES);await flush();
  expect(monitor.getSnapshot().every(item=>item.status.startsWith('Refresh failed')&&item.refreshedAt===null&&item.alerts.length===0)).toBe(true);
  load.mockImplementation(async symbol=>candles(symbol));monitor.refresh();await flush();
  expect(monitor.getSnapshot().every(item=>item.refreshedAt===at('09:55'))).toBe(true);
 });
 it('bounds concurrent polling and clears queued work on stop all',async()=>{
  const work=Array.from({length:5},()=>deferred<CandleSet>());let count=0;
  const load=vi.fn(()=>work[count++].promise),monitor=createLabMonitor({load,visible:()=>true});monitor.resume();
  ['CNERGY','PPL','HBL','OGDC','PSO'].forEach(symbol=>monitor.start(plan(symbol),DEFAULT_RULES));
  expect(load).toHaveBeenCalledTimes(3);monitor.refresh();expect(load).toHaveBeenCalledTimes(3);
  work[0].resolve(candles('CNERGY'));await flush();expect(load).toHaveBeenCalledTimes(4);
  monitor.stopAll();work[1].resolve(candles('PPL'));work[2].resolve(candles('HBL'));work[3].resolve(candles('OGDC'));await flush();
  expect(load).toHaveBeenCalledTimes(4);expect(monitor.getSnapshot()).toEqual([]);
 });
 it('pauses hidden-page checks and resumes without dropping stocks',async()=>{
  let visible=false;const load=vi.fn(async symbol=>candles(symbol));
  const monitor=createLabMonitor({load,visible:()=>visible,now:()=>at('09:55')});monitor.resume();monitor.start(plan('CNERGY'),DEFAULT_RULES);monitor.start(plan('PPL'),DEFAULT_RULES);
  monitor.refresh();expect(load).not.toHaveBeenCalled();visible=true;monitor.refresh();await flush();expect(load).toHaveBeenCalledTimes(2);
  monitor.pause();monitor.refresh();expect(load).toHaveBeenCalledTimes(2);monitor.resume();await flush();expect(load).toHaveBeenCalledTimes(4);expect(monitor.getSnapshot()).toHaveLength(2);
 });
 it('ignores late responses across a pause and resumes their refresh',async()=>{
  const old=deferred<CandleSet>(),load=vi.fn().mockReturnValueOnce(old.promise).mockResolvedValue(candles('CNERGY')),onData=vi.fn();
  const monitor=createLabMonitor({load,visible:()=>true,now:()=>at('09:55'),onData});monitor.resume();monitor.start(plan('CNERGY'),DEFAULT_RULES);monitor.pause();monitor.resume();
  old.resolve(candles('CNERGY'));await flush();expect(load).toHaveBeenCalledTimes(2);expect(onData).toHaveBeenCalledTimes(1);
 });
 it('derives missing levels for the newly added stock without changing an existing plan',async()=>{
  const monitor=createLabMonitor({load:async symbol=>candles(symbol),visible:()=>true,now:()=>at('09:55')});monitor.resume();
  monitor.start({...plan('CNERGY'),target:120},DEFAULT_RULES);monitor.start({...DEFAULT_PLAN,symbol:'PPL'},DEFAULT_RULES);await flush();
  expect(monitor.getSnapshot()[0].plan.target).toBe(120);
  expect(monitor.getSnapshot()[1].plan).toMatchObject({entry:102,stop:99,target:108});
 });
 it('updates only the requested monitored plan and ignores its obsolete response',async()=>{
  const old=deferred<CandleSet>(),load=vi.fn().mockReturnValueOnce(old.promise).mockImplementation(async symbol=>candles(symbol));
  const monitor=createLabMonitor({load,visible:()=>true,now:()=>at('09:55')});monitor.resume();monitor.start(plan('CNERGY'),DEFAULT_RULES);monitor.start(plan('PPL'),DEFAULT_RULES);await flush();
  const ppl=monitor.getSnapshot()[1];monitor.update({...plan('CNERGY'),target:125},DEFAULT_RULES);await flush();old.resolve(candles('CNERGY'));await flush();
  expect(monitor.getSnapshot()[0].plan.target).toBe(125);expect(monitor.getSnapshot()[1]).toBe(ppl);
 });
});
