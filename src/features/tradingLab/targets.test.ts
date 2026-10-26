import {describe,it,expect,vi,afterEach} from 'vitest';
import {assessTarget,parsePriceBand,type TargetContext} from './targets';
import {DEFAULT_PLAN,intradaySegments,sizePlan,type Bar} from './engine';
import {DEFAULT_RULES,exitLevels,replayRules} from './workflow';
import {intradayScan,runMarketScan,type ScanRow} from './scanner';
import {createLabMonitor} from './monitor';
import {loadTargetContext} from './targetData';

const at=(day:string,time='09:00')=>Date.parse(`${day}T${time}:00+05:00`);
const candle=(time:number,close:number,low=close-1,high=close+1):Bar=>({time,open:close,close,low,high,volume:1000});
const history=(high=120,low=80,close=100)=>Array.from({length:20},(_,i)=>candle(at(`2026-10-${String(i+1).padStart(2,'0')}`),close,low,high));
const bars=[candle(at('2026-10-22','09:35'),100,99,101),candle(at('2026-10-22','09:40'),100,99,101),candle(at('2026-10-22','09:45'),100,99,101),candle(at('2026-10-22','09:50'),102,101,103)];
const now=at('2026-10-22','10:00'),segment=intradaySegments(bars,now)[0];
const context:TargetContext={daily:history(),band:{day:'2026-10-22',lower:90,upper:110,reference:100,source:'Test exchange band'}};
const html=`<div class="quote__date">^ As of Thu, Oct 22, 2026 3:47 PM</div><div class="tabs__panel" data-name="REG"><div class="stats_label">CIRCUIT BREAKER</div><div class="stats_value">90 — 110<div class="numRange" data-low="90" data-high="110"></div></div><div class="stats_label">LDCP</div><div class="stats_value">100</div><div class="tabs__panel" data-name="FUT"><div class="stats_label">CIRCUIT BREAKER</div><div class="stats_value">80 — 120<div class="numRange" data-low="80" data-high="120"></div></div>`;

describe('targets constrained by market context',()=>{
 it('keeps the R benchmark when there is room and caps it at the exchange band otherwise',()=>{
   expect(assessTarget(102,108,segment,3,context)).toMatchObject({target:108,reason:'R benchmark',complete:true,estimatedBand:false});
   expect(assessTarget(106,114,segment,3,context)).toMatchObject({target:110,reason:'PSX upper price limit'});
 });
 it('uses nearby resistance even when only about 2% upside remains and recalculates net reward',()=>{
   const daily=history();daily[daily.length-1]={...daily.at(-1)!,high:104.05};
   const exits=exitLevels(102,segment,3,DEFAULT_RULES,0,{...context,daily});
   expect(exits.target).toBe(104.04);expect(exits.targetReview.reason).toContain('resistance');
   const capped=sizePlan({...DEFAULT_PLAN,entry:102,stop:exits.stop,target:exits.target!});
   expect(capped.rr).toBeLessThan(1);expect(capped.warnings.join(' ')).toContain('below 1.50');
   expect(capped.reward).toBeLessThan(sizePlan({...DEFAULT_PLAN,entry:102,stop:99,target:108}).reward);
 });
 it('subtracts the move already made from the typical range and refuses a target at/below entry',()=>{
   // Median daily range 4%, low observed 99: typical ceiling is 103, not entry + 4%.
   expect(assessTarget(102,108,segment,3,{...context,daily:history(102,98)})).toMatchObject({target:103,typicalCeiling:103,reason:'Typical daily range remaining'});
   expect(assessTarget(104,112,segment,3,{...context,daily:history(102,98)}).target).toBeNull();
 });
 it('never uses the current daily candle, later intraday lows or unconfirmed swing highs',()=>{
   const original=assessTarget(102,108,segment,3,context);
   const future=candle(at('2026-10-22','11:00'),100,40,200);
   const extended={...segment,bars:[...bars,future]};
   expect(assessTarget(102,108,extended,3,{...context,daily:[...context.daily!,future],intraday:extended.bars})).toEqual(original);
 });
 it('uses a confirmed earlier swing high rather than an unconfirmed last high',()=>{
   const daily=history();daily[10]={...daily[10],high:105};
   daily[8]={...daily[8],high:103};daily[9]={...daily[9],high:104};daily[11]={...daily[11],high:104};daily[12]={...daily[12],high:103};
   expect(assessTarget(102,108,segment,3,{...context,daily}).target).toBe(104.99);
 });
 it('uses Rs. 1 for low-priced stocks and never bases the band on entry',()=>{
   const r=assessTarget(5.5,7,segment,3,{daily:history(6,4,5)});
   expect(r.band).toMatchObject({reference:5,upper:6,lower:4});expect(r.estimatedBand).toBe(true);expect(r.target).toBeLessThanOrEqual(6);
 });
 it('ignores another date’s quote, labels estimates and leaves unavailable checks incomplete',()=>{
   const stale=assessTarget(102,108,segment,3,{...context,band:{...context.band!,day:'2026-10-23',upper:500}});
   expect(stale.band?.upper).toBe(110);expect(stale.estimatedBand).toBe(true);
   const missing=assessTarget(102,108,segment,3);expect(missing.complete).toBe(false);expect(missing.warnings.length).toBeGreaterThan(0);
   expect(assessTarget(102,108,segment,3,{daily:history(),standardBandAllowed:false}).band).toBeNull();
 });
 it('includes Friday morning movement in the afternoon day-range calculation',()=>{
   const friday=bars.map((b,i)=>({...b,time:at('2026-10-23','14:35')+i*300000}));
   const s=intradaySegments(friday,at('2026-10-23','15:00'))[0];
   const r=assessTarget(102,108,s,3,{daily:history(102,98),intraday:[candle(at('2026-10-23','09:20'),98,97,99),...friday]});
   expect(r.typicalCeiling).toBe(101);expect(r.target).toBeNull();
 });
 it('rejects an out-of-band entry and warns when a stop cannot fill inside the band',()=>{
   expect(assessTarget(111,115,segment,3,context).target).toBeNull();
   expect(exitLevels(102,segment,3,{...DEFAULT_RULES,stopMode:'manual'},80,context).targetReview.warnings.join(' ')).toContain('Stop is below');
 });
});

describe('shared scanner, monitor and replay target calculation',()=>{
 it('uses the same adjusted target across automatic paths and keeps manual monitored plans unchanged',async()=>{
   const daily=history();daily[daily.length-1]={...daily.at(-1)!,high:104.05};
   const targetContext={...context,daily},data={symbol:'PPL',bars,source:'fixture',retrievedAt:'',targetContext};
   const scan=intradayScan(bars,DEFAULT_RULES,now,targetContext);expect(scan.levels?.target).toBe(104.04);
   const rows:ScanRow[]=[];
   await runMarketScan({stocks:[{symbol:'PPL',name:'PPL',sector:'Energy',volume:100}],kind:'intraday',rules:DEFAULT_RULES,signal:new AbortController().signal,load:async()=>data,onRow:r=>rows.push(r),now:()=>now});
   expect(rows[0].entry?.levels).toEqual(scan.levels);
   const monitor=createLabMonitor({load:async()=>data,visible:()=>true,now:()=>now});monitor.resume();monitor.start({...DEFAULT_PLAN,symbol:'PPL'},DEFAULT_RULES);
   await new Promise(resolve=>setTimeout(resolve,0));expect(monitor.getSnapshot()[0].plan.target).toBe(104.04);expect(monitor.getSnapshot()[0].source).toContain('resistance');monitor.pause();
   const complete=Array.from({length:71},(_,i)=>i<4?bars[i]:candle(bars[0].time+i*300000,102,101,103));
   const replay=replayRules(complete,DEFAULT_PLAN,DEFAULT_RULES,at('2026-10-22','17:00'),targetContext);
   expect(replay.trades[0].target).toBe(104.04);
 });
 it('does not issue impossible levels when normal movement has already been used up',()=>{
   const scan=intradayScan(bars,DEFAULT_RULES,now,{...context,daily:history(101,99)});
   expect(scan.check?.trigger).not.toBeNull();expect(scan.levels).toBeNull();expect(scan.targetReview?.reason).toContain('No remaining upside');
 });
 it('skips replay entries whose constrained target loses money, but retains profitable research entries',()=>{
   const daily=history();daily[daily.length-1]={...daily.at(-1)!,high:102.3};
   const targetContext={...context,daily};
   const complete=Array.from({length:71},(_,i)=>i<4?bars[i]:candle(bars[0].time+i*300000,102,101,103));
   const replay=replayRules(complete,DEFAULT_PLAN,DEFAULT_RULES,at('2026-10-22','17:00'),targetContext);
   expect(replay.trades).toEqual([]);expect(replay.skipped).toBe(1);
   const noCosts=replayRules(complete,{...DEFAULT_PLAN,feePct:0,slipPct:0},DEFAULT_RULES,at('2026-10-22','17:00'),targetContext);
   expect(noCosts.trades).toHaveLength(1);expect(noCosts.trades[0].target).toBe(102.29);
 });
});

describe('target context feeds',()=>{
 afterEach(()=>vi.unstubAllGlobals());
 it('extracts only the dated regular-market band and fails closed on missing date/LDCP',()=>{
   expect(parsePriceBand(html)).toMatchObject({day:'2026-10-22',lower:90,upper:110,reference:100});
   expect(parsePriceBand(html.replace('quote__date','unknown'))).toBeUndefined();
   expect(parsePriceBand(html.replace('>LDCP<','>OTHER<'))).toBeUndefined();
 });
 it('attaches available history and bands and keeps one failed context source visible as missing',async()=>{
   vi.stubGlobal('fetch',vi.fn(async(url:string)=>new Response(url.includes('ohlc')?JSON.stringify({symbol:'TEST',bars:history()}):'<title>TEST - Stock quote</title>'+html)));
   expect(await loadTargetContext('TEST')).toMatchObject({daily:history(),band:{upper:110}});
   vi.stubGlobal('fetch',vi.fn(async(url:string)=>new Response(url.includes('ohlc')?JSON.stringify({symbol:'WRONG',bars:history()}):'<title>MISSING - Stock quote</title>'+html)));
   const missing=await loadTargetContext('MISSING');expect(missing.daily).toBeUndefined();expect(missing.band?.upper).toBe(110);
 });
});
