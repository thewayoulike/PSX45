import type { OhlcBar } from '../services/psxData';

export interface AutoTrendlineSettings {
  enabled: boolean;
  showSupport: boolean;
  showResistance: boolean;
  supportColor: string;
  resistanceColor: string;
  pivotLength: number;
  extendRight: boolean;
  /** When price closes through a line, drop it and try the previous pivot pair. */
  breakAndRebuild: boolean;
}

export interface AutoTrendlineSegment {
  kind: 'support' | 'resistance';
  i0: number;
  price0: number;
  i1: number;
  price1: number;
}

export interface AutoTrendlineResult {
  support: AutoTrendlineSegment | null;
  resistance: AutoTrendlineSegment | null;
}

export const DEFAULT_AUTO_TRENDLINES: AutoTrendlineSettings = {
  enabled: false,
  showSupport: true,
  showResistance: true,
  supportColor: '#000000',
  resistanceColor: '#000000',
  pivotLength: 5,
  extendRight: true,
  breakAndRebuild: true,
};

export function cloneAutoTrendlineSettings(s: AutoTrendlineSettings): AutoTrendlineSettings {
  return { ...s };
}

function isPivotHigh(highs: number[], i: number, left: number, right: number): boolean {
  const v = highs[i];
  if (!Number.isFinite(v)) return false;
  for (let j = i - left; j <= i + right; j++) {
    if (j === i) continue;
    if (highs[j] >= v) return false;
  }
  return true;
}

function isPivotLow(lows: number[], i: number, left: number, right: number): boolean {
  const v = lows[i];
  if (!Number.isFinite(v)) return false;
  for (let j = i - left; j <= i + right; j++) {
    if (j === i) continue;
    if (lows[j] <= v) return false;
  }
  return true;
}

export function findSwingPivots(
  bars: OhlcBar[],
  pivotLength: number
): { highs: { i: number; price: number }[]; lows: { i: number; price: number }[] } {
  const left = Math.max(2, Math.min(50, Math.floor(pivotLength) || 5));
  const right = left;
  const highsArr = bars.map((b) => b.high);
  const lowsArr = bars.map((b) => b.low);
  const highs: { i: number; price: number }[] = [];
  const lows: { i: number; price: number }[] = [];
  for (let i = left; i < bars.length - right; i++) {
    if (isPivotHigh(highsArr, i, left, right)) highs.push({ i, price: highsArr[i] });
    if (isPivotLow(lowsArr, i, left, right)) lows.push({ i, price: lowsArr[i] });
  }
  return { highs, lows };
}

export function extendTrendlineToIndex(seg: AutoTrendlineSegment, i: number): number {
  const dx = seg.i1 - seg.i0;
  if (dx === 0) return seg.price1;
  const slope = (seg.price1 - seg.price0) / dx;
  return seg.price0 + slope * (i - seg.i0);
}

/** True if any close after the second pivot pierces the line (resistance: close above; support: close below). */
export function isLineBroken(
  bars: OhlcBar[],
  seg: AutoTrendlineSegment,
  kind: 'support' | 'resistance'
): boolean {
  const start = seg.i1 + 1;
  for (let i = start; i < bars.length; i++) {
    const linePx = extendTrendlineToIndex(seg, i);
    const c = bars[i].close;
    if (!Number.isFinite(c) || !Number.isFinite(linePx)) continue;
    if (kind === 'resistance' && c > linePx) return true;
    if (kind === 'support' && c < linePx) return true;
  }
  return false;
}

function pickUnbrokenPair(
  pivots: { i: number; price: number }[],
  bars: OhlcBar[],
  kind: 'support' | 'resistance',
  breakAndRebuild: boolean
): AutoTrendlineSegment | null {
  if (pivots.length < 2) return null;

  for (let end = pivots.length - 1; end >= 1; end--) {
    const a = pivots[end - 1];
    const b = pivots[end];
    const seg: AutoTrendlineSegment = {
      kind,
      i0: a.i,
      price0: a.price,
      i1: b.i,
      price1: b.price,
    };
    if (!breakAndRebuild || !isLineBroken(bars, seg, kind)) return seg;
  }
  return null;
}

export function computeAutoTrendlines(
  bars: OhlcBar[],
  settings: AutoTrendlineSettings
): AutoTrendlineResult {
  if (!settings.enabled || !bars.length) {
    return { support: null, resistance: null };
  }

  const { highs: pivotHighs, lows: pivotLows } = findSwingPivots(bars, settings.pivotLength);

  const resistance = settings.showResistance
    ? pickUnbrokenPair(pivotHighs, bars, 'resistance', settings.breakAndRebuild)
    : null;
  const support = settings.showSupport
    ? pickUnbrokenPair(pivotLows, bars, 'support', settings.breakAndRebuild)
    : null;

  return { support, resistance };
}

/** Normalize partial/legacy saved settings. */
export function normalizeAutoTrendlineSettings(raw: unknown): AutoTrendlineSettings {
  const base = cloneAutoTrendlineSettings(DEFAULT_AUTO_TRENDLINES);
  if (!raw || typeof raw !== 'object') return base;
  const o = raw as Partial<AutoTrendlineSettings>;
  if (typeof o.enabled === 'boolean') base.enabled = o.enabled;
  if (typeof o.showSupport === 'boolean') base.showSupport = o.showSupport;
  if (typeof o.showResistance === 'boolean') base.showResistance = o.showResistance;
  if (typeof o.supportColor === 'string' && o.supportColor) base.supportColor = o.supportColor;
  if (typeof o.resistanceColor === 'string' && o.resistanceColor) base.resistanceColor = o.resistanceColor;
  if (typeof o.pivotLength === 'number' && o.pivotLength >= 2) {
    base.pivotLength = Math.min(50, Math.floor(o.pivotLength));
  }
  if (typeof o.extendRight === 'boolean') base.extendRight = o.extendRight;
  if (typeof o.breakAndRebuild === 'boolean') base.breakAndRebuild = o.breakAndRebuild;
  return base;
}
