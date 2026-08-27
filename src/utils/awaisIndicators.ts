import type { OhlcBar } from '../services/psxData';

export const MA_SLOTS = ['ma1', 'ma2', 'ma3', 'ma4', 'ma5'] as const;
export type MaSlot = (typeof MA_SLOTS)[number];

/** @deprecated use MaSlot */
export const MA_PERIODS = [5, 10, 50, 100, 200] as const;
/** @deprecated use MaSlot */
export type MaPeriod = (typeof MA_PERIODS)[number];

export type MaType = 'RMA' | 'SMA' | 'EMA' | 'WMA' | 'HMA' | 'VWMA';
export const MA_TYPES: MaType[] = ['RMA', 'SMA', 'EMA', 'WMA', 'HMA', 'VWMA'];

export interface MaLineConfig {
  enabled: boolean;
  period: number;
  type: MaType;
  color: string;
}

export type MaLineMap = Record<MaSlot, MaLineConfig>;

export interface AwaisGroupToggles {
  ema: boolean;
  bb: boolean;
  supertrend: boolean;
  pivot: boolean;
  ichimoku: boolean;
}

export const DEFAULT_MA_LINES: MaLineMap = {
  ma1: { enabled: true, period: 5, type: 'SMA', color: '#97F592' },
  ma2: { enabled: true, period: 10, type: 'SMA', color: '#15A24B' },
  ma3: { enabled: true, period: 50, type: 'SMA', color: '#f22828' },
  ma4: { enabled: true, period: 100, type: 'SMA', color: '#e6b00c' },
  ma5: { enabled: true, period: 200, type: 'SMA', color: '#7b49e7' },
};

export const DEFAULT_GROUPS: AwaisGroupToggles = {
  ema: true,
  bb: true,
  supertrend: true,
  pivot: true,
  ichimoku: false,
};

export type BbKey = 'fill' | 'upper' | 'middle' | 'lower';
export type BbSelection = Record<BbKey, boolean>;

export type SupertrendKey = 'up' | 'down';
export type SupertrendSelection = Record<SupertrendKey, boolean>;

export const PIVOT_LABELS = [
  'P',
  'R1', 'R2', 'R3', 'R4', 'R5',
  'S1', 'S2', 'S3', 'S4', 'S5',
] as const;
export type PivotLabel = (typeof PIVOT_LABELS)[number];
export type PivotSelection = Record<PivotLabel, boolean>;

/** Pivot anchor period. "Auto" follows the Pine script: daily chart -> Monthly, monthly chart -> Yearly. */
export const PIVOT_ANCHORS = ['Auto', 'Daily', 'Weekly', 'Monthly', 'Quarterly', 'Yearly'] as const;
export type PivotAnchor = (typeof PIVOT_ANCHORS)[number];
export type ChartTimeframe = 'day' | 'month';

export type IchimokuKey = 'cloud' | 'conversion' | 'base' | 'spanA' | 'spanB';
export type IchimokuSelection = Record<IchimokuKey, boolean>;

export interface AwaisLayers {
  groups: AwaisGroupToggles;
  maLines: MaLineMap;
  bb: BbSelection;
  supertrend: SupertrendSelection;
  pivot: PivotSelection;
  pivotAnchor: PivotAnchor;
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
  R4: true,
  R5: true,
  S1: true,
  S2: true,
  S3: true,
  S4: true,
  S5: true,
};

export const DEFAULT_ICHI_SELECTION: IchimokuSelection = {
  cloud: true,
  conversion: true,
  base: true,
  spanA: true,
  spanB: true,
};

export const DEFAULT_AWAIS_LAYERS: AwaisLayers = {
  groups: { ...DEFAULT_GROUPS },
  maLines: {
    ma1: { ...DEFAULT_MA_LINES.ma1 },
    ma2: { ...DEFAULT_MA_LINES.ma2 },
    ma3: { ...DEFAULT_MA_LINES.ma3 },
    ma4: { ...DEFAULT_MA_LINES.ma4 },
    ma5: { ...DEFAULT_MA_LINES.ma5 },
  },
  bb: { ...DEFAULT_BB_SELECTION },
  supertrend: { ...DEFAULT_SUPERTREND_SELECTION },
  pivot: { ...DEFAULT_PIVOT_SELECTION },
  pivotAnchor: 'Auto',
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
  { key: 'R4', label: 'Resistance 4', color: '#FB8C00' },
  { key: 'R5', label: 'Resistance 5', color: '#FB8C00' },
  { key: 'S1', label: 'Support 1', color: '#FB8C00' },
  { key: 'S2', label: 'Support 2', color: '#FB8C00' },
  { key: 'S3', label: 'Support 3', color: '#FB8C00' },
  { key: 'S4', label: 'Support 4', color: '#FB8C00' },
  { key: 'S5', label: 'Support 5', color: '#FB8C00' },
];

export const AWAIS_ICHI_OPTIONS: { key: IchimokuKey; label: string; color: string }[] = [
  { key: 'cloud', label: 'Cloud Fill', color: '#43A047' },
  { key: 'conversion', label: 'Conversion Line', color: '#2962FF' },
  { key: 'base', label: 'Base Line', color: '#B71C1C' },
  { key: 'spanA', label: 'Senkou Span A', color: '#A5D6A7' },
  { key: 'spanB', label: 'Senkou Span B', color: '#EF9A9A' },
];

export function maSlotLabel(slot: MaSlot): string {
  return `MA ${MA_SLOTS.indexOf(slot) + 1}`;
}

export function cloneAwaisLayers(layers: AwaisLayers): AwaisLayers {
  const c = JSON.parse(JSON.stringify(layers)) as AwaisLayers;
  c.pivot = c.pivot ?? { ...DEFAULT_PIVOT_SELECTION };
  // Settings saved before R4/R5/S4/S5 existed default them on, matching the Pine script.
  for (const label of PIVOT_LABELS) {
    if (c.pivot[label] == null) c.pivot[label] = true;
  }
  if (!PIVOT_ANCHORS.includes(c.pivotAnchor)) c.pivotAnchor = 'Auto';
  return c;
}

export function hasAnyMaLine(layers: AwaisLayers): boolean {
  return layers.groups.ema && MA_SLOTS.some((s) => layers.maLines[s].enabled);
}

export function isMaSlotActive(layers: AwaisLayers, slot: MaSlot): boolean {
  return layers.groups.ema && layers.maLines[slot].enabled;
}

export function isMaSeriesVisible(layers: AwaisLayers, slot: MaSlot): boolean {
  return isMaSlotActive(layers, slot);
}

export function hasAnyBb(layers: AwaisLayers): boolean {
  return layers.groups.bb && Object.values(layers.bb).some(Boolean);
}

export function hasAnySupertrend(layers: AwaisLayers): boolean {
  return layers.groups.supertrend && (layers.supertrend.up || layers.supertrend.down);
}

export function hasAnyPivot(layers: AwaisLayers): boolean {
  return layers.groups.pivot && PIVOT_LABELS.some((k) => layers.pivot[k]);
}

export function hasAnyIchimoku(layers: AwaisLayers): boolean {
  return layers.groups.ichimoku && Object.values(layers.ichimoku).some(Boolean);
}

export function countAwaisActiveLayers(layers: AwaisLayers): { active: number; total: number } {
  const total = 5 + AWAIS_BB_OPTIONS.length + AWAIS_SUPERTREND_OPTIONS.length + AWAIS_PIVOT_OPTIONS.length + AWAIS_ICHI_OPTIONS.length;
  let active = layers.groups.ema ? MA_SLOTS.filter((s) => layers.maLines[s].enabled).length : 0;
  if (layers.groups.bb) active += AWAIS_BB_OPTIONS.filter((o) => layers.bb[o.key]).length;
  if (layers.groups.supertrend) active += AWAIS_SUPERTREND_OPTIONS.filter((o) => layers.supertrend[o.key]).length;
  if (layers.groups.pivot) active += AWAIS_PIVOT_OPTIONS.filter((o) => layers.pivot[o.key]).length;
  if (layers.groups.ichimoku) active += AWAIS_ICHI_OPTIONS.filter((o) => layers.ichimoku[o.key]).length;
  return { active, total };
}

export type AwaisLayerGroup = 'ema' | 'bb' | 'supertrend' | 'pivot' | 'ichimoku' | 'all';

export type AwaisGroupKey = keyof AwaisGroupToggles;

function fillRecord<K extends string>(keys: readonly K[], enabled: boolean): Record<K, boolean> {
  return keys.reduce((acc, k) => {
    acc[k] = enabled;
    return acc;
  }, {} as Record<K, boolean>);
}

/** Turn every item in a group (or all groups) on or off. */
export function setAwaisGroupEnabled(layers: AwaisLayers, group: AwaisLayerGroup, enabled: boolean): AwaisLayers {
  switch (group) {
    case 'ema':
      return {
        ...layers,
        groups: { ...layers.groups, ema: enabled },
        maLines: MA_SLOTS.reduce((acc, slot) => {
          acc[slot] = { ...layers.maLines[slot], enabled };
          return acc;
        }, {} as MaLineMap),
      };
    case 'bb':
      return {
        ...layers,
        groups: { ...layers.groups, bb: enabled },
        bb: fillRecord(AWAIS_BB_OPTIONS.map((o) => o.key), enabled),
      };
    case 'supertrend':
      return {
        ...layers,
        groups: { ...layers.groups, supertrend: enabled },
        supertrend: fillRecord(AWAIS_SUPERTREND_OPTIONS.map((o) => o.key), enabled),
      };
    case 'pivot':
      return {
        ...layers,
        groups: { ...layers.groups, pivot: enabled },
        pivot: fillRecord(PIVOT_LABELS, enabled),
      };
    case 'ichimoku':
      return {
        ...layers,
        groups: { ...layers.groups, ichimoku: enabled },
        ichimoku: fillRecord(AWAIS_ICHI_OPTIONS.map((o) => o.key), enabled),
      };
    case 'all':
      return {
        groups: { ema: enabled, bb: enabled, supertrend: enabled, pivot: enabled, ichimoku: enabled },
        maLines: MA_SLOTS.reduce((acc, slot) => {
          acc[slot] = { ...layers.maLines[slot], enabled };
          return acc;
        }, {} as MaLineMap),
        bb: fillRecord(AWAIS_BB_OPTIONS.map((o) => o.key), enabled),
        supertrend: fillRecord(AWAIS_SUPERTREND_OPTIONS.map((o) => o.key), enabled),
        pivot: fillRecord(PIVOT_LABELS, enabled),
        ichimoku: fillRecord(AWAIS_ICHI_OPTIONS.map((o) => o.key), enabled),
      };
  }
}

export interface MaLineSeries {
  slot: MaSlot;
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

function hmaSeries(values: number[], period: number): (number | null)[] {
  const half = Math.max(1, Math.floor(period / 2));
  const sqrt = Math.max(1, Math.floor(Math.sqrt(period)));
  const wmaHalf = wmaSeries(values, half);
  const wmaFull = wmaSeries(values, period);
  const hull: number[] = values.map((_, i) => {
    const a = wmaHalf[i];
    const b = wmaFull[i];
    return a != null && b != null ? 2 * a - b : NaN;
  });
  const out = wmaSeries(
    hull.map((v) => (Number.isFinite(v) ? v : 0)),
    sqrt
  );
  return out.map((v, i) => (Number.isFinite(hull[i]) ? v : null));
}

function vwmaSeries(closes: number[], volumes: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  for (let i = period - 1; i < closes.length; i++) {
    let num = 0;
    let den = 0;
    for (let j = i - period + 1; j <= i; j++) {
      num += closes[j] * volumes[j];
      den += volumes[j];
    }
    out[i] = den > 0 ? num / den : null;
  }
  return out;
}

function maSeries(values: number[], period: number, type: MaType, volumes?: number[]): (number | null)[] {
  switch (type) {
    case 'EMA':
      return emaSeries(values, period);
    case 'WMA':
      return wmaSeries(values, period);
    case 'RMA':
      return rmaSeries(values, period);
    case 'HMA':
      return hmaSeries(values, period);
    case 'VWMA':
      return volumes ? vwmaSeries(values, volumes, period) : smaSeries(values, period);
    default:
      return smaSeries(values, period);
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

/** TradingView "Traditional" pivots: P plus R1–R5 / S1–S5. */
function traditionalPivots(h: number, l: number, c: number): PivotLevel[] {
  const p = (h + l + c) / 3;
  const r = h - l;
  return [
    { label: 'P', value: p },
    { label: 'R1', value: 2 * p - l },
    { label: 'S1', value: 2 * p - h },
    { label: 'R2', value: p + r },
    { label: 'S2', value: p - r },
    { label: 'R3', value: 2 * p + (h - 2 * l) },
    { label: 'S3', value: 2 * p - (2 * h - l) },
    { label: 'R4', value: 3 * p + (h - 3 * l) },
    { label: 'S4', value: 3 * p - (3 * h - l) },
    { label: 'R5', value: 4 * p + (h - 4 * l) },
    { label: 'S5', value: 4 * p - (4 * h - l) },
  ];
}

/** Pine `autoAnchor`: daily chart anchors to Monthly, monthly chart to Yearly. */
export function resolvePivotAnchor(
  anchor: PivotAnchor,
  timeframe: ChartTimeframe
): Exclude<PivotAnchor, 'Auto'> {
  if (anchor !== 'Auto') return anchor;
  return timeframe === 'month' ? 'Yearly' : 'Monthly';
}

function periodKey(time: number, anchor: Exclude<PivotAnchor, 'Auto'>): string {
  const d = new Date(time);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  switch (anchor) {
    case 'Daily':
      return `${y}-${m}-${d.getUTCDate()}`;
    case 'Weekly': {
      // Anchor to the Monday starting the week containing this bar.
      const monday = Date.UTC(y, m, d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
      return `W${monday}`;
    }
    case 'Monthly':
      return `${y}-${m}`;
    case 'Quarterly':
      return `${y}-Q${Math.floor(m / 3)}`;
    case 'Yearly':
      return `${y}`;
  }
}

/**
 * High/low/close of the last *completed* anchor period, which is what pivot
 * levels are drawn from. Falls back to the previous bar when history is too
 * short to contain a finished period.
 */
function pivotSourceOhlc(
  bars: OhlcBar[],
  anchor: Exclude<PivotAnchor, 'Auto'>
): { high: number; low: number; close: number } | null {
  const n = bars.length;
  if (!n) return null;

  const currentKey = periodKey(bars[n - 1].time, anchor);
  let i = n - 1;
  while (i >= 0 && periodKey(bars[i].time, anchor) === currentKey) i--;

  if (i < 0) {
    const prev = bars[n - 2] ?? bars[n - 1];
    return { high: prev.high, low: prev.low, close: prev.close };
  }

  const prevKey = periodKey(bars[i].time, anchor);
  const close = bars[i].close;
  let high = -Infinity;
  let low = Infinity;
  for (; i >= 0 && periodKey(bars[i].time, anchor) === prevKey; i--) {
    high = Math.max(high, bars[i].high);
    low = Math.min(low, bars[i].low);
  }
  return { high, low, close };
}

export interface AwaisOverlayOptions {
  /** Full unfiltered history; the visible range rarely covers a whole anchor period. */
  pivotBars?: OhlcBar[];
  timeframe?: ChartTimeframe;
}

/** Awais Custom Indicator Panel — MA, BB, Supertrend, Pivots, Ichimoku. */
export function computeAwaisOverlays(
  bars: OhlcBar[],
  layers: AwaisLayers,
  options: AwaisOverlayOptions = {}
): AwaisOverlayData | null {
  if (bars.length < 3) return null;
  const closes = bars.map((b) => b.close);
  const volumes = bars.map((b) => b.volume);
  const n = bars.length;

  const maLines: MaLineSeries[] = [];
  if (layers.groups.ema) {
    for (const slot of MA_SLOTS) {
      const cfg = layers.maLines[slot];
      if (!cfg.enabled) continue;
      const period = Math.min(500, Math.max(1, Math.round(cfg.period)));
      maLines.push({
        slot,
        period,
        color: cfg.color,
        values: maSeries(closes, period, cfg.type, volumes),
      });
    }
  }

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

  const timeframe = options.timeframe ?? 'day';
  const anchor = resolvePivotAnchor(layers.pivotAnchor ?? 'Auto', timeframe);
  const pivotBars = options.pivotBars?.length ? options.pivotBars : bars;
  const src = pivotSourceOhlc(pivotBars, anchor);
  const pivots = src ? traditionalPivots(src.high, src.low, src.close) : [];

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
