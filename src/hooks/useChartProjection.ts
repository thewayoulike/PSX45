import { useEffect, useState } from 'react';
import type { OhlcBar } from '../services/psxData';
import type { ProjectionHorizon, ProjectionResult } from '../utils/chartProjection';

/** Heavy replay calculations stay off the chart/UI thread; stale workers are cancelled. */
export function useChartProjection(bars: OhlcBar[], horizon: ProjectionHorizon, enabled: boolean, identity: string) {
  const [state, setState] = useState<{ bars: OhlcBar[]; horizon: number; identity: string; result: ProjectionResult } | null>(null);
  useEffect(() => {
    if (!enabled || !bars.length) return;
    let worker: Worker | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const fail = () => setState({ bars, horizon, identity, result: { data: null, reason: 'Background calculation is unavailable in this browser. Please refresh or use an updated browser.' } });
    try {
      worker = new Worker(new URL('../workers/chartProjection.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = event => { clearTimeout(timer); setState({ bars, horizon, identity, result: event.data }); };
      worker.onerror = () => { clearTimeout(timer); fail(); };
      timer = setTimeout(() => { worker?.terminate(); setState({ bars, horizon, identity, result: { data: null, reason: 'The historical check took too long. Refresh the daily chart to try again.' } }); }, 20000);
      worker.postMessage({ bars, horizon, now: Date.now() });
    } catch { fail(); }
    return () => { clearTimeout(timer); worker?.terminate(); };
  }, [bars, horizon, enabled, identity]);
  const result = enabled && state?.bars === bars && state.horizon === horizon && state.identity === identity ? state.result : null;
  return { result, calculating: enabled && !!bars.length && !result };
}
