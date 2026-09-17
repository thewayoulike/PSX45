import React from 'react';
import { Logo } from './ui/Logo';

export function AppLoading() {
  const placeholder = 'rounded-lg bg-slate-200/70 dark:bg-slate-800';
  return <div role="status" aria-label="Loading" className="min-h-[100dvh] flex bg-slate-50 dark:bg-slate-950">
    <aside aria-hidden="true" className="hidden lg:flex w-64 shrink-0 flex-col gap-8 border-r border-slate-200/60 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
      <Logo variant="stacked" />
      <div className="space-y-5 animate-pulse motion-reduce:animate-none">
        {[0, 1, 2, 3, 4, 5].map(index => <div key={index} className="flex items-center gap-3"><div className={`${placeholder} h-7 w-7`} /><div className={`${placeholder} h-3 ${index % 2 ? 'w-24' : 'w-32'}`} /></div>)}
      </div>
    </aside>
    <div className="min-w-0 flex-1">
      <header aria-hidden="true" className="flex h-20 items-center justify-between gap-4 border-b border-slate-200/60 bg-white px-4 sm:px-8 dark:border-slate-800 dark:bg-slate-900">
        <div className="lg:hidden"><Logo variant="horizontal" /></div>
        <div className={`${placeholder} hidden lg:block h-5 w-40`} />
        <div className={`${placeholder} h-9 w-9 rounded-full shrink-0`} />
      </header>
      <div aria-hidden="true" className="mx-auto max-w-7xl space-y-5 p-4 sm:p-8 animate-pulse motion-reduce:animate-none">
        <div className="flex items-center justify-between gap-5"><div className={`${placeholder} h-7 w-36 sm:w-52`} /><div className={`${placeholder} h-9 w-24`} /></div>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-5">
          {[0, 1, 2, 3].map(index => <div key={index} className="space-y-4 rounded-2xl border border-slate-200/60 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900"><div className={`${placeholder} h-3 w-20 max-w-full`} /><div className={`${placeholder} h-7 w-28 max-w-full`} /><div className={`${placeholder} h-2 w-16`} /></div>)}
        </div>
        <div className="rounded-2xl border border-slate-200/60 bg-white p-4 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className={`${placeholder} h-5 w-32 mb-6`} />
          {[0, 1, 2, 3, 4].map(index => <div key={index} className="flex items-center justify-between gap-5 border-t border-slate-100 py-5 dark:border-slate-800"><div className={`${placeholder} h-4 w-20`} /><div className={`${placeholder} hidden sm:block h-4 w-24`} /><div className={`${placeholder} hidden md:block h-4 w-24`} /><div className={`${placeholder} h-4 w-24`} /></div>)}
        </div>
      </div>
    </div>
  </div>;
}
