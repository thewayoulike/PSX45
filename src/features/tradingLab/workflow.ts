// PSX testing equivalents of the MIT upstream entry, exit, risk and Time Machine tools.
import {intradaySegments,openingRange,netReturn,sizePlan,walkTrade,type Bar,type Plan,type Segment} from './engine';
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
export function checkEntry(s:Segment,r:Rules,now=Date.now()){
  validateRules(r);const range=openingRange(s),deadline=Math.min(s.start+r.entryMinutes*60000,s.end-r.flatMinutes*60000);
  const empty={trigger:null as Bar|null,index:-1,level:r.entryMode==='level'?r.level:range?.high??null,volumeRatio:null as number|null,deadline};
  if(!range)return {...empty,state:'incomplete' as const,reason:'Three consecutive opening candles are required.'};
  const vols=s.bars.slice(0,3).map(b=>b.volume),avg=vols.every(v=>v!=null)?(vols as number[]).reduce((a,b)=>a+b,0)/3:null;
  for(let i=3;i<s.bars.length;i++){
    const b=s.bars[i];if(b.time+FIVE>deadline||b.time+FIVE>now)break;
    if(b.time-s.bars[i-1].time!==FIVE)return {...empty,state:'incomplete' as const,reason:'Missing candles could hide an earlier entry.'};
    if(r.volumeX>0&&b.volume==null&&b.close>empty.level!)return {...empty,state:'incomplete' as const,reason:'Missing volume could hide an earlier confirmed entry.'};
    const ratio=avg&&b.volume!=null?b.volume/avg:null;
    if(b.close>empty.level!&&(r.volumeX===0||(ratio!=null&&ratio>=r.volumeX)))return {...empty,trigger:b,index:i,volumeRatio:ratio,state:'triggered' as const,reason:'Completed close and selected volume rule matched.'};
  }
  if(r.volumeX>0&&(!avg||s.bars.some(b=>b.time+FIVE<=deadline&&b.volume===null)))return {...empty,state:'incomplete' as const,reason:'Volume confirmation needs reported opening and trigger volumes.'};
  return {...empty,state:now>=deadline?'expired' as const:'waiting' as const,reason:now>=deadline?'Entry window ended without a confirmed match.':'Waiting for a completed close that passes the rules.'};
}
export function atr(bars:Bar[],period=14){
  const values=bars.slice(1).map((b,i)=>Math.max(b.high-b.low,Math.abs(b.high-bars[i].close),Math.abs(b.low-bars[i].close))).slice(-period);
  return {value:values.length?values.reduce((a,b)=>a+b,0)/values.length:null,count:values.length};
}
export function exitLevels(entry:number,s:Segment|null,throughIndex:number,r:Rules,manualStop:number){
  validateRules(r);const range=s?openingRange(s):null,volatility=atr(s?.bars.slice(0,throughIndex+1)||[]);
  let stop:number;
  switch(r.stopMode){
    case 'range-low':if(!range)throw new Error('Opening range is unavailable.');stop=range.low;break;
    case 'range-mid':if(!range)throw new Error('Opening range is unavailable.');stop=(range.high+range.low)/2;break;
    case 'percent':stop=entry*(1-r.stopValue/100);break;
    case 'atr':if(volatility.count<14||volatility.value==null)throw new Error('ATR stop needs 14 true ranges at or before entry; later candles are excluded.');stop=entry-r.stopValue*volatility.value;break;
    default:stop=manualStop;
  }
  stop=Math.floor((stop+1e-9)*100)/100;
  if(!(stop>0&&entry>stop))throw new Error('The selected stop must be positive and below entry.');
  return {stop,target:Math.round((entry+(entry-stop)*r.targetR)*100)/100,atr:volatility};
}
export function riskReview(p:Plan,r:RiskContext){
  validateRisk(r);const sized=sizePlan(p),blocks=[...sized.errors,...sized.warnings];
  if(sized.cost>r.cash-r.cashBuffer)blocks.push('Entry would use the reserved cash buffer.');
  if(r.lossSoFar+r.reservedRisk+sized.loss>r.dailyLossLimit)blocks.push('Losses, reserved risk and this plan exceed the session loss limit.');
  if(r.trades>=r.maxTrades)blocks.push('Maximum test entries for the session already reached.');
  if(sized.cost<r.minOrder||sized.cost>r.maxOrder)blocks.push('Entry value is outside the selected order limits.');
  const names=(s:string)=>s.toUpperCase().split(/[\s,]+/);
  if(names(r.heldSymbols).includes(p.symbol))blocks.push('This symbol is already in your hypothetical positions.');
  if(names(r.blockedSymbols).includes(p.symbol))blocks.push('This symbol is on your blocked list.');
  return {blocks,sized,remainingRisk:r.dailyLossLimit-r.lossSoFar-r.reservedRisk,ready:blocks.length===0};
}
export function replayRules(bars:Bar[],p:Plan,r:Rules,now=Date.now()){
  validateRules(r);if(![p.feePct,p.slipPct].every(v=>Number.isFinite(v)&&v>=0&&v<=10))throw new Error('Check fees and slippage.');
  const segments=intradaySegments(bars,now),complete=segments.filter(s=>s.complete);let skipped=0;
  const trades=complete.flatMap(s=>{
    const signal=checkEntry(s,r,s.end);if(!signal.trigger)return [];
    const after=s.bars.slice(signal.index+1).filter(b=>b.time+FIVE<=s.end-r.flatMinutes*60000);if(!after.length){skipped++;return [];}
    let levels:ReturnType<typeof exitLevels>;try{levels=exitLevels(signal.trigger.close,s,signal.index,r,p.stop);}catch{skipped++;return [];}
    const entry=signal.trigger.close,result=walkTrade(after,entry,levels.stop,levels.target);
    return [{day:s.day,session:s.family,entryTime:signal.trigger.time+FIVE,entry,stop:levels.stop,target:levels.target,...result,netR:netReturn(entry,result.exit,p.feePct,p.slipPct)/(entry-levels.stop)}];
  });
  return {sessions:complete.length,excluded:segments.length-complete.length,skipped,trades,averageR:trades.length?trades.reduce((a,t)=>a+t.netR,0)/trades.length:null};
}
export function simulateRules(bars:Bar[],p:Plan,r:Rules,now=Date.now(),replays=10000,seed=19){
  validateRules(r);if(sizePlan(p).errors.length)throw new Error('Resolve the plan checks first.');
  if(!Number.isInteger(replays)||replays<1||replays>10000)throw new Error('Use 1–10,000 paths.');
  const segments=intradaySegments(bars,now),latest=segments.at(-1);if(!latest)throw new Error('No intraday session is available.');
  const pool=segments.filter(s=>s.complete&&s.day<latest.day&&s.family===latest.family);
  if(pool.length<r.minimumSessions)throw new Error(`Need ${r.minimumSessions} complete earlier ${latest.family} sessions; found ${pool.length}.`);
  const first=Math.ceil(latest.start/FIVE)*FIVE,entryTime=first+(r.entryIndex+1)*FIVE,flat=latest.end-r.flatMinutes*60000;
  const length=(flat-first)/FIVE,start=r.entryIndex+1;
  if(start>=length)throw new Error('Choose an entry candle that leaves time before the flat-by exit.');
  let state=seed>>>0;const random=()=>{state=(Math.imul(1664525,state)+1013904223)>>>0;return state/4294967296;};
  const counts={target:0,stop:0,close:0},pnl:number[]=[],risk=p.entry-p.stop,curves:number[][]=Array.from({length:length-start+1},()=>[]);
  for(let n=0;n<replays;n++){
    let price=p.entry;const path:Bar[]=[];
    for(let i=start;i<length;i++){
      const sample=pool[Math.floor(random()*pool.length)].bars,j=Math.max(1,Math.min(sample.length-1,i+Math.floor(random()*(r.jitter*2+1))-r.jitter)),b=sample[j],prev=sample[j-1].close;
      path.push({...b,time:first+i*FIVE,open:price*b.open/prev,high:price*b.high/prev,low:price*b.low/prev,close:price*b.close/prev});price=path.at(-1)!.close;
    }
    const result=walkTrade(path,p.entry,p.stop,p.target);counts[result.outcome]++;pnl.push(netReturn(p.entry,result.exit,p.feePct,p.slipPct)/risk);
    if(n<1000){curves[0].push(p.entry);path.forEach((b,i)=>curves[i+1].push(b.close));}
  }
  const quant=(xs:number[],q:number)=>xs[Math.min(xs.length-1,Math.floor(xs.length*q))];pnl.sort((a,b)=>a-b);
  const fan=curves.map((values,i)=>{values.sort((a,b)=>a-b);return {time:entryTime+i*FIVE,p5:quant(values,.05),median:quant(values,.5),p95:quant(values,.95)};});
  const low=pnl[0],high=pnl.at(-1)!,width=(high-low||1)/12,histogram=Array.from({length:12},(_,i)=>({low:low+i*width,high:low+(i+1)*width,count:0}));
  for(const x of pnl)histogram[Math.min(11,Math.floor((x-low)/width))].count++;
  return {counts,replays,seed,sessions:pool.length,barsPerPath:length-start,family:latest.family,before:latest.day,entryTime,flatBy:flat,meanR:pnl.reduce((a,b)=>a+b,0)/replays,p5:quant(pnl,.05),median:quant(pnl,.5),p95:quant(pnl,.95),fan,histogram};
}
