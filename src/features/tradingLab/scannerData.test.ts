import {afterEach,it,expect,vi} from 'vitest';
import {loadScanCandles} from './scannerData';
import {ScanFeedError} from './scanner';
import {DEFAULT_RULES} from './workflow';
const bar={time:1792715700000,open:100,high:101,low:99,close:100,volume:100};
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
it('requests a short intraday window, validates identity and caches read-only data',async()=>{
  const fetcher=vi.fn().mockImplementation(async()=>new Response(JSON.stringify({symbol:'ABC',bars:[bar],source:'pypsx'})));
  vi.stubGlobal('fetch',fetcher);const signal=new AbortController().signal;
  const result=await loadScanCandles('ABC','intraday',signal);await loadScanCandles('ABC','intraday',signal);
  expect(fetcher).toHaveBeenCalledTimes(1);expect(result.targetContext).toBeUndefined();expect(fetcher.mock.calls[0][0]).toContain('period=5d');expect(result.bars).toEqual([bar]);
});
it('loads target checks only for a confirmed entry, including when rules change against cached candles',async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-28T10:10:00+05:00'));
  const bars=[0,1,2,3,4,5].map(i=>({...bar,time:Date.parse('2026-10-28T09:35:00+05:00')+i*300000,high:i===5?103:101,close:i===5?102:100}));
  const fetcher=vi.fn().mockImplementation(async()=>new Response(JSON.stringify({symbol:'CONTEXT',bars,source:'test'})));
  vi.stubGlobal('fetch',fetcher);const signal=new AbortController().signal;
  const first=await loadScanCandles('CONTEXT','intraday',signal,{...DEFAULT_RULES,entryMinutes:30});
  expect(first.targetContext).toBeUndefined();expect(fetcher).toHaveBeenCalledTimes(1);
  const second=await loadScanCandles('CONTEXT','intraday',signal,DEFAULT_RULES);
  expect(second.targetContext?.daily).toEqual(bars);expect(fetcher).toHaveBeenCalledTimes(3);
});
it('honours the server retry time on a busy response',async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-28T10:10:00+05:00'));
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('busy',{status:503,headers:{'Retry-After':'60'}})));
  await expect(loadScanCandles('BUSY','daily',new AbortController().signal)).rejects.toMatchObject({status:503,retryAt:Date.now()+60000});
});
it('allows the server worker its full deadline instead of cancelling at 25 seconds',async()=>{
  vi.useFakeTimers();let signal:AbortSignal|undefined;
  vi.stubGlobal('fetch',vi.fn((_url,options)=>{signal=options.signal;return new Promise(resolve=>setTimeout(()=>resolve(new Response(JSON.stringify({symbol:'SLOW',bars:[bar]}))),35000));}));
  const pending=loadScanCandles('SLOW','daily',new AbortController().signal);
  await vi.advanceTimersByTimeAsync(26000);expect(signal!.aborted).toBe(false);
  await vi.advanceTimersByTimeAsync(9000);expect((await pending).bars).toHaveLength(1);
});
it('passes cancellation through to the network',async()=>{
  vi.stubGlobal('fetch',vi.fn((_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError'))))));
  const controller=new AbortController(),pending=loadScanCandles('CANCEL','daily',controller.signal);controller.abort();
  await expect(pending).rejects.toMatchObject({name:'AbortError'});
});
it('retains rate-limit status and never caches failed or mismatched responses',async()=>{
  const fetcher=vi.fn().mockResolvedValueOnce(new Response('busy',{status:429})).mockResolvedValueOnce(new Response(JSON.stringify({symbol:'OTHER',bars:[bar]})));
  vi.stubGlobal('fetch',fetcher);const signal=new AbortController().signal;
  await expect(loadScanCandles('FAILED','daily',signal)).rejects.toMatchObject({status:429});
  await expect(loadScanCandles('FAILED','daily',signal)).rejects.toThrow('different stock');expect(fetcher).toHaveBeenCalledTimes(2);
});
it('treats a successful HTTP error body as a feed failure, not a zero price',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({error:'provider offline'}))));
  await expect(loadScanCandles('ERR','daily',new AbortController().signal)).rejects.toBeInstanceOf(ScanFeedError);
});
