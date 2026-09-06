import type { OhlcBar } from '../services/psxData';
import { cloneAwaisLayers, type AwaisLayers, type MaSlot } from './awaisIndicators';

export interface ChartExtras {
  swingMarkers: boolean;
  marketStructure: boolean;
  consolidationZones: boolean;
  volumeSpike: boolean;
  volumeConfirmBreaks: boolean;
  breakoutMarkers: boolean;
  rsiDivergence: boolean;
  atrPane: boolean;
  vwap: boolean;
  candlePatterns: boolean;
  emaTrio: boolean;
}

export const DEFAULT_CHART_EXTRAS: ChartExtras = {
  swingMarkers: false,
  marketStructure: false,
  consolidationZones: false,
  volumeSpike: false,
  volumeConfirmBreaks: false,
  breakoutMarkers: false,
  rsiDivergence: false,
  atrPane: false,
  vwap: false,
  candlePatterns: false,
  emaTrio: false,
};

export function cloneChartExtras(s: ChartExtras): ChartExtras {
  return { ...s };
}

export function normalizeChartExtras(raw: unknown): ChartExtras {
  const base = cloneChartExtras(DEFAULT_CHART_EXTRAS);
  if (!raw || typeof raw !== 'object') return base;
  const o = raw as Partial<ChartExtras>;
  if (typeof o.swingMarkers === 'boolean') base.swingMarkers = o.swingMarkers;
  if (typeof o.marketStructure === 'boolean') base.marketStructure = o.marketStructure;
  if (typeof o.consolidationZones === 'boolean') base.consolidationZones = o.consolidationZones;
  if (typeof o.volumeSpike === 'boolean') base.volumeSpike = o.volumeSpike;
  if (typeof o.volumeConfirmBreaks === 'boolean') base.volumeConfirmBreaks = o.volumeConfirmBreaks;
  if (typeof o.breakoutMarkers === 'boolean') base.breakoutMarkers = o.breakoutMarkers;
  if (typeof o.rsiDivergence === 'boolean') base.rsiDivergence = o.rsiDivergence;
  if (typeof o.atrPane === 'boolean') base.atrPane = o.atrPane;
  if (typeof o.vwap === 'boolean') base.vwap = o.vwap;
  if (typeof o.candlePatterns === 'boolean') base.candlePatterns = o.candlePatterns;
  if (typeof o.emaTrio === 'boolean') base.emaTrio = o.emaTrio;
  return base;
}

export interface ConsolidationZone {
  startIndex: number;
  endIndex: number;
  high: number;
  low: number;
}

export interface VwapPoint {
  index: number;
  time: number;
  value: number;
}

export type CandlePatternType = 'doji' | 'hammer' | 'bullishEngulfing' | 'bearishEngulfing';
export type CandlePatternDirection = 'bullish' | 'bearish' | 'neutral';

export interface CandlePatternMarker {
  index: number;
  time: number;
  type: CandlePatternType;
  direction: CandlePatternDirection;
  price: number;
}

export function findConsolidationZones(
  bars: OhlcBar[],
  opts: { minBars?: number; thresholdPct?: number } = {}
): ConsolidationZone[] {
  const minBars = Math.max(2, opts.minBars ?? 6);
  const thresholdPct = opts.thresholdPct ?? 0.035;
  const zones: ConsolidationZone[] = [];
  let i = 0;

  while (i <= bars.length - minBars) {
    let best: ConsolidationZone | null = null;
    let high = -Infinity;
    let low = Infinity;

    for (let j = i; j < bars.length; j++) {
      high = Math.max(high, bars[j].high);
      low = Math.min(low, bars[j].low);
      const mid = (high + low) / 2;
      const tight = mid > 0 && (high - low) / mid <= thresholdPct;

      if (!tight) break;
      if (j - i + 1 >= minBars) {
        best = { startIndex: i, endIndex: j, high, low };
      }
    }

    if (best) {
      zones.push(best);
      i = best.endIndex + 1;
    } else {
      i += 1;
    }
  }

  return zones;
}

export function computeVwapLine(
  bars: OhlcBar[],
  opts: { resetBySession?: boolean } = {}
): VwapPoint[] {
  const points: VwapPoint[] = [];
  let pv = 0;
  let vol = 0;
  let session = '';

  bars.forEach((b, index) => {
    const nextSession = new Date(b.time).toISOString().slice(0, 10);
    if (opts.resetBySession && nextSession !== session) {
      pv = 0;
      vol = 0;
      session = nextSession;
    } else if (!session) {
      session = nextSession;
    }

    const weight = b.volume > 0 ? b.volume : 1;
    const typical = (b.high + b.low + b.close) / 3;
    pv += typical * weight;
    vol += weight;
    points.push({ index, time: b.time, value: pv / vol });
  });

  return points;
}

export function detectCandlePatterns(bars: OhlcBar[]): CandlePatternMarker[] {
  const markers: CandlePatternMarker[] = [];

  bars.forEach((b, index) => {
    const range = b.high - b.low;
    if (range <= 0) return;
    const body = Math.abs(b.close - b.open);
    const bodyHigh = Math.max(b.open, b.close);
    const bodyLow = Math.min(b.open, b.close);
    const upperShadow = b.high - bodyHigh;
    const lowerShadow = bodyLow - b.low;
    const isHammer = body / range <= 0.35 && lowerShadow >= body * 2 && upperShadow / range <= 0.18;
    if (isHammer) {
      markers.push({ index, time: b.time, type: 'hammer', direction: 'bullish', price: b.low });
      return;
    }

    const isDoji = body / range <= 0.1;
    if (isDoji) {
      markers.push({ index, time: b.time, type: 'doji', direction: 'neutral', price: b.high });
      return;
    }

    const prev = bars[index - 1];
    if (!prev) return;
    const prevBearish = prev.close < prev.open;
    const prevBullish = prev.close > prev.open;
    const bullish = b.close > b.open;
    const bearish = b.close < b.open;

    if (prevBearish && bullish && b.open <= prev.close && b.close >= prev.open) {
      markers.push({ index, time: b.time, type: 'bullishEngulfing', direction: 'bullish', price: b.low });
    } else if (prevBullish && bearish && b.open >= prev.close && b.close <= prev.open) {
      markers.push({ index, time: b.time, type: 'bearishEngulfing', direction: 'bearish', price: b.high });
    }
  });

  return markers;
}

export function applyEmaTrioPreset(layers: AwaisLayers): AwaisLayers {
  const next = cloneAwaisLayers(layers);
  const slots: Array<[MaSlot, number]> = [
    ['ma1', 20],
    ['ma2', 50],
    ['ma3', 200],
  ];

  next.groups.ema = true;
  slots.forEach(([slot, period]) => {
    next.maLines[slot] = {
      ...next.maLines[slot],
      enabled: true,
      period,
      type: 'EMA',
    };
  });

  return next;
}
