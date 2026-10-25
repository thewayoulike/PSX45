import {describe,it,expect,vi} from 'vitest';
import {normalizeUniverse,intradayScan,runMarketScan,remainingScanStocks,ScanFeedError,type MarketSymbol,type ScanRow} from './scanner';
import {DEFAULT_RULES} from './workflow';
import {parseBars,type Bar} from './engine';

const symbols=(n:number):MarketSymbol[]=>Array.from({length:n},(_,i)=>({symbol:`S${i}`,name:`Stock ${i}`,sector:'Test',volume:i}));
const daily=Array.from({length:30},(_,i)=>({time:Date.UTC(2026,8,i+1),open:100,high:102,low:99,close:i===29?102:100,volume:100}));
const at=(time:string)=>Date.parse('2026-10-23T'+time+':00+05:00');
const bar=(time:string,close=100):Bar=>({time:at(time),open:100,high:Math.max(101,close),low:99,close,volume:100});
const afternoon=[bar('14:35'),bar('14:40'),bar('14:45'),bar('14:50',102),bar('14:55',101)];

describe('market-wide scanning',()=>{
 it('resumes unseen stocks before retrying failures and never repeats successful stocks',()=>{
   const stocks=symbols(4),rows=[{...stocks[0],checkedAt:1,error:'offline'},{...stocks[1],checkedAt:1}];
   expect(remainingScanStocks(stocks,rows).map(s=>s.symbol)).toEqual(['S2','S3','S0']);
 });
 it('does not cap the market at 20 or drop zero/missing-volume listings',()=>{
   const stocks=normalizeUniverse([...symbols(600),{symbol:'s0',name:'Duplicate',sector:'',volume:0},{symbol:'ZERO',name:'No trades',sector:'',volume:null},{symbol:'<bad>',name:'Bad',sector:'',volume:0}]);
   expect(stocks).toHaveLength(601);expect(stocks.find(s=>s.symbol==='S0')?.name).toBe('Duplicate');expect(stocks.some(s=>s.symbol==='ZERO')).toBe(true);
 });
 it('checks every stock with at most three in flight, retaining thin histories as errors',async()=>{
   let inFlight=0,peak=0;const rows:ScanRow[]=[];
   const result=await runMarketScan({stocks:symbols(83),kind:'daily',rules:DEFAULT_RULES,signal:new AbortController().signal,concurrency:50,
     now:()=>at('15:00'),onRow:r=>rows.push(r),load:async symbol=>{
       inFlight++;peak=Math.max(peak,inFlight);await new Promise(r=>setTimeout(r,1));inFlight--;
       return {symbol,bars:symbol==='S7'?[]:daily,source:'test',retrievedAt:''};
     }});
   expect(peak).toBe(3);expect(result.done).toBe(83);expect(new Set(rows.map(r=>r.symbol)).size).toBe(83);
   expect(rows.find(r=>r.symbol==='S7')?.error).toContain('22 completed');expect(rows.filter(r=>r.daily)).toHaveLength(82);
 });
 it('keeps completed results and stops starting work when cancelled',async()=>{
   const controller=new AbortController(),rows:ScanRow[]=[],load=vi.fn(async symbol=>({symbol,bars:daily,source:'test',retrievedAt:''}));
   const result=await runMarketScan({stocks:symbols(70),kind:'daily',rules:DEFAULT_RULES,signal:controller.signal,load,onRow:r=>{rows.push(r);controller.abort();}});
   expect(result.cancelled).toBe(true);expect(rows).toHaveLength(1);expect(load.mock.calls.length).toBeLessThanOrEqual(3);
 });
 it('pauses on rate limiting rather than hammering the remaining universe',async()=>{
   const load=vi.fn(async()=>{throw new ScanFeedError('Busy',429);}),rows:ScanRow[]=[];
   const result=await runMarketScan({stocks:symbols(600),kind:'daily',rules:DEFAULT_RULES,signal:new AbortController().signal,load,onRow:r=>rows.push(r)});
   expect(result.pause).toContain('limiting requests');expect(load.mock.calls.length).toBeLessThanOrEqual(3);expect(rows.every(r=>r.error==='Busy')).toBe(true);
 });
 it('pauses on a sustained outage and rejects cross-stock history',async()=>{
   const failure=await runMarketScan({stocks:symbols(600),kind:'daily',rules:DEFAULT_RULES,signal:new AbortController().signal,load:async()=>{throw new ScanFeedError('Offline');},onRow:()=>{}});
   expect(failure.pause).toContain('repeatedly unavailable');expect(failure.done).toBeLessThanOrEqual(8);
   const rows:ScanRow[]=[];
   await runMarketScan({stocks:symbols(1),kind:'daily',rules:DEFAULT_RULES,signal:new AbortController().signal,load:async()=>({symbol:'WRONG',bars:daily,source:'test',retrievedAt:''}),onRow:r=>rows.push(r)});
   expect(rows[0].daily).toBeUndefined();expect(rows[0].error).toContain('different stock');
 });
});

describe('market opening-range observations',()=>{
 it('ignores forming candles, then confirms only a completed close',()=>{
   expect(intradayScan(afternoon,DEFAULT_RULES,at('14:54')).check?.trigger).toBeNull();
   const row=intradayScan(afternoon,DEFAULT_RULES,at('15:00'));
   expect(row.status).toBe('Breakout confirmed');expect(row.triggerAt).toBe(at('14:55'));expect(row.recent).toBe(true);
   expect(row.levels).toEqual({entry:102,stop:99,target:108});
 });
 it('does not call stale or old-session breakouts fresh',()=>{
   const stale=intradayScan(afternoon,DEFAULT_RULES,at('15:20'));
   expect(stale.status).toBe('Delayed data');expect(stale.recent).toBe(false);
   const closed=intradayScan(afternoon,DEFAULT_RULES,at('17:00'));
   expect(closed.status).toBe('Session ended');expect(closed.fresh).toBe(false);expect(closed.triggerAt).toBe(at('14:55'));
   expect(intradayScan(afternoon,DEFAULT_RULES,at('15:00')+86400000).recent).toBe(false);
 });
 it('does not substitute Friday morning for a missing afternoon',()=>{
   const morning=[bar('09:20'),bar('09:25'),bar('09:30'),bar('09:35',102)];
   const row=intradayScan(morning,DEFAULT_RULES,at('15:00'));
   expect(row.status).toBe('No session data');expect(row.check).toBeNull();expect(row.triggerAt).toBeNull();
   expect(row.levels).toBeNull();
 });
 it('keeps gaps and unreported volume from confirming a call',()=>{
   const gap=intradayScan([afternoon[0],afternoon[1],afternoon[2],bar('14:55',102)],DEFAULT_RULES,at('15:00'));
   expect(gap.check?.state).toBe('incomplete');
   const noVolume=intradayScan(parseBars(afternoon.map(b=>({...b,volumeAvailable:false}))),{...DEFAULT_RULES,volumeX:1.5},at('15:00'));
   expect(noVolume.check?.state).toBe('incomplete');expect(noVolume.check?.trigger).toBeNull();
 });
 it('ignores a single stock custom price when scanning the whole market',()=>{
   const row=intradayScan(afternoon,{...DEFAULT_RULES,entryMode:'level',level:10000},at('15:00'));
   expect(row.check?.level).toBe(101);expect(row.check?.trigger?.close).toBe(102);
 });
});
