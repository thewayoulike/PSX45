let unsavedLocalChanges = false;
let editorOpen = false;
let recovering: Promise<RecoveryStatus> | null = null;
export type RecoveryStatus = 'reloading' | 'unsaved' | 'other-tabs' | 'offline' | 'unavailable' | 'cooldown';
export const setUnsavedLocalChanges = (value: boolean) => { unsavedLocalChanges = value; };
export const setRecoveryEditorOpen = (value: boolean) => { editorOpen = value; };
// Chrome, Safari and Firefox wordings for an app file removed by a newer release.
export const isMissingChunk = (error: unknown) => error instanceof Error && /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk .+ failed/i.test(error.message);
export const TOOL_UPDATE_REQUIRED = 'PSX Tracker was updated while this screen was open, so its tool files changed. Update the app to continue. Your saved records and pending backup are kept; anything typed in this panel is not.';
export const recoveryMessages: Record<RecoveryStatus, string> = {
  reloading: 'Opening the current app version…',
  unsaved: 'Automatic reload is paused to protect edits or a pending backup. Your saved records remain available below.',
  'other-tabs': 'Close other PSX Tracker tabs or app windows, then retry the update. This protects edits in those windows.',
  offline: 'You are offline. Reconnect to update, or view the records saved on this device.',
  unavailable: 'The update could not finish. Check your connection, then retry. If it persists, close all PSX Tracker windows and reopen the app.',
  cooldown: 'The screen still could not open after reloading. Retry the update or view your saved records.',
};

// `editorConfirmed`: the person chose to leave the open panel. Edits and pending backups still block.
function safeToReload(editorConfirmed = false) {
  if (unsavedLocalChanges || (editorOpen && !editorConfirmed)) return false;
  try {
    for (let i = 0; i < localStorage.length; i++) if (localStorage.key(i)?.startsWith('psx_pending_cloud_v1:')) return false;
    return true;
  } catch { return false; }
}
const bounded = <T>(promise: Promise<T>, milliseconds: number): Promise<T> => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Update timed out')), milliseconds);
  promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
});

export const INSTALL_WAIT_MS = 30_000;
async function installedUpdate(reg: ServiceWorkerRegistration) {
  if (reg.waiting) return reg.waiting;
  const worker = reg.installing;
  if (!worker) return null;
  return new Promise<ServiceWorker | null>(resolve => {
    // The update downloads every screen's files (~1 MB on mobile), so allow it time to finish.
    // On timeout the reload still opens a consistent version: fresh HTML, or the installed shell.
    const timer = setTimeout(() => finish(null), INSTALL_WAIT_MS);
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
export function recoverAppVersion(manual = false, editorConfirmed = false): Promise<RecoveryStatus> {
  if (recovering) return recovering;
  const run = async (): Promise<RecoveryStatus> => {
    if (!navigator.onLine) return 'offline';
    if (!safeToReload(editorConfirmed)) return 'unsaved';
    try {
      const previous = Number(sessionStorage.getItem('psx_chunk_reload') || 0);
      if (!manual && Date.now() - previous < 120_000) return 'cooldown';
      sessionStorage.setItem('psx_chunk_reload', String(Date.now()));
      if ('serviceWorker' in navigator) {
        const reg = await bounded(navigator.serviceWorker.getRegistration(), 5000);
        if (reg) {
          await bounded(reg.update(), 8000);
          const worker = await installedUpdate(reg);
          if (!safeToReload(editorConfirmed)) return 'unsaved';
          if (worker) {
            const result = await activateUpdate(worker);
            if (result !== 'activated') return result;
          }
        }
      }
      if (!safeToReload(editorConfirmed)) return 'unsaved';
      window.location.reload();
      return 'reloading';
    } catch { return 'unavailable'; }
  };
  recovering = run().finally(() => { recovering = null; });
  return recovering;
}
export async function recoverMissingChunk(error: unknown): Promise<boolean> {
  return isMissingChunk(error) && await recoverAppVersion() === 'reloading';
}
