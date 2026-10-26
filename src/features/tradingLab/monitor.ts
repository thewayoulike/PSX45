import {intradaySegments,pktDay,standardSessions,type Plan} from './engine';
import {checkEntry,exitLevels,validateRules,type Rules} from './workflow';
import type {CandleSet} from './data';
import {targetSummary,type TargetReview} from './targets';
export type LabAlert={id:string;text:string;time:number};
export function observedAlerts(candles:CandleSet,p:Plan,r:Rules,started:number,now:number):LabAlert[]{
  if(candles.symbol!==p.symbol)return [];
  const s=intradaySegments(candles.bars,now).at(-1),last=s?.bars.at(-1);if(!s||!last||s.day!==pktDay(now)||now-last.time>15*60000||last.time+300000<started||now>s.end)return [];
  const events:LabAlert[]=[],add=(key:string,text:string,time:number)=>events.push({id:`${s.key}:${p.symbol}:${key}`,text,time});
  const hasLevels=Number.isFinite(p.entry)&&Number.isFinite(p.stop)&&Number.isFinite(p.target)&&p.stop>0&&p.stop<p.entry&&p.target>p.entry;
  if(hasLevels&&last.low<=p.stop)add(`stop:${p.stop}`,`${p.symbol}: a completed candle touched/breached the test stop ${p.stop}. This is not a fill.`,last.time+300000);
  if(hasLevels&&last.high>=p.target)add(`target:${p.target}`,`${p.symbol}: a completed candle touched the test target ${p.target}. This is not a fill.`,last.time+300000);
  const entry=checkEntry(s,r,now);if(entry.trigger&&entry.trigger.time+300000>=started)add(`entry:${JSON.stringify(r)}`,`${p.symbol}: your entry rules matched a completed candle. Review the plan.`,entry.trigger.time+300000);
  return events;
}

export type MonitoredStock={
  symbol:string;plan:Plan;rules:Rules;source:string;started:number;targetReview?:TargetReview;
  status:string;refreshedAt:number|null;candleAt:number|null;alerts:LabAlert[];
};
type Entry={value:MonitoredStock;seen:Set<string>;waitingForLevels:boolean};
type Options={load:(symbol:string)=>Promise<CandleSet>;visible:()=>boolean;now?:()=>number;onData?:(data:CandleSet)=>void};
const validLevels=(p:Plan)=>[p.entry,p.stop,p.target].every(Number.isFinite)&&p.stop>0&&p.stop<p.entry&&p.target>p.entry;
const stamp=(time:number)=>new Date(time).toLocaleString('en-GB',{timeZone:'Asia/Karachi',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})+' PKT';

/** Each item owns its plan, rules, alert history and request identity. Selection is not monitor state. */
export function createLabMonitor(options:Options){
  const now=options.now??Date.now,entries=new Map<string,Entry>(),listeners=new Set<()=>void>();
  const pending=new Set<Entry>(),inFlight=new Set<Entry>();
  let snapshot:MonitoredStock[]=[],active=false,epoch=0,running=0;
  const current=(entry:Entry)=>entries.get(entry.value.symbol)===entry;
  function emit(){snapshot=[...entries.values()].map(e=>e.value);listeners.forEach(fn=>fn());}
  function notices(entry:Entry,events:LabAlert[]){
    const unseen=events.filter(event=>!entry.seen.has(event.id));
    unseen.forEach(event=>entry.seen.add(event.id));
    if(unseen.length)entry.value={...entry.value,alerts:[...unseen,...entry.value.alerts].slice(0,30)};
    return unseen.length>0;
  }
  function fillLevels(entry:Entry,data:CandleSet,time:number){
    if(!entry.waitingForLevels)return;
    const segments=intradaySegments(data.bars,time),sessionNow=standardSessions(pktDay(time)).find(s=>time>=s.start&&time<s.end);
    const session=sessionNow?segments.find(s=>s.start===sessionNow.start):segments.at(-1);
    if(!session)return;
    const signal=checkEntry(session,entry.value.rules,time);
    if(!signal.trigger)return;
    const {stop,target,targetReview}=exitLevels(signal.trigger.close,session,signal.index,entry.value.rules,entry.value.plan.stop,{...data.targetContext,intraday:data.bars});
    const source=`${sessionNow?'Observed':'Historical'} rule-confirmed setup · ${stamp(signal.trigger.time+300000)} · ${targetSummary(targetReview)}`;
    if(target==null){entry.value={...entry.value,source,targetReview};return;}
    entry.value={...entry.value,plan:{...entry.value.plan,entry:signal.trigger.close,stop,target},rules:{...entry.value.rules,entryIndex:signal.index},source,targetReview};
    entry.waitingForLevels=false;
  }
  function pump(){
    if(!active||!options.visible())return;
    while(running<3&&pending.size){
      const entry=pending.values().next().value!;pending.delete(entry);
      if(!current(entry)||inFlight.has(entry))continue;
      running++;inFlight.add(entry);const requestEpoch=epoch;
      void (async()=>{
        try{
          const data=await options.load(entry.value.symbol);
          if(!active||epoch!==requestEpoch||!current(entry)||!options.visible())return;
          if(data.symbol!==entry.value.symbol)throw new Error('The feed returned a different stock.');
          const time=now();
          try{fillLevels(entry,data,time);}catch{/* Keep entry monitoring active when exit levels cannot be calculated. */}
          const last=intradaySegments(data.bars,time).at(-1)?.bars.at(-1);
          entry.value={...entry.value,status:'Updated · this visible page only',refreshedAt:time,candleAt:last?last.time+300000:null};
          notices(entry,observedAlerts(data,entry.value.plan,entry.value.rules,entry.value.started,time));
          emit();options.onData?.(data);
        }catch{
          if(active&&epoch===requestEpoch&&current(entry)&&options.visible()){
            entry.value={...entry.value,status:'Refresh failed; retrying on the next check. Earlier prices are not live alerts.'};emit();
          }
        }finally{
          running--;inFlight.delete(entry);
          if(active&&epoch!==requestEpoch&&current(entry))pending.add(entry);
          pump();
        }
      })();
    }
  }
  function refresh(){
    if(!active||!options.visible())return;
    for(const entry of entries.values())if(!inFlight.has(entry))pending.add(entry);
    pump();
  }
  function create(plan:Plan,rules:Rules,source='',targetReview?:TargetReview){
    if(!/^[A-Z][A-Z0-9.-]{0,19}$/.test(plan.symbol))throw new Error('Enter a valid PSX symbol.');
    validateRules(rules);
    const entry:Entry={value:{symbol:plan.symbol,plan:{...plan},rules:{...rules},source,...(targetReview?{targetReview:structuredClone(targetReview)}:{}),started:now(),status:'Waiting for the first refresh…',refreshedAt:null,candleAt:null,alerts:[]},seen:new Set(),waitingForLevels:!validLevels(plan)};
    entries.set(plan.symbol,entry);pending.add(entry);emit();pump();
  }
  return {
    getSnapshot:()=>snapshot,
    subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};},
    start:(plan:Plan,rules:Rules,source='',targetReview?:TargetReview)=>{if(!entries.has(plan.symbol))create(plan,rules,source,targetReview);},
    update:(plan:Plan,rules:Rules,source='',targetReview?:TargetReview)=>{if(entries.has(plan.symbol))create(plan,rules,source,targetReview);},
    stop:(symbol:string)=>{const entry=entries.get(symbol);if(!entry)return;pending.delete(entry);entries.delete(symbol);emit();},
    stopAll:()=>{pending.clear();entries.clear();emit();},
    resume:()=>{active=true;refresh();},
    pause:()=>{active=false;epoch++;pending.clear();},
    refresh,
    tick:()=>{
      if(!active||!options.visible())return;
      const time=now();let changed=false;
      for(const entry of entries.values()){
        const events:LabAlert[]=[];
        for(const session of standardSessions(pktDay(time)))for(const [key,at,label] of [['open',session.start,'Regular session opening'],['flat',session.end-entry.value.rules.flatMinutes*60000,'Planned flat-by time reached']] as const){
          if(at>=entry.value.started&&time>=at&&time-at<30000)events.push({id:`${pktDay(time)}:${session.family}:${entry.value.symbol}:${key}`,time:at,text:`${entry.value.symbol}: ${label} · ${session.family}. Check the PSX holiday/special-hours calendar.`});
        }
        changed=notices(entry,events)||changed;
      }
      if(changed)emit();
    }
  };
}
