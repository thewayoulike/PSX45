import React,{useCallback,useEffect,useRef,useState} from 'react';
import {backupPracticeToDrive,practiceBackupKey,type PracticeRequest} from '../services/practiceDriveBackup';
import {WorkspaceDriveStatus,type WorkspaceDriveState} from './WorkspaceDriveStatus';
export function PracticeDriveBackup({email,connected,onConnect,accountId,revision,request}:{email:string;connected:boolean;onConnect?:()=>void;accountId?:string;revision:number;request:PracticeRequest}){
  const [state,setState]=useState<WorkspaceDriveState>(()=>{try{return {busy:false,error:'',...JSON.parse(localStorage.getItem(practiceBackupKey(email))||'{}')};}catch{return {busy:false,error:''};}});
  const alive=useRef(true),running=useRef(false),again=useRef(false);
  const sync=useCallback(async()=>{
    if(!connected||!accountId)return;
    if(running.current){again.current=true;return;}
    running.current=true;
    if(alive.current)setState(s=>({...s,busy:true,error:''}));
    try{do{again.current=false;const saved=await backupPracticeToDrive(email,request);if(alive.current)setState({busy:true,error:'',fileId:saved.fileId,savedAt:saved.savedAt});}while(again.current);}
    catch(e){if(alive.current)setState(s=>({...s,error:e instanceof Error?e.message:'Backup failed. Your practice account is still saved with pyPSX.'}));}
    finally{running.current=false;if(alive.current)setState(s=>({...s,busy:false}));}
  },[email,connected,accountId,request]);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  useEffect(()=>{const timer=window.setTimeout(()=>void sync(),1500);return()=>window.clearTimeout(timer);},[sync,revision]);
  useEffect(()=>{const retry=()=>{if(document.visibilityState==='visible')void sync();};const timer=window.setInterval(retry,300000);window.addEventListener('online',retry);return()=>{window.clearInterval(timer);window.removeEventListener('online',retry);};},[sync]);
  return <WorkspaceDriveStatus practice connected={connected} onConnect={onConnect} onSync={()=>void sync()} state={state}/>;
}
