import React, { lazy, Suspense, useEffect, useState } from 'react';
import { LoginPage } from './LoginPage';
import { ErrorBoundary } from './ErrorBoundary';
import { OfflinePortfolio } from './OfflinePortfolio';
import { getSession } from '../services/auth';
import { initDriveAuth, signInWithDrive } from '../services/driveStorage';
import { useTheme } from '../hooks/useTheme';
import { preparePortfolioAccount } from '../utils/localAccount';
import { DriveSetupPrompt } from './DriveSetupPrompt';
import { AppLoading } from './AppLoading';
import { markStartup } from '../utils/performance';
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
  useEffect(() => {
    if (recovery || enter || !navigator.onLine) return;
    let mounted = true;
    let started = false;
    const open = (email: string) => {
      if (!mounted || started) return;
      try { preparePortfolioAccount(email); started = true; markStartup('session_ready'); setEnter(true); }
      catch { setError('Your previous account’s records could not be archived. Free some device storage, then reload to switch accounts safely.'); }
    };
    void getSession().then(s => { if (s?.user.email) open(s.user.email); }).catch(() => {});
    const cleanup = initDriveAuth(user => open(user.email));
    return () => { mounted = false; cleanup(); };
  }, [recovery, enter]);
  return <ErrorBoundary><Suspense fallback={<AppLoading />}>
    <DriveSetupPrompt />
    {error ? <main className="p-6"><h1 className="text-xl font-bold">Account switch paused</h1><p className="my-4">{error}</p><button onClick={()=>window.location.reload()} className="underline p-3">Retry</button></main> : recovery ? <PasswordRecovery /> : !navigator.onLine ? <OfflinePortfolio /> : enter ? <App /> : <LoginPage compact={loginOnly} onGoogleLogin={() => signInWithDrive()} onAuthSuccess={() => window.location.reload()} />}
  </Suspense></ErrorBoundary>;
}
