import React from 'react';
import { PUBLIC_LINKS } from '../../config/site.js';
export function SiteFooter() {
  return <nav aria-label="Helpful links" className="flex flex-wrap justify-center gap-x-6 gap-y-1 text-sm text-slate-600 dark:text-slate-300">
    {PUBLIC_LINKS.map(([label, path]) => <a key={path} href={path} className="min-h-[44px] inline-flex items-center underline underline-offset-4 hover:text-emerald-600">{label}</a>)}
  </nav>;
}
