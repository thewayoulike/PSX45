import React, { useEffect } from 'react';
import { getSession } from '../services/auth';
import { initDriveAuth } from '../services/driveStorage';
import { preparePortfolioAccount } from '../utils/localAccount';
import { markStartup } from '../utils/performance';
import { DriveSetupPrompt } from './DriveSetupPrompt';

/** Restore both sign-in methods without making the public hero wait for auth code. */
export default function EntrySession({ onEnter, onError }: {
  onEnter: (ready: boolean) => void;
  onError: (message: string) => void;
}) {
  useEffect(() => {
    let mounted = true;
    let started = false;
    const open = (email: string) => {
      if (!mounted || started) return;
      try {
        preparePortfolioAccount(email);
        started = true;
        markStartup('session_ready');
        onEnter(true);
      } catch {
        onError('Your previous account’s records could not be archived. Free some device storage, then reload to switch accounts safely.');
      }
    };
    void getSession().then(s => { if (s?.user.email) open(s.user.email); }).catch(() => {});
    // Restoring a token needs no Google UI. GoogleAuthButton prepares the SDK
    // when the form is needed, keeping its popup call synchronous on a tap.
    const cleanup = initDriveAuth(user => open(user.email), { prepareSignIn: false });
    return () => { mounted = false; cleanup(); };
  }, [onEnter, onError]);
  return <DriveSetupPrompt />;
}
