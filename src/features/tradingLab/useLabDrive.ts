import { useCallback, useEffect, useRef, useState } from 'react';
import type { WorkspaceDriveState } from '../../components/WorkspaceDriveStatus';
import { syncLabToDrive } from './driveSync';
import { hasPendingLab, labKey, LAB_CHANGED } from './storage';
export function useLabDrive(email:string,connected:boolean){
  const [state,setState]=useState<WorkspaceDriveState>(()=>{
    try{return {busy:false,error:'',...JSON.parse(localStorage.getItem(labKey(email)+':drive')||'{}')};}catch{return {busy:false,error:''};}
  });
  const [pending,setPending]=useState(()=>hasPendingLab(email));
  const alive=useRef(true),running=useRef(false),again=useRef(false);
  const sync=useCallback(async()=>{
    if(!connected)return;
    if(running.current){again.current=true;return;}
    running.current=true;
    if(alive.current)setState(s=>({...s,busy:true,error:''}));
    try{
      do{
        again.current=false;
        const result=await syncLabToDrive(email);
        if(alive.current)setState({busy:true,error:'',fileId:result.fileId,savedAt:result.savedAt});
      }while(again.current);
    }catch(e){if(alive.current)setState(s=>({...s,error:e instanceof Error?e.message:'Drive could not save. Your journal remains on this device.'}));}
    finally{running.current=false;if(alive.current){setPending(hasPendingLab(email));setState(s=>({...s,busy:false}));}}
  },[email,connected]);
  useEffect(()=>{
    alive.current=true;void sync();
    const changed=()=>setPending(hasPendingLab(email));
    const retry=()=>{if(document.visibilityState==='visible')void sync();};
    window.addEventListener(LAB_CHANGED,changed);window.addEventListener('online',retry);window.addEventListener('focus',retry);
    const timer=window.setInterval(retry,60000);
    return()=>{alive.current=false;window.clearInterval(timer);window.removeEventListener(LAB_CHANGED,changed);window.removeEventListener('online',retry);window.removeEventListener('focus',retry);};
  },[email,sync]);
  return {state,pending,sync};
}
