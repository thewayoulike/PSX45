import {describe,it,expect} from 'vitest';
import {DEFAULT_PLAN,parseBars,standardSessions,completedDaily,dailyScan,intradaySegments,openingRange,sizePlan,walkTrade,replayOpeningRange,simulatePlan,type Bar} from './engine';
const at=(day:string,time:string)=>Date.parse(`${day}T${time}:00+05:00`);
const bar=(time:number,close=100):Bar=>({time,open:close,high:close+1,low:close-1,close,volume:100});
function session(day:string,index=0){const w=standardSessions(day)[index];return Array.from({length:(w.end-Math.ceil(w.start/300000)*300000)/300000},(_,i)=>bar(Math.ceil(w.start/300000)*300000+i*300000));}
const plan={...DEFAULT_PLAN,entry:100,stop:98,target:106,feePct:.2,slipPct:.1};
describe('PSX session and candle boundaries',()=>{
 it('uses Pakistan dates and the two Friday continuous sessions',()=>{const f=standardSessions('2026-10-23');expect(f).toHaveLength(2);expect(f[0].start).toBe(at('2026-10-23','09:17'));expect(f[1].start).toBe(at('2026-10-23','14:32'));expect(standardSessions('2026-10-24')).toHaveLength(0);});
 it('does not include an unfinished daily candle',()=>{const rows=[bar(at('2026-10-21','09:00')),bar(at('2026-10-22','09:00'))];expect(completedDaily(rows,at('2026-10-22','14:00'))).toHaveLength(1);expect(completedDaily(rows,at('2026-10-22','15:30'))).toHaveLength(2);});
 it('rejects impossible OHLC and preserves unavailable volume',()=>{expect(parseBars([{...bar(100),high:99}, {...bar(200),volume:null},bar(300),bar(300,105)])).toEqual([{...bar(200),volume:null},bar(300,105)]);});
 it('excludes auctions, Friday break, post-close and forming bars',()=>{const rows=['09:15','09:20','12:00','14:30','14:35','16:30'].map(t=>bar(at('2026-10-23',t)));const groups=intradaySegments(rows,at('2026-10-23','14:37'));expect(groups).toHaveLength(1);expect(groups[0].bars.map(b=>b.time)).toEqual([at('2026-10-23','09:20')]);});
 it('detects incomplete sessions instead of filling missing bars',()=>{const rows=session('2026-10-22');rows.splice(5,1);expect(intradaySegments(rows,at('2026-10-23','18:00'))[0].complete).toBe(false);expect(intradaySegments(session('2026-10-22'),at('2026-10-23','18:00'))[0].complete).toBe(true);});
 it('does not use a wick or equality as a closing breakout',()=>{const rows=session('2026-10-22');rows[3]={...rows[3],high:105};rows[4]={...rows[4],close:101,high:101};rows[5]=bar(rows[5].time,102);const g=intradaySegments(rows,at('2026-10-23','18:00'))[0];expect(openingRange(g)?.index).toBe(5);});
 it('does not infer a signal after missing opening or trigger candles',()=>{const rows=session('2026-10-22');rows[8]=bar(rows[8].time,110);rows.splice(4,1);const g=intradaySegments(rows,at('2026-10-23','18:00'))[0];expect(openingRange(g)?.trigger).toBeNull();g.bars.shift();expect(openingRange(g)).toBeNull();});
});
describe('PSX research rules and cost-aware sizing',()=>{
 it('compares a breakout to prior closes, not to itself',()=>{const rows=Array.from({length:25},(_,i)=>bar(Date.UTC(2026,8,i+1,4),100+i));expect(dailyScan(rows,at('2026-10-24','12:00')).setups).toContain('20-day closing breakout');});
 it('does not invent relative volume when source volume is absent',()=>{const rows=Array.from({length:25},(_,i)=>({...bar(Date.UTC(2026,8,i+1,4)),volume:null}));expect(dailyScan(rows).relativeVolume).toBeNull();});
 it('sizes to whole lots and keeps estimated risk and cost within caps',()=>{const p={...plan,lot:10},s=sizePlan(p);expect(s.errors).toHaveLength(0);expect(s.quantity%10).toBe(0);expect(s.loss).toBeLessThanOrEqual(1000);expect(s.cost).toBeLessThanOrEqual(25000);expect(s.loss).toBeGreaterThan(s.quantity*(p.entry-p.stop));});
 it.each([{stop:101},{entry:NaN},{capital:-1},{feePct:-1},{lot:1.5},{capPct:101}])('rejects invalid plan %j',change=>{expect(sizePlan({...plan,...change}).errors.length).toBeGreaterThan(0);});
 it('warns about low reward/risk but allows a valid research plan',()=>{const result=sizePlan({...plan,target:103,minRR:1.5});expect(result.errors).toEqual([]);expect(result.warnings).toContain('Estimated reward/risk is below 1.50 after costs.');});
 it('takes the stop first for an ambiguous candle and models gap loss',()=>{expect(walkTrade([{...bar(1),low:97,high:108}],100,98,106).outcome).toBe('stop');expect(walkTrade([{...bar(1,94),high:95,low:93}],100,98,106).exit).toBe(94);});
});
describe('replay integrity',()=>{
 it('starts checking exits after the entry close, not earlier in its candle',()=>{const rows=session('2026-10-22');rows[3]={...bar(rows[3].time,102),low:97,high:103};for(let i=4;i<rows.length;i++)rows[i]=bar(rows[i].time,102);const result=replayOpeningRange(rows,2,0,0,at('2026-10-24','12:00'));expect(result.trades).toHaveLength(1);expect(result.trades[0].outcome).toBe('close');});
 it('does not bridge the Friday break and drops incomplete sessions',()=>{const am=session('2026-10-23',0),pm=session('2026-10-23',1);am[3]=bar(am[3].time,102);pm.splice(5,1);const r=replayOpeningRange([...am,...pm],2,.2,.1,at('2026-10-24','12:00'));expect(r.sessions).toBe(1);expect(r.excluded).toBe(1);expect(r.trades[0].time).toBeLessThan(at('2026-10-23','12:00'));});
 it('requires enough comparable history and rejects invalid costs',()=>{expect(()=>simulatePlan(session('2026-10-23',1),plan,at('2026-10-24','12:00'))).toThrow('Need 3');expect(()=>replayOpeningRange([],2,NaN,0)).toThrow();});
 it('uses only earlier matching sessions and produces repeatable totals',()=>{const rows=['2026-10-02','2026-10-09','2026-10-16','2026-10-23'].flatMap(d=>session(d,1));const now=at('2026-10-24','12:00'),a=simulatePlan(rows,plan,now,100,19),b=simulatePlan(rows,plan,now,100,19);expect(a).toEqual(b);expect(a.sessions).toBe(3);expect(a.before).toBe('2026-10-23');expect(Object.values(a.counts).reduce((x,y)=>x+y,0)).toBe(100);});
});
