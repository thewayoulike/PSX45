import {afterEach,it,expect,vi} from 'vitest';
import {loadScanCandles} from './scannerData';
import {ScanFeedError} from './scanner';
const bar={time:1792715700000,open:100,high:101,low:99,close:100,volume:100};
afterEach(()=>vi.unstubAllGlobals());
it('requests a short intraday window, validates identity and caches read-only data',async()=>{
  const fetcher=vi.fn().mockImplementation(async()=>new Response(JSON.stringify({symbol:'ABC',bars:[bar],source:'pypsx'})));
  vi.stubGlobal('fetch',fetcher);const signal=new AbortController().signal;
  const result=await loadScanCandles('ABC','intraday',signal);await loadScanCandles('ABC','intraday',signal);
  expect(fetcher).toHaveBeenCalledTimes(3);expect(result.targetContext?.daily).toEqual([bar]);expect(result.targetContext?.band).toBeUndefined();expect(fetcher.mock.calls[0][0]).toContain('period=5d');expect(result.bars).toEqual([bar]);
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
