import type { OhlcBar } from '../services/psxData';

export type MomentumIndicatorType = 'RSI' | 'MACD' | 'Stochastic' | 'ADX';
export const MOMENTUM_TYPES: MomentumIndicatorType[] = ['RSI', 'MACD', 'Stochastic', 'ADX'];

export interface MomentumConfig {
  indicatorType: MomentumIndicatorType;
  rsi: {
    length: number;
    overbought: number;
    oversold: number;
    color: string;
    showSmoothing: boolean;
    smoothingType: 'SMA' | 'EMA';
    smoothingLength: number;
    smoothingColor: string;
  };
  macd: {
    fast: number;
    slow: number;
    signal: number;
    lineColor: string;
    signalColor: string;
    histAboveRising: string;
    histAboveFalling: string;
    histBelowRising: string;
    histBelowFalling: string;
  };
  stochastic: {
    kLength: number;
    dLength: number;
    smooth: number;
    overbought: number;
    oversold: number;
    kColor: string;
    dColor: string;
  };
  adx: {
    adxLength: number;
    diLength: number;
    threshold: number;
    color: string;
  };
}

export const DEFAULT_MOMENTUM_CONFIG: MomentumConfig = {
  indicatorType: 'RSI',
  rsi: {
    length: 14,
    overbought: 60,
    oversold: 40,
    color: '#22c55e',
    showSmoothing: true,
    smoothingType: 'SMA',
    smoothingLength: 9,
    smoothingColor: '#f11111',
  },
  macd: {
    fast: 12,
    slow: 26,
    signal: 9,
    lineColor: '#22c55e',
    signalColor: '#ef4444',
    histAboveRising: '#22c55e',
    histAboveFalling: '#97d399',
    histBelowRising: '#eab9b9',
    histBelowFalling: '#ef4444',
  },
  stochastic: {
    kLength: 14,
    dLength: 3,
    smooth: 3,
    overbought: 80,
    oversold: 20,
    kColor: '#22c55e',
    dColor: '#ef4444',
  },
  adx: {
    adxLength: 14,
    diLength: 14,
    threshold: 25,
    color: '#9333ea',
  },
};

export interface MomentumBar {
  rsi: number | null;
  rsiSmooth: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHist: number | null;
  macdHistColor: string | null;
  stochK: number | null;
  stochD: number | null;
  adx: number | null;
}

export function cloneMomentumConfig(config: MomentumConfig): MomentumConfig {
  return JSON.parse(JSON.stringify(config)) as MomentumConfig;
}

function smaSeries(values: (number | null)[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const v = values[j];
      if (v == null || !Number.isFinite(v)) continue;
      sum += v;
      count++;
    }
    if (count === period) out[i] = sum / period;
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

function rsiSeries(closes: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gains += d;
    else losses -= d;
  }
  let avgG = gains / period;
  let avgL = losses / period;
  out[period] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgG = (avgG * (period - 1) + g) / period;
    avgL = (avgL * (period - 1) + l) / period;
    out[i] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  }
  return out;
}

function stochRaw(highs: number[], lows: number[], closes: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  for (let i = period - 1; i < closes.length; i++) {
    let lo = Infinity;
    let hi = -Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      lo = Math.min(lo, lows[j]);
      hi = Math.max(hi, highs[j]);
    }
    out[i] = hi === lo ? 50 : (100 * (closes[i] - lo)) / (hi - lo);
  }
  return out;
}

function computeDmi(
  bars: OhlcBar[],
  diLength: number,
  adxLength: number
): { adx: (number | null)[] } {
  const n = bars.length;
  const adx: (number | null)[] = new Array(n).fill(null);
  if (n < diLength + adxLength) return { adx };

  const tr: number[] = [];
  const plusDm: number[] = [];
  const minusDm: number[] = [];
  for (let i = 0; i < n; i++) {
    if (i === 0) {
      tr.push(bars[i].high - bars[i].low);
      plusDm.push(0);
      minusDm.push(0);
      continue;
    }
    const up = bars[i].high - bars[i - 1].high;
    const down = bars[i - 1].low - bars[i].low;
    plusDm.push(up > down && up > 0 ? up : 0);
    minusDm.push(down > up && down > 0 ? down : 0);
    tr.push(
      Math.max(
        bars[i].high - bars[i].low,
        Math.abs(bars[i].high - bars[i - 1].close),
        Math.abs(bars[i].low - bars[i - 1].close)
      )
    );
  }

  const trRma = rmaSeries(tr, diLength);
  const plusRma = rmaSeries(plusDm, diLength);
  const minusRma = rmaSeries(minusDm, diLength);
  const dx: (number | null)[] = new Array(n).fill(null);

  for (let i = 0; i < n; i++) {
    const trv = trRma[i];
    const p = plusRma[i];
    const m = minusRma[i];
    if (trv == null || p == null || m == null || trv === 0) continue;
    const plusDi = (100 * p) / trv;
    const minusDi = (100 * m) / trv;
    const sum = plusDi + minusDi;
    dx[i] = sum === 0 ? 0 : (100 * Math.abs(plusDi - minusDi)) / sum;
  }

  const adxSmoothed = rmaSeries(
    dx.map((v) => (v == null ? 0 : v)),
    adxLength
  );
  for (let i = 0; i < n; i++) {
    if (i >= diLength + adxLength - 2) adx[i] = adxSmoothed[i];
  }
  return { adx };
}

/** Momentum Panel Selector — RSI, MACD, Stochastic, or ADX on OHLC bars. */
export function computeMomentumSeries(bars: OhlcBar[], config: MomentumConfig): MomentumBar[] {
  const n = bars.length;
  const empty: MomentumBar = {
    rsi: null,
    rsiSmooth: null,
    macd: null,
    macdSignal: null,
    macdHist: null,
    macdHistColor: null,
    stochK: null,
    stochD: null,
    adx: null,
  };
  if (n < 3) return new Array(n).fill(empty);

  const closes = bars.map((b) => b.close);
  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);

  const rsi = rsiSeries(closes, Math.max(1, config.rsi.length));
  const rsiNums = rsi.map((v) => v ?? NaN);
  const rsiSmoothRaw =
    config.rsi.smoothingType === 'EMA'
      ? emaSeries(
          rsiNums.map((v, i) => (Number.isFinite(v) ? v : closes[i])),
          Math.max(1, config.rsi.smoothingLength)
        )
      : smaSeries(rsi, Math.max(1, config.rsi.smoothingLength));

  const macdFast = emaSeries(closes, Math.max(1, config.macd.fast));
  const macdSlow = emaSeries(closes, Math.max(1, config.macd.slow));
  const macdLine: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (macdFast[i] != null && macdSlow[i] != null) macdLine[i] = macdFast[i]! - macdSlow[i]!;
  }
  const macdLineNums = macdLine.map((v) => (v == null ? 0 : v));
  const signalLine = emaSeries(macdLineNums, Math.max(1, config.macd.signal));
  const macdHist: (number | null)[] = new Array(n).fill(null);
  const macdHistColor: (string | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (macdLine[i] == null || signalLine[i] == null) continue;
    const hist = macdLine[i]! - signalLine[i]!;
    macdHist[i] = hist;
    const prev = i > 0 ? macdHist[i - 1] : null;
    const rising = prev == null ? true : hist > prev;
    if (hist > 0) macdHistColor[i] = rising ? config.macd.histAboveRising : config.macd.histAboveFalling;
    else macdHistColor[i] = rising ? config.macd.histBelowRising : config.macd.histBelowFalling;
  }

  const stochRawVals = stochRaw(highs, lows, closes, Math.max(1, config.stochastic.kLength));
  const stochK = smaSeries(stochRawVals, Math.max(1, config.stochastic.smooth));
  const stochD = smaSeries(stochK, Math.max(1, config.stochastic.dLength));

  const { adx } = computeDmi(bars, Math.max(1, config.adx.diLength), Math.max(1, config.adx.adxLength));

  return bars.map((_, i) => ({
    rsi: rsi[i],
    rsiSmooth: config.rsi.showSmoothing ? rsiSmoothRaw[i] : null,
    macd: macdLine[i],
    macdSignal: signalLine[i],
    macdHist: macdHist[i],
    macdHistColor: macdHistColor[i],
    stochK: stochK[i],
    stochD: stochD[i],
    adx: adx[i],
  }));
}

export function momentumPanelLabel(config: MomentumConfig): string {
  const t = config.indicatorType;
  switch (t) {
    case 'RSI':
      return `RSI (${config.rsi.length})`;
    case 'MACD':
      return `MACD (${config.macd.fast}, ${config.macd.slow}, ${config.macd.signal})`;
    case 'Stochastic':
      return `Stochastic (${config.stochastic.kLength}, ${config.stochastic.dLength}, ${config.stochastic.smooth})`;
    case 'ADX':
      return `ADX (${config.adx.adxLength})`;
  }
}
