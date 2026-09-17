import React, { useEffect, useRef, useState } from 'react';
import { getSession, requestPasswordSetup } from '../services/auth';
export function GooglePasswordSetup({email}:{email:string}) {
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const dialog=useRef<HTMLDialogElement>(null);
  const key=`psx_password_prompt:${email.toLowerCase()}`;
  useEffect(()=>{
    let active=true;setOpen(false);
    void getSession().then(session=>{
      if(!active||session?.user.email?.toLowerCase()===email.toLowerCase())return;
      try{if(localStorage.getItem(key))return;}catch{/* Still offer setup if storage is unavailable. */}
      setOpen(true);
    }).catch(()=>{});
    return()=>{active=false;};
  },[key,email]);
  useEffect(()=>{if(open&&!dialog.current?.open)dialog.current?.showModal();},[open]);
  const dismiss=()=>{try{localStorage.setItem(key,'seen');}catch{}setOpen(false);};
  if(!open)return null;
  return <dialog ref={dialog} onCancel={dismiss} onClose={dismiss} className="w-[calc(100%_-_2rem)] max-w-md rounded-2xl p-6 bg-white dark:bg-slate-900 text-slate-900 dark:text-white backdrop:bg-slate-950/60" aria-labelledby="password-setup-title"><h2 id="password-setup-title" className="text-2xl font-bold">Add another way to log in</h2><p className="mt-3 text-slate-600 dark:text-slate-300">Set up a PSX Tracker password for <strong className="break-all">{email}</strong>. Next time, use Google or your email and password.</p><p className="text-sm mt-3 text-slate-500 dark:text-slate-400">We’ll email a secure setup link to verify it’s you. This does not change your Google password. With remembered Drive access enabled, the verified password account can reopen this same portfolio.</p>{message&&<p role="status" className="mt-4 text-sm">{message}</p>}<div className="flex flex-wrap gap-3 mt-6"><button disabled={busy} className="bg-emerald-600 text-white font-bold rounded-xl px-4 py-3 disabled:opacity-60" onClick={async()=>{setBusy(true);try{await requestPasswordSetup(email);setMessage('Setup link sent. Check your inbox and spam folder, then follow the link to choose a password.');try{localStorage.setItem(key,'seen');}catch{}}catch(e){setMessage(e instanceof Error?e.message:'Please try again.');}finally{setBusy(false);}}}>{busy?'Sending…':'Email setup link'}</button><button className="rounded-xl border border-slate-300 dark:border-slate-600 px-4 py-3" onClick={dismiss}>Maybe later</button></div><p className="text-xs text-slate-500 dark:text-slate-400 mt-4">You can also do this later in Profile & security.</p></dialog>;
}
