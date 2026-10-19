export const UNSAVED_LOGOUT_MESSAGE = 'Your latest changes have not saved to Google Drive yet. Cancel to stay and finish syncing, or OK to sign out with a recovery copy kept on this device. Sign out anyway?';

/** Browsers control the close-dialog wording. Persist before mobile backgrounding too. */
export function installCloudExitGuard(target: Window, document: Document, hasUnsaved: () => boolean, preserve: () => void) {
  const keepDraft = () => { try { preserve(); } catch { /* A close warning must still appear if storage is full. */ } };
  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (!hasUnsaved()) return;
    keepDraft();
    event.preventDefault();
    event.returnValue = '';
  };
  const onHide = () => { if (document.visibilityState === 'hidden' && hasUnsaved()) keepDraft(); };
  target.addEventListener('beforeunload', beforeUnload);
  document.addEventListener('visibilitychange', onHide);
  return () => { target.removeEventListener('beforeunload', beforeUnload); document.removeEventListener('visibilitychange', onHide); };
}
