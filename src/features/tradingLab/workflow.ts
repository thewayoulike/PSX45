// PSX testing equivalents of the MIT upstream entry, exit, risk and Time Machine tools.
import {intradaySegments,openingRange,netReturn,coversTargetCosts,sizePlan,walkTrade,pktDay,type Bar,type Plan,type Segment} from './engine';
import {assessTarget,type TargetContext} from './targets';
const FIVE=300000;
export type Rules={entryMode:'range'|'level';level:number;volumeX:number;entryMinutes:number;stopMode:'range-low'|'range-mid'|'percent'|'atr'|'manual';stopValue:number;targetR:number;flatMinutes:number;entryIndex:number;jitter:number;minimumSessions:number};
export const DEFAULT_RULES:Rules={entryMode:'range',level:100,volumeX:0,entryMinutes:90,stopMode:'range-low',stopValue:2,targetR:2,flatMinutes:5,entryIndex:2,jitter:2,minimumSessions:3};
export type RiskContext={cash:number;cashBuffer:number;lossSoFar:number;reservedRisk:number;dailyLossLimit:number;trades:number;maxTrades:number;minOrder:number;maxOrder:number;heldSymbols:string;blockedSymbols:string};
export const DEFAULT_RISK:RiskContext={cash:100000,cashBuffer:10000,lossSoFar:0,reservedRisk:0,dailyLossLimit:3000,trades:0,maxTrades:3,minOrder:0,maxOrder:25000,heldSymbols:'',blockedSymbols:''};
export type WorkflowSnapshot={rules:Rules;risk:RiskContext};
export function validateRules(r:Rules){
  if(!r||!['range','level'].includes(r.entryMode)||!['range-low','range-mid','percent','atr','manual'].includes(r.stopMode))throw new Error('Choose valid entry and exit rules.');
  if(![r.level,r.volumeX,r.entryMinutes,r.stopValue,r.targetR,r.flatMinutes,r.entryIndex,r.jitter,r.minimumSessions].every(Number.isFinite)||r.level<=0||r.volumeX<0||r.volumeX>100||r.entryMinutes<20||r.entryMinutes>360||r.stopValue<=0||r.targetR<=0||r.targetR>10||r.flatMinutes<0||r.flatMinutes>60||r.flatMinutes%5||r.entryIndex<2||r.entryIndex>70||!Number.isInteger(r.entryIndex)||!Number.isInteger(r.jitter)||r.jitter<0||r.jitter>6||!Number.isInteger(r.minimumSessions)||r.minimumSessions<3||r.minimumSessions>60)throw new Error('Check rule values, entry timing and sample size.');
}
export function validateRisk(r:RiskContext){
  if(!r||![r.cash,r.cashBuffer,r.lossSoFar,r.reservedRisk,r.dailyLossLimit,r.trades,r.maxTrades,r.minOrder,r.maxOrder].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0)||!Number.isInteger(r.trades)||!Number.isInteger(r.maxTrades)||r.maxTrades<1||r.dailyLossLimit<=0||r.maxOrder<r.minOrder||typeof r.heldSymbols!=='string'||typeof r.blockedSymbols!=='string')throw new Error('Check the hypothetical session risk inputs.');
}
export function parseWorkflow(raw:any):WorkflowSnapshot{
  validateRules(raw?.rules);validateRisk(raw?.risk);
  // Explicit fields keep immutable Drive records canonical across devices.
  const rules=Object.fromEntries(Object.keys(DEFAULT_RULES).map(k=>[k,raw.rules[k]])) as Rules;
  const risk=Object.fromEntries(Object.keys(DEFAULT_RISK).map(k=>[k,raw.risk[k]])) as RiskContext;
  return {rules,risk};
}
/** Average volume of the same 5-minute slot in earlier sessions; null below 3 reported sessions. */
export function slotVolume(history:Segment[],index:number){
  const values=history.map(h=>h.bars[index]?.volume).filter((v):v is number=>v!=null&&v>0);
  return values.length>=3?values.reduce((a,b)=>a+b,0)/values.length:null;
}
/** Earlier complete sessions of the same family, for time-of-day volume comparisons. */
export const comparableHistory=(segments:Segment[],s:Segment,count=10)=>segments.filter(x=>x.complete&&x.family===s.family&&x.day<s.day).slice(-count);
export function checkEntry(s:Segment,r:Rules,now=Date.now(),history:Segment[]=[]){
  validateRules(r);const range=openingRange(s),first=Math.ceil(s.start/FIVE)*FIVE;
  // The window starts at the first full candle (09:35 Mon–Thu), not the 09:32 session start.
  const deadline=Math.min(first+r.entryMinutes*60000,s.end-r.flatMinutes*60000);
  const empty={trigger:null as Bar|null,index:-1,level:r.entryMode==='level'?r.level:range?.high??null,volumeRatio:null as number|null,volumeBasis:'opening' as 'opening'|'time-of-day',deadline};
  if(!range)return {...empty,state:'incomplete' as const,reason:'Three consecutive opening candles are required.'};
  const vols=s.bars.slice(0,3).map(b=>b.volume),avg=vols.every(v=>v!=null)?(vols as number[]).reduce((a,b)=>a+b,0)/3:null;
  for(let i=3;i<s.bars.length;i++){
    const b=s.bars[i];if(b.time+FIVE>deadline||b.time+FIVE>now)break;
    if(b.time-s.bars[i-1].time!==FIVE)return {...empty,state:'incomplete' as const,reason:'Missing candles could hide an earlier entry.'};
    if(r.volumeX>0&&b.volume==null&&b.close>empty.level!)return {...empty,state:'incomplete' as const,reason:'Missing volume could hide an earlier confirmed entry.'};
    // Opening candles are the busiest of the day; compare with the same time on earlier days when known.
    const slot=slotVolume(history,i),base=slot??avg,ratio=base&&b.volume!=null?b.volume/base:null;
    // A custom level must be crossed: a stock already above it all day is not a breakout.
    const crossed=r.entryMode!=='level'||s.bars[i-1].close<=empty.level!;
    if(b.close>empty.level!&&crossed&&(r.volumeX===0||(ratio!=null&&ratio>=r.volumeX)))return {...empty,trigger:b,index:i,volumeRatio:ratio,volumeBasis:slot!=null?'time-of-day' as const:'opening' as const,state:'triggered' as const,reason:'Completed close and selected volume rule matched.'};
  }
  if(r.volumeX>0&&(!avg||s.bars.some(b=>b.time+FIVE<=deadline&&b.volume===null)))return {...empty,state:'incomplete' as const,reason:'Volume confirmation needs reported opening and trigger volumes.'};
  // An absent tail can hide a qualifying close. Only declare the window expired
  // after every completed slot through its cutoff has actually been observed.
  const lastRequired=Math.floor(Math.min(now,deadline)/FIVE)*FIVE-FIVE;
  const lastObserved=s.bars.filter(b=>b.time+FIVE<=Math.min(now,deadline)).at(-1);
  if(lastRequired>=s.bars[2].time+FIVE&&(!lastObserved||lastObserved.time<lastRequired))return {...empty,state:'incomplete' as const,reason:'The feed does not cover the entry window yet; missing candles could hide a match.'};
  return {...empty,state:now>=deadline?'expired' as const:'waiting' as const,reason:now>=deadline?'Entry window ended without a confirmed match.':'Waiting for a completed close that passes the rules.'};
}
/** Average true range of 5-minute candles. Overnight gaps are not counted as a candle's range. */
export function atr(bars:Bar[],period=14){
  const values=bars.slice(1).map((b,i)=>pktDay(b.time)===pktDay(bars[i].time)?Math.max(b.high-b.low,Math.abs(b.high-bars[i].close),Math.abs(b.low-bars[i].close)):b.high-b.low).slice(-period);
  return {value:values.length?values.reduce((a,b)=>a+b,0)/values.length:null,count:values.length};
}
export function exitLevels(entry:number,s:Segment|null,throughIndex:number,r:Rules,manualStop:number,context:TargetContext={}){
  validateRules(r);const range=s?openingRange(s):null;
  // Earlier sessions supply ATR history so it works early in the day; nothing after entry is used.
  const through=s?.bars[throughIndex]?.time;
  const known=through==null?[]:[...new Map([...(context.intraday||[]),...(s?.bars||[])].filter(b=>b.time<=through).map(b=>[b.time,b])).values()].sort((a,b)=>a.time-b.time);
  const volatility=atr(known);
  let stop:number;
  switch(r.stopMode){
    case 'range-low':if(!range)throw new Error('Opening range is unavailable.');stop=range.low;break;
    case 'range-mid':if(!range)throw new Error('Opening range is unavailable.');stop=(range.high+range.low)/2;break;
    case 'percent':stop=entry*(1-r.stopValue/100);break;
    case 'atr':if(volatility.count<14||volatility.value==null)throw new Error('ATR stop needs 14 earlier 5-minute candles (today or previous sessions); later candles are never used.');stop=entry-r.stopValue*volatility.value;break;
    default:stop=manualStop;
  }
  stop=Math.floor((stop+1e-9)*100)/100;
  if(!(stop>0&&entry>stop))throw new Error('The selected stop must be positive and below entry.');
  const targetReview=assessTarget(entry,Math.round((entry+(entry-stop)*r.targetR)*100)/100,s,throughIndex,context);
  if(targetReview.band&&stop<targetReview.band.lower)targetReview.warnings.push('Stop is below the daily lower limit and cannot fill there in this session.');
  return {stop,target:targetReview.target,atr:volatility,targetReview};
}
export function riskReview(p:Plan,r:RiskContext){
  validateRisk(r);const sized=sizePlan(p),blocks=[...sized.errors,...sized.warnings];
  if(sized.skipReason)blocks.unshift(sized.skipReason);
  if(sized.cost>r.cash-r.cashBuffer)blocks.push('Entry would use the reserved cash buffer.');
  if(r.lossSoFar+r.reservedRisk+sized.loss>r.dailyLossLimit)blocks.push('Losses, reserved risk and this plan exceed the session loss limit.');
  if(r.trades>=r.maxTrades)blocks.push('Maximum test entries for the session already reached.');
  if(sized.cost<r.minOrder||sized.cost>r.maxOrder)blocks.push('Entry value is outside the selected order limits.');
  const names=(s:string)=>s.toUpperCase().split(/[\s,]+/);
  if(names(r.heldSymbols).includes(p.symbol))blocks.push('This symbol is already in your hypothetical positions.');
  if(names(r.blockedSymbols).includes(p.symbol))blocks.push('This symbol is on your blocked list.');
  return {blocks,sized,remainingRisk:r.dailyLossLimit-r.lossSoFar-r.reservedRisk,ready:blocks.length===0};
}
export function replayRules(bars:Bar[],p:Plan,r:Rules,now=Date.now(),context:TargetContext={}){
  validateRules(r);if(![p.feePct,p.slipPct].every(v=>Number.isFinite(v)&&v>=0&&v<=10))throw new Error('Check fees and slippage.');
  const segments=intradaySegments(bars,now),complete=segments.filter(s=>s.complete);let skipped=0;
  const trades=complete.flatMap(s=>{
    const signal=checkEntry(s,r,s.end,comparableHistory(complete,s));if(!signal.trigger)return [];
    const after=s.bars.slice(signal.index+1).filter(b=>b.time+FIVE<=s.end-r.flatMinutes*60000);if(!after.length){skipped++;return [];}
    // A close confirms the breakout; a real order fills at the next candle's open.
    const entry=after[0].open;
    let levels:ReturnType<typeof exitLevels>;try{levels=exitLevels(entry,s,signal.index,r,p.stop,{...context,intraday:bars});}catch{skipped++;return [];}
    if(levels.target==null){skipped++;return [];}
    if(!coversTargetCosts(entry,levels.target,p.feePct,p.slipPct,p.oneSideCommission)){skipped++;return [];}
    const result=walkTrade(after,entry,levels.stop,levels.target);
    return [{day:s.day,session:s.family,entryTime:signal.trigger.time+FIVE,entry,stop:levels.stop,target:levels.target,targetReview:levels.targetReview,...result,netR:netReturn(entry,result.exit,p.feePct,p.slipPct,p.oneSideCommission)/(entry-levels.stop)}];
  });
  const wins=trades.filter(t=>t.netR>0).length;
  return {sessions:complete.length,excluded:segments.length-complete.length,skipped,trades,wins,winRange:trades.length?wilson(wins,trades.length):null,
    averageR:trades.length?trades.reduce((a,t)=>a+t.netR,0)/trades.length:null};
}
/** 95% Wilson score interval for a win rate: honest about small samples. */
export function wilson(k:number,n:number,z=1.96){
  if(!(n>0))return {low:0,high:1};
  const p=k/n,d=1+z*z/n,c=p+z*z/(2*n),m=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n));
  return {low:Math.max(0,(c-m)/d),high:Math.min(1,(c+m)/d)};
}
/** Below this many independent sessions, percentages are not shown. */
export const MIN_SESSIONS_FOR_PERCENT=20;
/**
 * What-if simulation: replays this plan's prices over earlier sessions of the same kind in which
 * these entry rules actually triggered, using each whole session after its trigger (not a mix of
 * unrelated candles). It shows the spread of past outcomes; it is not a forecast.
 */
export function simulateRules(bars:Bar[],p:Plan,r:Rules,now=Date.now(),replays=10000,seed=19){
  validateRules(r);if(sizePlan(p).errors.length)throw new Error('Resolve the plan checks first.');
  if(!Number.isInteger(replays)||replays<1||replays>10000)throw new Error('Use 1–10,000 paths.');
  const segments=intradaySegments(bars,now),latest=segments.at(-1);if(!latest)throw new Error('No intraday session is available.');
  const earlier=segments.filter(s=>s.complete&&s.day<latest.day&&s.family===latest.family);
  const pool=earlier.flatMap(s=>{
    const signal=checkEntry(s,r,s.end,comparableHistory(earlier,s));if(!signal.trigger)return [];
    const after=s.bars.slice(signal.index+1).filter(b=>b.time+FIVE<=s.end-r.flatMinutes*60000);
    return after.length?[{day:s.day,base:after[0].open,bars:after}]:[];
  });
  if(pool.length<r.minimumSessions)throw new Error(`Need ${r.minimumSessions} earlier ${latest.family} sessions where these entry rules triggered; found ${pool.length} of ${earlier.length} sessions checked.`);
  let state=seed>>>0;const random=()=>{state=(Math.imul(1664525,state)+1013904223)>>>0;return state/4294967296;};
  const length=Math.max(...pool.map(x=>x.bars.length));
  const counts={target:0,stop:0,close:0},pnl:number[]=[],risk=p.entry-p.stop,curves:number[][]=Array.from({length:length+1},()=>[]);
  for(let n=0;n<replays;n++){
    const pick=pool[Math.floor(random()*pool.length)],scale=p.entry/pick.base;
    const path=pick.bars.map(b=>({...b,open:b.open*scale,high:b.high*scale,low:b.low*scale,close:b.close*scale}));
    const result=walkTrade(path,p.entry,p.stop,p.target);counts[result.outcome]++;pnl.push(netReturn(p.entry,result.exit,p.feePct,p.slipPct,p.oneSideCommission)/risk);
    if(n<1000){curves[0].push(p.entry);for(let i=0;i<length;i++)curves[i+1].push((path[i]??path.at(-1)!).close);}
  }
  const quant=(xs:number[],q:number)=>xs[Math.min(xs.length-1,Math.floor(xs.length*q))];pnl.sort((a,b)=>a-b);
  const fan=curves.map((values,i)=>{values.sort((a,b)=>a-b);return {time:i*FIVE,p5:quant(values,.05),median:quant(values,.5),p95:quant(values,.95)};});
  const low=pnl[0],high=pnl.at(-1)!,width=(high-low||1)/12,histogram=Array.from({length:12},(_,i)=>({low:low+i*width,high:low+(i+1)*width,count:0}));
  for(const x of pnl)histogram[Math.min(11,Math.floor((x-low)/width))].count++;
  return {counts,replays,seed,sessions:pool.length,checked:earlier.length,barsPerPath:length,family:latest.family,before:latest.day,entryTime:0,flatBy:length*FIVE,
    meanR:pnl.reduce((a,b)=>a+b,0)/replays,p5:quant(pnl,.05),median:quant(pnl,.5),p95:quant(pnl,.95),fan,histogram};
}

