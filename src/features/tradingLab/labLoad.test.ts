import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {takeLabSlot,setLabRequestInterval,LAB_REQUEST_INTERVAL_MS} from './labBudget';
import {runMarketScan,ScanFeedError,type MarketSymbol,type ScanRow} from './scanner';
import {loadScanBatch} from './scannerData';
import {DEFAULT_RULES} from './workflow';

const START=Date.UTC(2026,9,5,12);
const stocks=(n:number):MarketSymbol[]=>Array.from({length:n},(_,i)=>({symbol:'S'+i,name:'S'+i,sector:'',volume:1}));
const dayBars=Array.from({length:30},(_,i)=>({time:Date.UTC(2026,8,1+i,10),open:100,high:104,low:99,close:100+i/10,volume:1000}));

describe('shared request budget',()=>{
  afterEach(()=>{vi.useRealTimers();setLabRequestInterval(LAB_REQUEST_INTERVAL_MS);});
  it('spaces requests by time even when responses are instant (cached)',async()=>{
    vi.useFakeTimers();setLabRequestInterval(LAB_REQUEST_INTERVAL_MS);
    const started:number[]=[];
    const calls=Array.from({length:4},()=>takeLabSlot().then(()=>started.push(Date.now())));
    await vi.advanceTimersByTimeAsync(LAB_REQUEST_INTERVAL_MS*4);await Promise.all(calls);
    for(let i=1;i<started.length;i++)expect(started[i]-started[i-1]).toBeGreaterThanOrEqual(LAB_REQUEST_INTERVAL_MS);
  });
});

describe('batched scans',()=>{
  beforeEach(()=>setLabRequestInterval(0));
  afterEach(()=>{vi.unstubAllGlobals();setLabRequestInterval(LAB_REQUEST_INTERVAL_MS);});
  it('scans the market in groups, one request per group',async()=>{
    const loadBatch=vi.fn(async(symbols:string[])=>new Map(symbols.map(s=>[s,{symbol:s,bars:dayBars,source:'t',retrievedAt:''}])));
    const rows:ScanRow[]=[];
    const result=await runMarketScan({stocks:stocks(30),kind:'daily',rules:DEFAULT_RULES,signal:new AbortController().signal,load:vi.fn(),loadBatch,batchSize:12,onRow:r=>rows.push(r),now:()=>Date.UTC(2026,9,5,12)});
    expect(loadBatch).toHaveBeenCalledTimes(3);expect(result.done).toBe(30);expect(rows.filter(r=>r.daily)).toHaveLength(30);
  });
  it('waits out a busy reply and continues by itself instead of stopping the scan',async()=>{
    let calls=0;const waits:number[]=[];
    const loadBatch=vi.fn(async(symbols:string[])=>{if(++calls===1)throw new ScanFeedError('Busy',503,START+20_000);return new Map(symbols.map(s=>[s,{symbol:s,bars:dayBars,source:'t',retrievedAt:''}]));});
    let clock=START;
    const result=await runMarketScan({stocks:stocks(10),kind:'daily',rules:DEFAULT_RULES,signal:new AbortController().signal,load:vi.fn(),loadBatch,batchSize:5,
      onRow:()=>{},now:()=>clock,wait:async ms=>{waits.push(ms);clock+=ms;}});
    expect(waits).toEqual([20_000]);expect(result.pause).toBe('');expect(result.done).toBe(10);expect(result.failed).toBe(0);
  });
  it('pauses with results kept after repeated busy replies',async()=>{
    const loadBatch=vi.fn(async()=>{throw new ScanFeedError('Busy',429);});
    const rows:ScanRow[]=[];
    const result=await runMarketScan({stocks:stocks(20),kind:'daily',rules:DEFAULT_RULES,signal:new AbortController().signal,load:vi.fn(),loadBatch,batchSize:5,onRow:r=>rows.push(r),wait:async()=>{}});
    expect(loadBatch).toHaveBeenCalledTimes(4);expect(result.pause).toContain('busy');expect(rows).toHaveLength(5);
  });
  it('reads one batch response and keeps per-stock failures with that stock',async()=>{
    const fetcher=vi.fn(async(url:string)=>new Response(JSON.stringify({batch:{AAA:{symbol:'AAA',bars:dayBars},BBB:{error:'OHLC fetch failed'}}})));
    vi.stubGlobal('fetch',fetcher);
    const result=await loadScanBatch(['AAA','BBB'],'daily',new AbortController().signal);
    expect(fetcher).toHaveBeenCalledTimes(1);expect(String(fetcher.mock.calls[0][0])).toContain('ohlcBatch=AAA%2CBBB');
    expect((result.get('AAA') as {bars:unknown[]}).bars).toHaveLength(30);expect(result.get('BBB')).toBeInstanceOf(Error);
  });
});
