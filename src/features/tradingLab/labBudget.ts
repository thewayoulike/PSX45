// One request budget for every Trading Lab feed call: scans, monitors, research and target data.
// It paces by time, not response speed, so cached responses cannot turn a scan into a burst
// (bursts from one phone can trip the host's automatic DDoS protection and the per-IP limits).
export const LAB_REQUEST_INTERVAL_MS = 1200; // about 50 requests a minute across the whole Lab
let interval = LAB_REQUEST_INTERVAL_MS;
/** Tests set 0; the app always uses the default. */
export function setLabRequestInterval(ms: number) { interval = ms; nextSlot = 0; }

let nextSlot = 0;
const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) return reject(new DOMException('Cancelled', 'AbortError'));
  const timer = setTimeout(() => { signal?.removeEventListener('abort', stop); resolve(); }, ms);
  const stop = () => { clearTimeout(timer); reject(new DOMException('Cancelled', 'AbortError')); };
  signal?.addEventListener('abort', stop, { once: true });
});

/** Waits for the next free request slot. Slots are reserved in call order. */
export async function takeLabSlot(signal?: AbortSignal, now = Date.now) {
  const start = Math.max(now(), nextSlot);
  nextSlot = start + interval;
  const wait = start - now();
  if (wait > 0) await sleep(wait, signal);
}

export const waitFor = sleep;
export function resetLabBudget() { nextSlot = 0; }

/** Symbols the server accepts (lib/psxOhlc.js and lib/marketLimits.js allow 12 characters). */
export const LAB_SYMBOL = /^[A-Z][A-Z0-9.-]{0,11}$/;
