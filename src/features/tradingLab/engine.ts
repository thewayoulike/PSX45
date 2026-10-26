// Workflow adapted from Jake Schincariol's MIT day-trader-skill.
// PSX implementation and assumptions: docs/trading-lab/adaptation.md.
export type Bar = { time: number; open: number; high: number; low: number; close: number; volume: number | null };
export type Plan = { symbol: string; entry: number; stop: number; target: number; capital: number; riskPct: number; capPct: number; feePct: number; slipPct: number; minRR: number; lot: number };
export const DEFAULT_PLAN: Plan = { symbol: 'HBL', entry: 0, stop: 0, target: 0, capital: 100000, riskPct: 1, capPct: 25, feePct: 0.2, slipPct: 0.1, minRR: 1.5, lot: 1 };
export const TARGET_COST_SKIP = 'Skip — target does not cover costs';
// Treat floating-point dust at break-even as zero, not a profitable setup.
export const coversTargetCosts = (entry:number,target:number,feePct:number,slipPct:number) => netReturn(entry,target,feePct,slipPct)>1e-9;
const MINUTE = 60000, FIVE = 5 * MINUTE;
export const PKT_OFFSET = 5 * 3600000;
export const pktDay = (t: number) => new Date(t + PKT_OFFSET).toISOString().slice(0, 10);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export function parseBars(raw: unknown): Bar[] {
  const result = new Map<number, Bar>();
  for (const row of Array.isArray(raw) ? raw : []) {
    if (!row || !['time','open','high','low','close'].every(k => typeof row[k] === 'number' && Number.isFinite(row[k]) && row[k] > 0)) continue;
    if (row.high < Math.max(row.open, row.close) || row.low > Math.min(row.open, row.close) || row.high < row.low) continue;
    const volume = row.volumeAvailable !== false && typeof row.volume === 'number' && Number.isFinite(row.volume) && row.volume >= 0 ? row.volume : null;
    result.set(row.time, { time: row.time, open: row.open, high: row.high, low: row.low, close: row.close, volume });
  }
  return [...result.values()].sort((a,b) => a.time - b.time);
}

export function standardSessions(day: string) {
  const midnight = Date.parse(day + 'T00:00:00+05:00');
  const weekday = new Date(midnight + PKT_OFFSET).getUTCDay();
  const windows = weekday === 5 ? [[557,720,'Friday morning'],[872,990,'Friday afternoon']] : weekday > 0 && weekday < 5 ? [[572,930,'Monday–Thursday']] : [];
  return windows.map(([start,end,family]) => ({ start: midnight + Number(start)*MINUTE, end: midnight + Number(end)*MINUTE, family: String(family) }));
}

export function completedDaily(bars: Bar[], now = Date.now()) {
  const today = pktDay(now), close = standardSessions(today).at(-1)?.end;
  return bars.filter(b => pktDay(b.time) < today || (pktDay(b.time) === today && close != null && now >= close));
}

function rsi(closes: number[], period = 14): number | null {
  if (closes.length <= period) return null;
  let gain=0, loss=0;
  for(let i=1;i<=period;i++){const d=closes[i]-closes[i-1];gain+=Math.max(d,0)/period;loss+=Math.max(-d,0)/period;}
  for(let i=period+1;i<closes.length;i++){const d=closes[i]-closes[i-1];gain=(gain*(period-1)+Math.max(d,0))/period;loss=(loss*(period-1)+Math.max(-d,0))/period;}
  return !loss ? (!gain ? 50 : 100) : 100-100/(1+gain/loss);
}

export function dailyScan(bars: Bar[], now = Date.now()) {
  const rows = completedDaily(bars,now), last=rows.at(-1);
  if (rows.length < 22 || !last) throw new Error('At least 22 completed daily candles are needed.');
  const closes=rows.map(b=>b.close), prior=closes.slice(-21,-1), ma20=mean(closes.slice(-20)), prevMA=mean(closes.slice(-21,-1));
  const strength=rsi(closes), prevRsi=rsi(closes.slice(0,-1));
  const setups:string[]=[];
  if(last.close>Math.max(...prior))setups.push('20-day closing breakout');
  const run=closes.at(-6)!/closes.at(-16)!-1, flagRange=(Math.max(...closes.slice(-5))-Math.min(...closes.slice(-5)))/last.close;
  if(run>.10&&flagRange<.05)setups.push('Bull flag');
  if(closes.at(-2)!<prevMA&&last.close>ma20)setups.push('Reclaimed 20-day average');
  if(strength!=null&&strength<30)setups.push('RSI below 30');
  if(prevRsi!=null&&prevRsi<30&&last.close>closes.at(-2)!)setups.push('Oversold bounce');
  if(prevRsi!=null&&strength!=null&&prevRsi<30&&strength>=30)setups.push('RSI recovery');
  const volumes=rows.slice(-21,-1).map(b=>b.volume);
  const avgVolume=volumes.every(v=>v!==null)?mean(volumes as number[]):null;
  return {last,date:pktDay(last.time),changePct:(last.close/closes.at(-2)!-1)*100,ma20,rsi:strength,setups,avgVolume,
    relativeVolume:avgVolume&&last.volume!=null?last.volume/avgVolume:null};
}

export type Segment = {key:string;day:string;family:string;start:number;end:number;bars:Bar[];complete:boolean};
export function intradaySegments(bars:Bar[], now=Date.now()):Segment[] {
  const groups=new Map<string,Segment>();
  for(const b of bars){
    if(b.time+FIVE>now)continue; // unfinished bars cannot confirm an entry
    const day=pktDay(b.time), window=standardSessions(day).find(s=>b.time>=s.start&&b.time+FIVE<=s.end);
    if(!window)continue; // excludes auctions, post-close and the Friday break
    const key=day+' '+window.family;
    const group=groups.get(key)||{key,day,...window,bars:[],complete:false};group.bars.push(b);groups.set(key,group);
  }
  return [...groups.values()].map(g=>{
    g.bars.sort((a,b)=>a.time-b.time);
    const first=Math.ceil(g.start/FIVE)*FIVE;
    g.complete=g.end<=now&&g.bars[0]?.time===first&&g.bars.at(-1)?.time===g.end-FIVE&&g.bars.every((b,i)=>i===0||b.time-g.bars[i-1].time===FIVE);
    return g;
  }).sort((a,b)=>a.start-b.start);
}

export function openingRange(g:Segment) {
  const first=Math.ceil(g.start/FIVE)*FIVE, range=g.bars.slice(0,3);
  if(range.length!==3||range.some((b,i)=>b.time!==first+i*FIVE))return null;
  const high=Math.max(...range.map(b=>b.high)),low=Math.min(...range.map(b=>b.low));
  // A gap before confirmation invalidates the scan; it could hide an earlier trigger.
  let trigger:Bar|null=null,index=-1;
  for(let i=3;i<g.bars.length;i++){
    if(g.bars[i].time-g.bars[i-1].time!==FIVE)break;
    if(g.bars[i].close>high){trigger=g.bars[i];index=i;break;}
  }
  return {high,low,trigger,index,rangeEnd:range[2].time+FIVE};
}

export function sizePlan(p:Plan) {
  const errors:string[]=[],warnings:string[]=[];
  if(!/^[A-Z][A-Z0-9.-]{0,19}$/.test(p.symbol))errors.push('Choose a valid PSX symbol.');
  if(!Object.entries(p).filter(([k])=>k!=='symbol').every(([,v])=>typeof v==='number'&&Number.isFinite(v)))errors.push('All plan inputs must be valid numbers.');
  if(!(p.stop>0&&p.entry>p.stop&&p.target>p.entry))errors.push('For a long plan, use stop < entry < target.');
  if(!(p.capital>0&&p.riskPct>0&&p.riskPct<=100&&p.capPct>0&&p.capPct<=100&&p.minRR>0))errors.push('Check capital, risk limit and position cap.');
  if(!(p.feePct>=0&&p.feePct<=10&&p.slipPct>=0&&p.slipPct<=10&&Number.isInteger(p.lot)&&p.lot>=1))errors.push('Check fees, slippage and lot size.');
  if(errors.length)return {errors,warnings,skipReason:null as string|null,quantity:0,cost:0,loss:0,reward:0,rr:0,riskBudget:0,binding:''};
  const slip=p.slipPct/100,fee=p.feePct/100,buy=p.entry*(1+slip),sellStop=p.stop*(1-slip),sellTarget=p.target*(1-slip);
  const unitCost=buy*(1+fee),unitLoss=unitCost-sellStop*(1-fee),unitReward=sellTarget*(1-fee)-unitCost;
  const riskBudget=p.capital*p.riskPct/100,cap=p.capital*p.capPct/100;
  const byRisk=Math.floor(riskBudget/unitLoss/p.lot)*p.lot,byCap=Math.floor(cap/unitCost/p.lot)*p.lot;
  const rawQuantity=Math.max(0,Math.min(byRisk,byCap)),quantity=Number.isSafeInteger(rawQuantity)?rawQuantity:0,rr=unitReward/unitLoss;
  if(!quantity)errors.push('The budget cannot fund one lot within these limits.');
  if(rr<p.minRR)warnings.push(`Estimated reward/risk is below ${p.minRR.toFixed(2)} after costs.`);
  const skipReason=!errors.length&&!coversTargetCosts(p.entry,p.target,p.feePct,p.slipPct)?TARGET_COST_SKIP:null;
  return {errors,warnings,skipReason,quantity,cost:quantity*unitCost,loss:quantity*unitLoss,reward:quantity*unitReward,rr,riskBudget,binding:byRisk<=byCap?'Risk budget':'Position cap'};
}

// Stops are evaluated before targets for ambiguous candles. Gap stops use the worse open.
export function walkTrade(bars:Bar[], entry:number, stop:number, target:number) {
  for(const b of bars){
    if(b.open<=stop)return {outcome:'stop' as const,exit:b.open,time:b.time};
    if(b.low<=stop)return {outcome:'stop' as const,exit:stop,time:b.time};
    if(b.high>=target)return {outcome:'target' as const,exit:target,time:b.time};
  }
  return {outcome:'close' as const,exit:bars.at(-1)?.close??entry,time:bars.at(-1)?.time??0};
}
export function netReturn(entry:number,exit:number,feePct:number,slipPct:number) {
  return exit*(1-slipPct/100)*(1-feePct/100)-entry*(1+slipPct/100)*(1+feePct/100);
}

export function replayOpeningRange(bars:Bar[],targetR:number,feePct:number,slipPct:number,now=Date.now()) {
  if(!Number.isFinite(targetR)||targetR<=0||targetR>10||![feePct,slipPct].every(v=>Number.isFinite(v)&&v>=0&&v<=10))throw new Error('Check the replay target, fees and slippage.');
  const segments=intradaySegments(bars,now),complete=segments.filter(s=>s.complete);
  const trades=complete.flatMap(s=>{
    const range=openingRange(s); if(!range?.trigger||range.index>=s.bars.length-1)return [];
    const entry=range.trigger.close,stop=range.low,risk=entry-stop;if(risk<=0)return [];
    const result=walkTrade(s.bars.slice(range.index+1),entry,stop,entry+risk*targetR);
    return [{day:s.day,session:s.family,entry,stop,target:entry+risk*targetR,...result,netR:netReturn(entry,result.exit,feePct,slipPct)/risk}];
  });
  return {sessions:complete.length,excluded:segments.length-complete.length,trades,averageR:trades.length?mean(trades.map(t=>t.netR)):null};
}

export function simulatePlan(bars:Bar[],p:Plan,now=Date.now(),replays=10000,seed=19) {
  if(sizePlan(p).errors.length)throw new Error('Resolve the plan checks first.');
  if(!Number.isInteger(replays)||replays<1||replays>10000)throw new Error('Choose between 1 and 10,000 paths.');
  const segments=intradaySegments(bars,now),latest=segments.at(-1);
  if(!latest)throw new Error('Intraday candles are not available.');
  // Standardized scenario: entry after the opening range, sampling only earlier comparable sessions.
  const pool=segments.filter(s=>s.complete&&s.day<latest.day&&s.family===latest.family);
  if(pool.length<3)throw new Error(`Need 3 complete earlier ${latest.family} sessions; found ${pool.length}.`);
  const length=pool[0].bars.length;
  if(pool.some(s=>s.bars.length!==length)||length<5)throw new Error('Comparable session lengths are unavailable.');
  let state=seed>>>0;const random=()=>{state=(Math.imul(1664525,state)+1013904223)>>>0;return state/4294967296;};
  const counts={target:0,stop:0,close:0},pnl:number[]=[],risk=p.entry-p.stop;
  for(let n=0;n<replays;n++){
    let price=p.entry;const path:Bar[]=[];
    for(let i=3;i<length;i++){
      const sample=pool[Math.floor(random()*pool.length)].bars,prev=sample[i-1].close,b=sample[i];
      path.push({...b,open:price*b.open/prev,high:price*b.high/prev,low:price*b.low/prev,close:price*b.close/prev});price=path.at(-1)!.close;
    }
    const result=walkTrade(path,p.entry,p.stop,p.target);counts[result.outcome]++;pnl.push(netReturn(p.entry,result.exit,p.feePct,p.slipPct)/risk);
  }
  pnl.sort((a,b)=>a-b);
  return {counts,replays,seed,sessions:pool.length,barsPerPath:length-3,family:latest.family,before:latest.day,meanR:mean(pnl),p5:pnl[Math.floor(replays*.05)],median:pnl[Math.floor(replays*.5)],p95:pnl[Math.floor(replays*.95)]};
}
