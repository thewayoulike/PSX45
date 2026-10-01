// AbortSignal.timeout is missing before Chrome 103 / Safari 16 (iOS 15, older Android WebViews).
// Sign-in and sync use it, so without this they always failed on those devices.
export function installAbortSignalTimeout(target: typeof AbortSignal | undefined = globalThis.AbortSignal) {
  if (!target || typeof (target as any).timeout === 'function') return;
  (target as any).timeout = (ms: number) => {
    const controller = new AbortController();
    setTimeout(() => {
      let reason: unknown;
      try { reason = new DOMException('The operation timed out.', 'TimeoutError'); } catch { reason = Object.assign(new Error('The operation timed out.'), { name: 'TimeoutError' }); }
      (controller.abort as (r?: unknown) => void)(reason);
    }, ms);
    return controller.signal;
  };
}
installAbortSignalTimeout();
