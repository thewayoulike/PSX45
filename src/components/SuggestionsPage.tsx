import React, { useState } from 'react';
import { feedbackLinks } from '../../config/site.js';
import { SiteFooter } from './SiteFooter';
export function SuggestionsPage() {
  const [category,setCategory]=useState('Suggestion'), [subject,setSubject]=useState(''), [message,setMessage]=useState(''), [prepared,setPrepared]=useState(false);
  const input='w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 mt-2 text-base';
  const links=feedbackLinks(category,subject,message);
  return <section className="max-w-2xl mx-auto p-4 sm:p-6"><p className="text-xs uppercase tracking-widest text-emerald-600 dark:text-emerald-400 font-bold">Help shape PSX Tracker</p><h1 className="text-3xl font-bold mt-2 mb-3">Suggestions & feedback</h1><p className="text-slate-600 dark:text-slate-400 mb-6">Tell us what would make your investing routine easier, or report something that isn’t working.</p>
    <form className="space-y-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5" onChange={()=>setPrepared(false)} onSubmit={e=>{e.preventDefault();setPrepared(true);}}>
      <label className="block font-medium">Type<select className={input} value={category} onChange={e=>setCategory(e.target.value)}><option>Suggestion</option><option>Bug report</option><option>Account help</option></select></label>
      <label className="block font-medium">Short title<input className={input} required maxLength={120} value={subject} onChange={e=>setSubject(e.target.value)} placeholder="What could we improve?" /></label>
      <label className="block font-medium">Details<textarea className={input} rows={6} required maxLength={1800} value={message} onChange={e=>setMessage(e.target.value)} placeholder="For a bug, include the page, what happened, and what you expected." /></label>
      <p className="text-sm text-slate-500 dark:text-slate-400">Please leave out passwords, login codes, API keys and private portfolio records. No account data is attached automatically.</p>
      <button className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl py-3 px-5" type="submit">Prepare feedback</button>
      {prepared && <div className="border-t border-slate-200 dark:border-slate-700 pt-4 space-y-3"><p role="status">Ready to send. Choose email or WhatsApp, then review and send your message there.</p><div className="flex flex-wrap gap-3"><a className="rounded-xl px-4 py-3 bg-emerald-600 text-white font-semibold" href={links.email}>Open email draft</a><a className="rounded-xl px-4 py-3 border border-slate-300 dark:border-slate-600 font-semibold" href={links.whatsapp} target="_blank" rel="noopener noreferrer">Open WhatsApp</a></div></div>}
    </form><div className="mt-8"><SiteFooter /></div>
  </section>;
}
