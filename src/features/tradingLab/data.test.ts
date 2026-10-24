import {afterEach,describe,expect,it,vi} from 'vitest';
import {loadCandles,loadResearch,safeUrl} from './data';
const candle={time:1792715700000,open:100,high:101,low:99,close:100,volume:100};
afterEach(()=>vi.unstubAllGlobals());
describe('isolated Trading Lab feeds',()=>{
 it('uses only the read-only intraday route and keeps the source identity',async()=>{
  const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({symbol:'HBL',bars:[candle],source:'pypsx:intraday'})));
  vi.stubGlobal('fetch',fetcher);
  const result=await loadCandles('HBL',true,true);
  expect(fetcher.mock.calls[0][0]).toBe('/api/pypsx?mode=intraday&symbol=HBL&interval=5m&period=1mo');
  expect(fetcher.mock.calls[0][1].method).toBeUndefined();
  expect(result.source).toBe('pypsx:intraday');expect(result.bars).toEqual([candle]);
 });
 it('rejects a different symbol instead of labelling it as the requested stock',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({symbol:'OGDC',bars:[candle]}))));
  await expect(loadCandles('HBL',false,true)).rejects.toThrow('different symbol');
 });
 it('rejects unusable candles and invalid symbols',async()=>{
  const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({bars:[{...candle,high:90}]})));
  vi.stubGlobal('fetch',fetcher);
  await expect(loadCandles('HBL',false,true)).rejects.toThrow('No usable');
  await expect(loadCandles('../account',true)).rejects.toThrow('valid PSX symbol');
  expect(fetcher).toHaveBeenCalledTimes(1);
 });
 it('keeps successful research when another source fails',async()=>{
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>{
   if(url.includes('feed=news'))return new Response('unavailable',{status:503});
   if(url.includes('feed=insiders'))return new Response(JSON.stringify({data:{records:[]}}));
   return new Response(JSON.stringify({symbol:'HBL',businessDescription:'Bank'}));
  }));
  const result=await loadResearch('HBL');
  expect(result.errors).toEqual(['News feed unavailable.']);
  expect(result.company?.businessDescription).toBe('Bank');expect(result.insiders?.records).toEqual([]);
 });
 it('allows HTTPS source links only',()=>{
  expect(safeUrl('https://dps.psx.com.pk/company/HBL')).toBe('https://dps.psx.com.pk/company/HBL');
  expect(safeUrl('javascript:alert(1)')).toBeUndefined();expect(safeUrl('http://example.com')).toBeUndefined();
 });
});
