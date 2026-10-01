import { ApiResponseError } from './apiResponse';
export type GoogleSignInState = { status: 'idle' | 'loading' | 'ready' | 'error'; message: string };
const SCRIPT_ID = 'google-gsi-script';
let scriptRequest: Promise<void> | null = null;
const libraryReady = () => !!window.google?.accounts?.oauth2;

/** Shared, bounded SDK load. A failed script can be replaced on an explicit retry. */
export function loadGoogleIdentityScript(): Promise<void> {
  if (libraryReady()) return Promise.resolve();
  if (scriptRequest) return scriptRequest;
  const request = new Promise<void>((resolve, reject) => {
    let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    const isNew = !script;
    if (!script) {
      script = document.createElement('script');
      script.id = SCRIPT_ID;
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
    }
    const cleanup = () => {
      clearTimeout(timeout); clearInterval(poll);
      script?.removeEventListener('load', loaded);
      script?.removeEventListener('error', failed);
    };
    const loaded = () => { if (libraryReady()) { cleanup(); resolve(); } };
    const failed = () => {
      cleanup(); script?.remove();
      reject(new Error('Google sign-in could not load. Check your connection, then retry. If it keeps failing, open PSX Tracker directly in Chrome.'));
    };
    const timeout = setTimeout(failed, 12000);
    const poll = setInterval(loaded, 200);
    script.addEventListener('load', loaded);
    script.addEventListener('error', failed);
    if (isNew) document.head.appendChild(script);
    loaded();
  });
  scriptRequest = request;
  // Clear both success and failure so a later failed/missing SDK can be retried.
  void request.then(() => { scriptRequest = null; }, () => { scriptRequest = null; });
  return request;
}

/** Preparing never launches an OAuth popup: that must remain in a fresh button click. */
export function createGoogleSignInReadiness(prepareConfig: () => Promise<unknown>) {
  let state: GoogleSignInState = { status: 'idle', message: '' };
  let pending: Promise<void> | null = null;
  const listeners = new Set<() => void>();
  const publish = (next: GoogleSignInState) => { state = next; listeners.forEach(listener => listener()); };
  const configWithRetry = async () => {
    try { await prepareConfig(); }
    catch (error) {
      if (error instanceof ApiResponseError && error.kind === 'hosting-check') throw error;
      await new Promise(resolve => setTimeout(resolve, 600));
      try { await prepareConfig(); }
      catch (retryError) {
        if (retryError instanceof ApiResponseError && retryError.kind === 'hosting-check') throw retryError;
        const detail = retryError instanceof ApiResponseError ? ` (HTTP ${retryError.status})` : '';
        throw new Error(`Google sign-in could not connect to PSX Tracker${detail}. Check your connection, then retry. You can also use email and password if already set up.`);
      }
    }
  };
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    prepare() {
      if (pending) return pending;
      if (state.status === 'ready' && libraryReady()) return Promise.resolve();
      publish({ status: 'loading', message: 'Preparing Google sign-in…' });
      pending = Promise.all([loadGoogleIdentityScript(), configWithRetry()]).then(
        () => { publish({ status: 'ready', message: '' }); },
        error => { publish({ status: 'error', message: error instanceof Error ? error.message : 'Google sign-in could not load. Please retry.' }); },
      ).finally(() => { pending = null; });
      return pending;
    },
  };
}
