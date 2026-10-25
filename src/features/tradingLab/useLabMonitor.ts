import {useEffect,useMemo,useRef,useState,useSyncExternalStore} from 'react';
import type {LabData,CandleSet} from './data';
import {createLabMonitor} from './monitor';
export {observedAlerts,type LabAlert} from './monitor';

export function useLabMonitor(data:LabData,symbol:string,onData:(data:CandleSet)=>void){
  const selected=useRef({symbol,onData});selected.current={symbol,onData};
  const [now,setNow]=useState(Date.now());
  const controller=useMemo(()=>createLabMonitor({
    load:stock=>data.candles(stock,true,true),
    visible:()=>document.visibilityState!=='hidden',
    onData:next=>{if(next.symbol===selected.current.symbol)selected.current.onData(next);}
  }),[data]);
  const items=useSyncExternalStore(controller.subscribe,controller.getSnapshot,controller.getSnapshot);
  useEffect(()=>{
    controller.resume();
    const refresh=setInterval(controller.refresh,30000),clock=setInterval(()=>{
      if(document.visibilityState==='hidden')return;
      setNow(Date.now());controller.tick();
    },5000);
    document.addEventListener('visibilitychange',controller.refresh);
    return()=>{controller.pause();clearInterval(refresh);clearInterval(clock);document.removeEventListener('visibilitychange',controller.refresh);};
  },[controller]);
  return {...controller,items,now};
}
