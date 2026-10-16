import React, { lazy, Suspense, useEffect, useState } from 'react';
import { LoginPage } from './LoginPage';
import { ErrorBoundary } from './ErrorBoundary';
import { OfflinePortfolio } from './OfflinePortfolio';
import { useTheme } from '../hooks/useTheme';
import { AppLoading } from './AppLoading';
const EntrySession = lazy(() => import('./EntrySession'));
const App = lazy(() => import('./App'));
const PasswordRecovery = lazy(() => import('./PasswordRecovery').then(m => ({ default: m.PasswordRecovery })));
const PublicGuideFallback = lazy(() => import('./PublicGuideFallback'));
export default function Entry() {
  const publicGuide = /^\/how-(?:to-use|it-works)\/?$/.test(window.location.pathname);
  return publicGuide ? <Suspense fallback={<AppLoading />}><PublicGuideFallback /></Suspense> : <AuthEntry />;
}
function AuthEntry() {
  useTheme();
  const [enter, setEnter] = useState(false);
  const [error, setError] = useState('');
  const recovery = window.location.pathname === '/reset-password';
  const loginOnly = window.location.pathname !== '/';
  useEffect(() => {
    if (!loginOnly) return;
    document.querySelector('meta[name="robots"]')?.setAttribute('content', 'noindex, follow');
    document.title = recovery ? 'Set your password | PSX Tracker' : 'Log in | PSX Tracker';
  }, [loginOnly, recovery]);
  return <ErrorBoundary><Suspense fallback={<AppLoading />}>
    {!recovery && !enter && navigator.onLine && <Suspense fallback={null}><EntrySession onEnter={setEnter} onError={setError} /></Suspense>}
    {error ? <main className="p-6"><h1 className="text-xl font-bold">Account switch paused</h1><p className="my-4">{error}</p><button onClick={()=>window.location.reload()} className="underline p-3">Retry</button></main> : recovery ? <PasswordRecovery /> : !navigator.onLine ? <OfflinePortfolio /> : enter ? <App /> : <LoginPage compact={loginOnly} onAuthSuccess={() => window.location.reload()} />}
  </Suspense></ErrorBoundary>;
}
