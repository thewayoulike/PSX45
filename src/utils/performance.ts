type Stage = 'session_ready' | 'access_check' | 'cached_portfolio' | 'drive_head' | 'drive_read' | 'drive_commit' | 'price_refresh';
declare global { interface Window { psxPerformance?: { record: (name: string, value: number, outcome?: string) => void; entries: () => unknown[] } } }
export function beginStage(name: Stage) {
  const start = performance.now();
  let ended = false;
  return (outcome: 'ok' | 'error' = 'ok') => {
    if (ended) return;
    ended = true;
    if (typeof window !== 'undefined') window.psxPerformance?.record(name, performance.now() - start, outcome);
  };
}
const startupMarks = new Set<Stage>();
export function markStartup(name: Stage) {
  if (startupMarks.has(name)) return;
  startupMarks.add(name);
  if (typeof window !== 'undefined') window.psxPerformance?.record(name, performance.now());
}
