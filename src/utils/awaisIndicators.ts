import type { OhlcBar } from '../services/psxData';

export const MA_PERIODS = [5, 10, 50, 100, 200] as const;
export type MaPeriod = (typeof MA_PERIODS)[number];

export type MaLineSelection = Record<MaPeriod, boolean>;

export const DEFAULT_MA_SELECTION: MaLineSelection = {
  5: true,
  10: true,
  50: true,
  100: true,
  200: true,
};

export type BbKey = 'fill' | 'upper' | 'middle' | 'lower';
export type BbSelection = Record<BbKey, boolean>;

export type SupertrendKey = 'up' | 'down';
export type SupertrendSelection = Record<SupertrendKey, boolean>;

export const PIVOT_LABELS = ['P', 'R1', 'R2', 'R3', 'S1', 'S2', 'S3'] as const;
export type PivotLabel = (typeof PIVOT_LABELS)[number];
export type PivotSelection = Record<PivotLabel, boolean>;

export type IchimokuKey = 'cloud' | 'conversion' | 'base' | 'spanA' | 'spanB';
export type IchimokuSelection = Record<IchimokuKey, boolean>;

export interface AwaisLayers {
  maLines: MaLineSelection;
  bb: BbSelection;
  supertrend: SupertrendSelection;
  pivot: PivotSelection;
  ichimoku: IchimokuSelection;
}

export const DEFAULT_BB_SELECTION: BbSelection = {
  fill: true,
  upper: true,
  middle: true,
  lower: true,
};

export const DEFAULT_SUPERTREND_SELECTION: SupertrendSelection = {
  up: true,
  down: true,
};

export const DEFAULT_PIVOT_SELECTION: PivotSelection = {
  P: true,
  R1: true,
  R2: true,
  R3: true,
  S1: true,
  S2: true,
  S3: true,
};

export const DEFAULT_ICHI_SELECTION: IchimokuSelection = {
  cloud: true,
  conversion: true,
  base: true,
  spanA: true,
  spanB: true,
};

export const DEFAULT_AWAIS_LAYERS: AwaisLayers = {
  maLines: { ...DEFAULT_MA_SELECTION },
  bb: { ...DEFAULT_BB_SELECTION },
  supertrend: { ...DEFAULT_SUPERTREND_SELECTION },
  pivot: { ...DEFAULT_PIVOT_SELECTION },
  ichimoku: { ...DEFAULT_ICHI_SELECTION },
};

export const AWAIS_BB_OPTIONS: { key: BbKey; label: string; color: string }[] = [
  { key: 'fill', label: 'BB Fill', color: '#e2e8f0' },
  { key: 'upper', label: 'Upper Band', color: '#2962FF' },
  { key: 'middle', label: 'Basis', color: '#100c09' },
  { key: 'lower', label: 'Lower Band', color: '#2962FF' },
];

export const AWAIS_SUPERTREND_OPTIONS: { key: SupertrendKey; label: string; color: string }[] = [
  { key: 'up', label: 'Up Trend', color: '#22c55e' },
  { key: 'down', label: 'Down Trend', color: '#ef4444' },
];

export const AWAIS_PIVOT_OPTIONS: { key: PivotLabel; label: string; color: string }[] = [
  { key: 'P', label: 'Pivot (P)', color: '#FB8C00' },
  { key: 'R1', label: 'Resistance 1', color: '#FB8C00' },
  { key: 'R2', label: 'Resistance 2', color: '#FB8C00' },
  { key: 'R3', label: 'Resistance 3', color: '#FB8C00' },
  { key: 'S1', label: 'Support 1', color: '#FB8C00' },
  { key: 'S2', label: 'Support 2', color: '#FB8C00' },
  { key: 'S3', label: 'Support 3', color: '#FB8C00' },
];

export const AWAIS_ICHI_OPTIONS: { key: IchimokuKey; label: string; color: string }[] = [
  { key: 'cloud', label: 'Cloud Fill', color: '#43A047' },
  { key: 'conversion', label: 'Conversion Line', color: '#2962FF' },
  { key: 'base', label: 'Base Line', color: '#B71C1C' },
  { key: 'spanA', label: 'Senkou Span A', color: '#A5D6A7' },
  { key: 'spanB', label: 'Senkou Span B', color: '#EF9A9A' },
];

export const AWAIS_MA_LINES: { period: MaPeriod; type: 'SMA'; color: string; label: string }[] = [
  { period: 5, type: 'SMA', color: '#97F592', label: 'MA 5' },
  { period: 10, type: 'SMA', color: '#15A24B', label: 'MA 10' },
  { period: 50, type: 'SMA', color: '#f22828', label: 'MA 50' },
  { period: 100, type: 'SMA', color: '#e6b00c', label: 'MA 100' },
  { period: 200, type: 'SMA', color: '#7b49e7', label: 'MA 200' },
];

export function hasAnyMaLine(maLines: MaLineSelection): boolean {
  return MA_PERIODS.some((p) => maLines[p]);
}

export function isMaPeriodEnabled(maLines: MaLineSelection, period: number): boolean {
  return MA_PERIODS.includes(period as MaPeriod) && maLines[period as MaPeriod];
}

export function hasAnyBb(bb: BbSelection): boolean {
  return Object.values(bb).some(Boolean);
}

export function hasAnySupertrend(st: SupertrendSelection): boolean {
  return st.up || st.down;
}

export function hasAnyPivot(pivot: PivotSelection): boolean {
  return PIVOT_LABELS.some((k) => pivot[k]);
}

export function hasAnyIchimoku(ichi: IchimokuSelection): boolean {
  return Object.values(ichi).some(Boolean);
}

export function countAwaisActiveLayers(layers: AwaisLayers): { active: number; total: number } {
  const total =
    MA_PERIODS.length +
    AWAIS_BB_OPTIONS.length +
    AWAIS_SUPERTREND_OPTIONS.length +
    AWAIS_PIVOT_OPTIONS.length +
    AWAIS_ICHI_OPTIONS.length;
  let active = MA_PERIODS.filter((p) => layers.maLines[p]).length;
  active += AWAIS_BB_OPTIONS.filter((o) => layers.bb[o.key]).length;
  active += AWAIS_SUPERTREND_OPTIONS.filter((o) => layers.supertrend[o.key]).length;
  active += AWAIS_PIVOT_OPTIONS.filter((o) => layers.pivot[o.key]).length;
  active += AWAIS_ICHI_OPTIONS.filter((o) => layers.ichimoku[o.key]).length;
  return { active, total };
}

export interface MaLineSeries {
  period: number;
  color: string;
  values: (number | null)[];
}

export interface PivotLevel {
  label: string;
  value: number;
}

export interface AwaisOverlayData {
  maLines: MaLineSeries[];
  bb: { upper: (number | null)[]; middle: (number | null)[]; lower: (number | null)[] };
  supertrend: { up: (number | null)[]; down: (number | null)[] };
  ichimoku: {
    conversion: (number | null)[];
    base: (number | null)[];
    spanA: (number | null)[];
    spanB: (number | null)[];
    displacement: number;
  };
  pivots: PivotLevel[];
}

function smaSeries(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    let s = 0;
    for (let j = i - period + 1; j <= i; j++) s += values[j];
    out[i] = s / period;
  }
  return out;
}

function emaSeries(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period) return out;
  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i];
  out[period - 1] = seed / period;
  const k = 2 / (period + 1);
  for (let i = period; i < values.length; i++) {
    out[i] = values[i] * k + out[i - 1]! * (1 - k);
  }
  return out;
}

function wmaSeries(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  const denom = (period * (period + 1)) / 2;
  for (let i = period - 1; i < values.length; i++) {
    let s = 0;
    for (let j = 0; j < period; j++) s += values[i - j] * (period - j);
    out[i] = s / denom;
  }
  return out;
}

function rmaSeries(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period) return out;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  out[period - 1] = sum / period;
  for (let i = period; i < values.length; i++) {
    out[i] = (out[i - 1]! * (period - 1) + values[i]) / period;
  }
  return out;
}

function maSeries(values: number[], period: number, type: 'SMA' | 'EMA' | 'WMA' | 'RMA'): (number | null)[] {
  switch (type) {
    case 'EMA': return emaSeries(values, period);
    case 'WMA': return wmaSeries(values, period);
    case 'RMA': return rmaSeries(values, period);
    default: return smaSeries(values, period);
  }
}

function stdevAt(values: number[], i: number, period: number, mean: number): number {
  let s = 0;
  for (let j = i - period + 1; j <= i; j++) s += (values[j] - mean) ** 2;
  return Math.sqrt(s / period);
}

function atrSeries(bars: OhlcBar[], period: number): number[] {
  const tr: number[] = [];
  for (let i = 0; i < bars.length; i++) {
    if (i === 0) tr.push(bars[i].high - bars[i].low);
    else {
      tr.push(
        Math.max(
          bars[i].high - bars[i].low,
          Math.abs(bars[i].high - bars[i - 1].close),
          Math.abs(bars[i].low - bars[i - 1].close)
        )
      );
    }
  }
  return rmaSeries(tr, period).map((v) => v ?? 0);
}

function donchianMid(bars: OhlcBar[], i: number, len: number): number | null {
  if (i < len - 1) return null;
  let lo = Infinity;
  let hi = -Infinity;
  for (let j = i - len + 1; j <= i; j++) {
    lo = Math.min(lo, bars[j].low);
    hi = Math.max(hi, bars[j].high);
  }
  return (lo + hi) / 2;
}

function traditionalPivots(h: number, l: number, c: number): PivotLevel[] {
  const p = (h + l + c) / 3;
  const r = h - l;
  return [
    { label: 'P', value: p },
    { label: 'R1', value: 2 * p - l },
    { label: 'S1', value: 2 * p - h },
    { label: 'R2', value: p + r },
    { label: 'S2', value: p - r },
    { label: 'R3', value: h + 2 * (p - l) },
    { label: 'S3', value: l - 2 * (h - p) },
  ];
}

/** Awais Custom Indicator Panel — MA, BB, Supertrend, Pivots, Ichimoku. */
export function computeAwaisOverlays(bars: OhlcBar[]): AwaisOverlayData | null {
  if (bars.length < 3) return null;
  const closes = bars.map((b) => b.close);
  const n = bars.length;

  const maLines: MaLineSeries[] = AWAIS_MA_LINES.map((m) => ({
    period: m.period,
    color: m.color,
    values: maSeries(closes, m.period, m.type),
  }));

  const bbLen = 20;
  const bbMult = 2;
  const middle = smaSeries(closes, bbLen);
  const upper: (number | null)[] = new Array(n).fill(null);
  const lower: (number | null)[] = new Array(n).fill(null);
  for (let i = bbLen - 1; i < n; i++) {
    const m = middle[i];
    if (m == null) continue;
    const sd = stdevAt(closes, i, bbLen, m);
    upper[i] = m + bbMult * sd;
    lower[i] = m - bbMult * sd;
  }

  const stPeriod = 10;
  const stMult = 3;
  const atr = atrSeries(bars, stPeriod);
  const up: (number | null)[] = new Array(n).fill(null);
  const down: (number | null)[] = new Array(n).fill(null);
  const stUp: number[] = new Array(n).fill(0);
  const stDn: number[] = new Array(n).fill(0);
  const trend: number[] = new Array(n).fill(1);

  for (let i = 0; i < n; i++) {
    const src = (bars[i].high + bars[i].low) / 2;
    const curUp = src - stMult * atr[i];
    const curDn = src + stMult * atr[i];
    if (i === 0) {
      stUp[i] = curUp;
      stDn[i] = curDn;
    } else {
      stUp[i] = bars[i - 1].close > stUp[i - 1] ? Math.max(curUp, stUp[i - 1]) : curUp;
      stDn[i] = bars[i - 1].close < stDn[i - 1] ? Math.min(curDn, stDn[i - 1]) : curDn;
      let t = trend[i - 1];
      if (t === -1 && bars[i].close > stDn[i - 1]) t = 1;
      else if (t === 1 && bars[i].close < stUp[i - 1]) t = -1;
      trend[i] = t;
    }
    if (trend[i] === 1) up[i] = stUp[i];
    else down[i] = stDn[i];
  }

  const convLen = 9;
  const baseLen = 26;
  const spanBLen = 52;
  const displacement = 26;
  const conversion: (number | null)[] = new Array(n).fill(null);
  const base: (number | null)[] = new Array(n).fill(null);
  const spanA: (number | null)[] = new Array(n).fill(null);
  const spanB: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    conversion[i] = donchianMid(bars, i, convLen);
    base[i] = donchianMid(bars, i, baseLen);
    const sb = donchianMid(bars, i, spanBLen);
    if (conversion[i] != null && base[i] != null) spanA[i] = (conversion[i]! + base[i]!) / 2;
    spanB[i] = sb;
  }

  const prev = bars[n - 2] ?? bars[n - 1];
  const pivots = traditionalPivots(prev.high, prev.low, prev.close);

  return {
    maLines,
    bb: { upper, middle, lower },
    supertrend: { up, down },
    ichimoku: { conversion, base, spanA, spanB, displacement },
    pivots,
  };
}

/** Ichimoku spans shifted forward (plotted at bar index). */
export function ichimokuPlottedSpans(
  ichi: AwaisOverlayData['ichimoku'],
  barCount: number
): { spanA: (number | null)[]; spanB: (number | null)[] } {
  const spanA: (number | null)[] = new Array(barCount).fill(null);
  const spanB: (number | null)[] = new Array(barCount).fill(null);
  const d = ichi.displacement;
  for (let i = 0; i < barCount; i++) {
    const src = i - d + 1;
    if (src >= 0 && src < barCount) {
      spanA[i] = ichi.spanA[src];
      spanB[i] = ichi.spanB[src];
    }
  }
  return { spanA, spanB };
}
