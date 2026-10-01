import React, { useEffect, useId, useSyncExternalStore } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { googleSignInReadiness } from '../services/driveStorage';

/** The real OAuth request stays synchronous with a ready user's tap (mobile popup rules). */
export function GoogleAuthButton({ onClick, children, className, compact = false, ...props }: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> & { onClick: () => void; compact?: boolean }) {
  const state = useSyncExternalStore(googleSignInReadiness.subscribe, googleSignInReadiness.getSnapshot, googleSignInReadiness.getSnapshot);
  const messageId = useId();
  const loading = state.status === 'idle' || state.status === 'loading';
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
    {state.status === 'error' && <p id={messageId} role="alert" className={compact ? 'sr-only' : 'mt-2 text-xs leading-relaxed text-amber-700 dark:text-amber-300'}>{state.message}</p>}
  </>;
}
