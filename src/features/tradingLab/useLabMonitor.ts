import {useEffect,useRef,useState} from 'react';
import {intradaySegments,pktDay,standardSessions,type Plan} from './engine';
import {checkEntry,type Rules} from './workflow';
import {type LabData,type CandleSet} from './data';
export type LabAlert={id:string;text:string;time:number};
export function observedAlerts(candles:CandleSet,p:Plan,r:Rules,started:number,now:number):LabAlert[]{
  const s=intradaySegments(candles.bars,now).at(-1),last=s?.bars.at(-1);if(!s||!last||s.day!==pktDay(now)||now-last.time>15*60000||last.time+300000<started||now>s.end)return [];
  const events:LabAlert[]=[],add=(key:string,text:string,time:number)=>events.push({id:`${s.key}:${p.symbol}:${key}`,text,time});
  if(last.low<=p.stop)add(`stop:${p.stop}`,`${p.symbol}: a completed candle touched/breached the test stop ${p.stop}. This is not a fill.`,last.time+300000);
  if(last.high>=p.target)add(`target:${p.target}`,`${p.symbol}: a completed candle touched the test target ${p.target}. This is not a fill.`,last.time+300000);
  const entry=checkEntry(s,r,now);if(entry.trigger&&entry.trigger.time+300000>=started)add(`entry:${JSON.stringify(r)}`,`${p.symbol}: your entry rules matched a completed candle. Review the plan.`,entry.trigger.time+300000);
  return events;
}
export function useLabMonitor(data:LabData,symbol:string,plan:Plan,rules:Rules,intraday:CandleSet|null,onData:(d:CandleSet)=>void){
  const [enabled,setEnabled]=useState(false),[now,setNow]=useState(Date.now()),[status,setStatus]=useState('Monitoring off'),[alerts,setAlerts]=useState<LabAlert[]>([]);
  const started=useRef(0),seen=useRef(new Set<string>());
  useEffect(()=>{if(!enabled){setStatus('Monitoring off');return;}let active=true,busy=false;started.current=Date.now();seen.current.clear();setAlerts([]);
    const poll=async()=>{if(busy||document.visibilityState==='hidden')return;busy=true;try{const next=await data.candles(symbol,true,true);if(active){onData(next);setStatus('Last refresh '+new Date().toLocaleTimeString()+' · visible page only');}}catch{if(active)setStatus('Refresh failed. Monitoring will retry; old prices are not live alerts.');}finally{busy=false;}};
    void poll();const fetchTimer=setInterval(()=>void poll(),30000),clock=setInterval(()=>{if(document.visibilityState!=='hidden')setNow(Date.now());},5000);document.addEventListener('visibilitychange',poll);
    return()=>{active=false;clearInterval(fetchTimer);clearInterval(clock);document.removeEventListener('visibilitychange',poll);};
  },[enabled,data,symbol,onData]);
  useEffect(()=>{
    if(!enabled||document.visibilityState==='hidden')return;
    const fresh:LabAlert[]=[];
    try{if(intraday&&intraday.symbol===symbol)fresh.push(...observedAlerts(intraday,plan,rules,started.current,now));}catch{/* Invalid edited rules do not generate alerts. */}
    for(const session of standardSessions(pktDay(now)))for(const [key,time,label] of [['open',session.start,'Regular session opening'],['flat',session.end-rules.flatMinutes*60000,'Planned flat-by time reached']] as const){
      if(time>=started.current&&now>=time&&now-time<30000)fresh.push({id:`${pktDay(now)}:${session.family}:${key}`,time,text:`${label} · ${session.family}. Check the PSX holiday/special-hours calendar.`});
    }
    const unseen=fresh.filter(a=>!seen.current.has(a.id));unseen.forEach(a=>seen.current.add(a.id));if(unseen.length)setAlerts(old=>[...unseen,...old].slice(0,30));
  },[enabled,now,intraday,plan,rules,symbol]);
  return {enabled,toggle:()=>setEnabled(v=>!v),now,status,alerts};
}
