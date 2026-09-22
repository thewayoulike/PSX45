let unsavedLocalChanges = false;
let editorOpen = false;
let recovering: Promise<RecoveryStatus> | null = null;
export type RecoveryStatus = 'reloading' | 'unsaved' | 'other-tabs' | 'offline' | 'unavailable' | 'cooldown';
export const setUnsavedLocalChanges = (value: boolean) => { unsavedLocalChanges = value; };
export const setRecoveryEditorOpen = (value: boolean) => { editorOpen = value; };
export const isMissingChunk = (error: Error) => /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk .+ failed/i.test(error.message);

function safeToReload() {
  if (unsavedLocalChanges || editorOpen) return false;
  try {
    for (let i = 0; i < localStorage.length; i++) if (localStorage.key(i)?.startsWith('psx_pending_cloud_v1:')) return false;
    return true;
  } catch { return false; }
}
const bounded = <T>(promise: Promise<T>, milliseconds: number): Promise<T> => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Update timed out')), milliseconds);
  promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
});

async function installedUpdate(reg: ServiceWorkerRegistration) {
  if (reg.waiting) return reg.waiting;
  const worker = reg.installing;
  if (!worker) return null;
  return new Promise<ServiceWorker | null>(resolve => {
    const timer = setTimeout(() => finish(null), 8000);
    const finish = (result: ServiceWorker | null) => { clearTimeout(timer); worker.removeEventListener('statechange', changed); resolve(result); };
    const changed = () => {
      if (worker.state === 'installed') finish(reg.waiting || worker);
      if (worker.state === 'redundant') finish(null);
    };
    worker.addEventListener('statechange', changed);
    changed();
  });
}

async function activateUpdate(worker: ServiceWorker): Promise<'activated' | 'other-tabs' | 'unavailable'> {
  const container = navigator.serviceWorker;
  const original = container.controller;
  return new Promise(resolve => {
    const channel = new MessageChannel();
    const finish = (result: 'activated' | 'other-tabs' | 'unavailable') => {
      clearTimeout(timer); container.removeEventListener('controllerchange', changed);
      channel.port1.close(); channel.port2.close(); resolve(result);
    };
    const changed = () => { if (container.controller !== original) finish('activated'); };
    const timer = setTimeout(() => finish('unavailable'), 10_000);
    container.addEventListener('controllerchange', changed);
    channel.port1.onmessage = event => {
      if (event.data?.status === 'other-tabs') finish('other-tabs');
      if (event.data?.status === 'unavailable') finish('unavailable');
    };
    try { worker.postMessage({ type: 'PSX_RECOVER_VERSION' }, [channel.port2]); }
    catch { finish('unavailable'); }
  });
}

/** Recover the app shell only. Never clear authentication, portfolio data or pending backups. */
export function recoverAppVersion(manual = false): Promise<RecoveryStatus> {
  if (recovering) return recovering;
  const run = async (): Promise<RecoveryStatus> => {
    if (!navigator.onLine) return 'offline';
    if (!safeToReload()) return 'unsaved';
    try {
      const previous = Number(sessionStorage.getItem('psx_chunk_reload') || 0);
      if (!manual && Date.now() - previous < 120_000) return 'cooldown';
      sessionStorage.setItem('psx_chunk_reload', String(Date.now()));
      if ('serviceWorker' in navigator) {
        const reg = await bounded(navigator.serviceWorker.getRegistration(), 5000);
        if (reg) {
          await bounded(reg.update(), 8000);
          const worker = await installedUpdate(reg);
          if (!safeToReload()) return 'unsaved';
          if (worker) {
            const result = await activateUpdate(worker);
            if (result !== 'activated') return result;
          }
        }
      }
      if (!safeToReload()) return 'unsaved';
      window.location.reload();
      return 'reloading';
    } catch { return 'unavailable'; }
  };
  recovering = run().finally(() => { recovering = null; });
  return recovering;
}
export async function recoverMissingChunk(error: Error): Promise<boolean> {
  return isMissingChunk(error) && await recoverAppVersion() === 'reloading';
}
