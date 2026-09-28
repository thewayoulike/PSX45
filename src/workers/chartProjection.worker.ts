import { computeInformedChartProjection } from '../utils/informedChartProjection';
import type { OhlcBar } from '../services/psxData';
import type { ProjectionHorizon } from '../utils/chartProjection';
self.onmessage = (event: MessageEvent<{ bars: OhlcBar[]; horizon: ProjectionHorizon; now: number }>) => {
  try { self.postMessage(computeInformedChartProjection(event.data.bars, event.data.horizon, event.data.now)); }
  catch { self.postMessage({ data: null, reason: 'The projection could not be calculated for this history. Refresh the daily chart and try again.' }); }
};
