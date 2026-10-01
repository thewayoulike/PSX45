/**
 * setInterval that pauses while the page is hidden. On return to the foreground it runs once if a
 * tick was missed, after a short random delay, so resumed screens don't all fetch in one burst
 * (bursts from one phone can trip the host's automatic DDoS protection).
 */
export function visibleInterval(fn: () => void, ms: number, { jitterMs = 2500 } = {}) {
  let last = Date.now();
  let catchUp: ReturnType<typeof setTimeout> | null = null;
  const hidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';
  const run = () => { last = Date.now(); fn(); };
  const timer = setInterval(() => { if (!hidden()) run(); }, ms);
  const onVisible = () => {
    if (hidden() || catchUp || Date.now() - last < ms) return;
    catchUp = setTimeout(() => { catchUp = null; if (!hidden()) run(); }, Math.random() * jitterMs);
  };
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    clearInterval(timer);
    if (catchUp) clearTimeout(catchUp);
    document.removeEventListener('visibilitychange', onVisible);
  };
}
