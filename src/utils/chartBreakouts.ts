import type { OhlcBar } from '../services/psxData';
import {
  extendTrendlineToIndex,
  findSwingPivots,
  type AutoTrendlineSegment,
  type AutoTrendlineSettings,
} from './autoTrendlines';

export interface ChartBreakoutMarker {
  i: number;
  kind: 'breakout' | 'breakdown';
  linePrice: number;
  confirmed: boolean;
}

export interface ChartBreakoutOptions {
  volumeSpikeFlags?: boolean[];
  volumeConfirmBreaks?: boolean;
}

/**
 * Mark first closes that pierce swing trendlines.
 * Uses consecutive swing pivots (not only the currently unbroken overlay line),
 * so historical breaks remain visible after break-and-rebuild drops that line.
 */
export function computeChartBreakouts(
  bars: OhlcBar[],
  settings: AutoTrendlineSettings,
  options: ChartBreakoutOptions = {}
): ChartBreakoutMarker[] {
  if (bars.length < 3) return [];

  const pivotLength = Math.max(2, settings.pivotLength || 5);
  const { highs, lows } = findSwingPivots(bars, pivotLength);
  const markers: ChartBreakoutMarker[] = [];
  const seen = new Set<string>();

  const pushUnique = (m: ChartBreakoutMarker) => {
    const key = `${m.kind}:${m.i}`;
    if (seen.has(key)) return;
    seen.add(key);
    markers.push(m);
  };

  for (let p = 1; p < highs.length; p += 1) {
    const a = highs[p - 1];
    const b = highs[p];
    const seg: AutoTrendlineSegment = {
      kind: 'resistance',
      i0: a.i,
      price0: a.price,
      i1: b.i,
      price1: b.price,
    };
    collectFirstBreak(pushUnique, bars, seg, 'breakout', options);
  }

  for (let p = 1; p < lows.length; p += 1) {
    const a = lows[p - 1];
    const b = lows[p];
    const seg: AutoTrendlineSegment = {
      kind: 'support',
      i0: a.i,
      price0: a.price,
      i1: b.i,
      price1: b.price,
    };
    collectFirstBreak(pushUnique, bars, seg, 'breakdown', options);
  }

  return markers.sort((a, b) => a.i - b.i || a.kind.localeCompare(b.kind));
}

/** Map full-series breakout indices into the visible viewport (or drop if off-screen). */
export function mapBreakoutsToViewport(
  markers: ChartBreakoutMarker[],
  viewStart: number,
  visibleCount: number
): ChartBreakoutMarker[] {
  if (visibleCount <= 0) return [];
  return markers
    .map((m) => ({ ...m, i: m.i - viewStart }))
    .filter((m) => m.i >= 0 && m.i < visibleCount);
}

function collectFirstBreak(
  push: (m: ChartBreakoutMarker) => void,
  bars: OhlcBar[],
  segment: AutoTrendlineSegment,
  kind: ChartBreakoutMarker['kind'],
  options: ChartBreakoutOptions
): void {
  let wasBeyond = false;
  for (let i = segment.i1 + 1; i < bars.length; i += 1) {
    const close = bars[i]?.close;
    const linePrice = extendTrendlineToIndex(segment, i);
    if (!Number.isFinite(close) || !Number.isFinite(linePrice)) continue;

    const isBeyond = kind === 'breakout' ? close > linePrice : close < linePrice;
    if (!isBeyond) {
      wasBeyond = false;
      continue;
    }
    if (wasBeyond) continue;
    wasBeyond = true;

    const confirmed = options.volumeConfirmBreaks ? options.volumeSpikeFlags?.[i] === true : true;
    push({ i, kind, linePrice, confirmed });
    // Only the first pierce of this swing pair — later retests stay quiet.
    return;
  }
}
