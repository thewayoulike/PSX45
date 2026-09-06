import type { OhlcBar } from '../services/psxData';
import { findSwingPivots } from './autoTrendlines';

export type RsiDivergenceKind = 'bull' | 'bear';

export interface RsiDivergenceMarker {
  i: number;
  kind: RsiDivergenceKind;
}

export interface RsiDivergenceOptions {
  pivotLength?: number;
  maxMarkers?: number;
}

function finiteAt(values: (number | null | undefined)[], i: number): number | null {
  const v = values[i];
  return v != null && Number.isFinite(v) ? v : null;
}

function divergenceFromPivots(
  pivots: { i: number; price: number }[],
  rsi: (number | null | undefined)[],
  kind: RsiDivergenceKind
): RsiDivergenceMarker[] {
  const out: RsiDivergenceMarker[] = [];
  for (let idx = 1; idx < pivots.length; idx += 1) {
    const prev = pivots[idx - 1];
    const cur = pivots[idx];
    const prevRsi = finiteAt(rsi, prev.i);
    const curRsi = finiteAt(rsi, cur.i);
    if (prevRsi == null || curRsi == null) continue;

    if (kind === 'bull' && cur.price < prev.price && curRsi > prevRsi) {
      out.push({ i: cur.i, kind });
    }
    if (kind === 'bear' && cur.price > prev.price && curRsi < prevRsi) {
      out.push({ i: cur.i, kind });
    }
  }
  return out;
}

export function computeRsiDivergence(
  bars: OhlcBar[],
  rsi: (number | null | undefined)[],
  options: RsiDivergenceOptions = {}
): RsiDivergenceMarker[] {
  if (bars.length < 5 || rsi.length !== bars.length) return [];
  const pivotLength = Math.max(2, Math.min(50, Math.floor(options.pivotLength ?? 5) || 5));
  const maxMarkers = Math.max(1, Math.floor(options.maxMarkers ?? 6) || 6);
  const { highs, lows } = findSwingPivots(bars, pivotLength);
  return [
    ...divergenceFromPivots(lows, rsi, 'bull'),
    ...divergenceFromPivots(highs, rsi, 'bear'),
  ]
    .sort((a, b) => a.i - b.i)
    .slice(-maxMarkers);
}
