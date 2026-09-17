// Runs only against synthetic state in this localhost preview, never live Drive.
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { initDriveAuth, readLatestFromDrive } from '../../src/services/driveStorage';
import { readRecoveryCopies } from '../../src/utils/recoveryStorage';
import '../../src/index.css';
const email = `preview-${Date.now()}@example.invalid`;
const pendingKey = `psx_pending_cloud_v1:${encodeURIComponent(email)}`;
const oldKey = `psx_cloud_recovery:${encodeURIComponent(email)}:old`;
const values = new Map([
  ['psx_drive_user_profile', JSON.stringify({email})],
  ['psx_drive_access_token','synthetic-no-google-permission'],
  ['psx_drive_token_expiry',String(Date.now()+3600000)],
  [pendingKey,JSON.stringify({revision:'local',baseVersion:0,data:{marker:'pending'}})],
  [oldKey,JSON.stringify({data:{marker:'older-recovery'}})],
]);
Object.defineProperty(window,'localStorage',{value:{
  getItem:(key:string)=>values.get(key)??null,
  setItem:()=>{throw new DOMException('The quota has been exceeded.','QuotaExceededError');},
  removeItem:(key:string)=>values.delete(key),
  key:(index:number)=>[...values.keys()][index]??null,
  get length(){return values.size;},
}});
(window as any).google={accounts:{oauth2:{initTokenClient:()=>({requestAccessToken(){}})}}};
let downloads=0, checks=0;
window.fetch=async(input,options)=>{
  if(String(input)==='/api/cloud-sync') {
    const body=JSON.parse(String(options?.body));
    if(body.action==='drive-config')return Response.json({enabled:false});
    if(body.action!=='head')throw new Error('Preview blocks cloud writes.');
    checks++;return Response.json({revision:5,fileId:'synthetic-latest'});
  }
  if(String(input)==='https://www.googleapis.com/drive/v3/files/synthetic-latest?alt=media') {
    downloads++;return Response.json({transactions:[{id:'latest-phone-trade'}],portfolios:[{id:'main'}]});
  }
  throw new Error('Live requests are disabled.');
};
initDriveAuth(()=>{});
function Preview(){
  const [result,setResult]=useState('Opening the latest synthetic Drive copy…');
  useEffect(()=>{void(async()=>{
    try{
      const data=await readLatestFromDrive(()=>({marker:'current'}));
      const unchanged=await readLatestFromDrive(undefined,true);
      const copies=await readRecoveryCopies(email);
      const markers=copies.map(copy=>JSON.parse(copy.raw).data.marker).sort();
      if(data.transactions[0].id!=='latest-phone-trade'||unchanged!==undefined||downloads!==1||checks!==2||values.has(pendingKey)||values.has(oldKey)||markers.join(',')!=='current,older-recovery,pending')throw new Error('Unexpected recovery result');
      setResult('PASS: Latest phone data opened automatically. Full localStorage did not block it. Current edits, pending edits and the older recovery copy are preserved. One file download, no reload; the unchanged recheck only checked the version.');
    }catch(error){setResult(`FAIL: ${String(error)}`);}
  })();},[]);
  return <main className="p-6"><h1 className="font-bold text-xl">Automatic Drive recovery check</h1><p className="mt-4" role="status">{result}</p><p className="mt-4 text-sm">Synthetic data only. No Google account or portfolio was accessed.</p></main>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
