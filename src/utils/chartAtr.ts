import type { OhlcBar } from '../services/psxData';
import { atrSeries } from './awaisIndicators';

export function computeChartAtr(bars: OhlcBar[], period = 14): number[] {
  const p = Math.max(1, Math.floor(period) || 14);
  return atrSeries(bars, p);
}
