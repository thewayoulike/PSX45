import React, { useEffect, useId, useSyncExternalStore } from 'react';
import { Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { googleSignInReadiness } from '../services/driveStorage';

/** The real OAuth request stays synchronous with a ready user's tap (mobile popup rules). */
export function GoogleAuthButton({ onClick, children, className, compact = false, ...props }: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> & { onClick: () => void; compact?: boolean }) {
  const state = useSyncExternalStore(googleSignInReadiness.subscribe, googleSignInReadiness.getSnapshot, googleSignInReadiness.getSnapshot);
  const messageId = useId();
  const loading = state.status === 'idle' || state.status === 'loading';
  const hostingCheck = state.status === 'error' && state.recovery === 'hosting-check';
  useEffect(() => { void googleSignInReadiness.prepare(); }, []);
  useEffect(() => {
    const online = () => { if (googleSignInReadiness.getSnapshot().status === 'error') void googleSignInReadiness.prepare(); };
    window.addEventListener('online', online);
    return () => window.removeEventListener('online', online);
  }, []);
  return <>
    <button {...props} type="button" className={`${className || ''} disabled:opacity-60 disabled:cursor-wait`}
      title={state.status === 'error' ? state.message : props.title}
      disabled={loading || props.disabled} aria-busy={loading} aria-describedby={state.status === 'error' ? messageId : undefined}
      onClick={() => { if (googleSignInReadiness.getSnapshot().status === 'ready') onClick(); else void googleSignInReadiness.prepare(); }}>
      {loading ? <><Loader2 size={18} className="animate-spin shrink-0" /><span className={compact ? 'sr-only' : undefined}>Preparing Google sign-in…</span></> : state.status === 'error' ? <>{compact && <RefreshCw size={18} />}<span className={compact ? 'sr-only' : undefined}>Retry Google sign-in</span></> : children}
    </button>
    {hostingCheck ? <div className={compact ? 'mt-2' : 'mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30'}>
      <p id={messageId} role="alert" className={compact ? 'sr-only' : 'text-sm leading-relaxed text-amber-900 dark:text-amber-200'}>{state.message}</p>
      {/* Stay in this app's browser session. A different browser may not share the checkpoint session. */}
      <a href="/api/cloud-sync?security-check=1" target="_self" title="Open security check" aria-describedby={messageId}
        className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-3 py-2 font-semibold text-emerald-800 underline underline-offset-4 hover:bg-emerald-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-950 ${compact ? 'text-xs' : 'mt-2 w-full text-sm'}`}>
        <ShieldCheck size={18} className="shrink-0" /><span className={compact ? 'sr-only' : undefined}>Open security check</span>
      </a>
    </div> : state.status === 'error' && <p id={messageId} role="alert" className={compact ? 'sr-only' : 'mt-2 text-xs leading-relaxed text-amber-700 dark:text-amber-300'}>{state.message}</p>}
  </>;
}
