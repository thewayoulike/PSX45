// Registration does not compete with the initial render.
if ('serviceWorker' in navigator) {
  let lastCheck = Date.now();
  const register = () => navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).then(reg => {
    // An installed app resumed from the background never navigates, so the browser never
    // looks for a new version. Check on return to the foreground, at most every 30 minutes.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible' || !navigator.onLine || Date.now() - lastCheck < 30 * 60000) return;
      lastCheck = Date.now();
      reg.update().catch(() => {});
    });
  }).catch(() => {});
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
