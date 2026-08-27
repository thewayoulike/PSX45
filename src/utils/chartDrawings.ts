export type DrawTool = 'pan' | 'crosshair' | 'select' | 'trendline' | 'hline' | 'vline' | 'rect' | 'fib';

export type DrawPoint = { time: number; price: number };

export type ChartDrawing =
  | { id: string; type: 'trendline'; p1: DrawPoint; p2: DrawPoint; color: string }
  | { id: string; type: 'fib'; p1: DrawPoint; p2: DrawPoint; color: string }
  | { id: string; type: 'hline'; price: number; color: string }
  | { id: string; type: 'vline'; time: number; color: string }
  | { id: string; type: 'rect'; p1: DrawPoint; p2: DrawPoint; color: string };

export const DEFAULT_DRAW_COLOR = '#2563eb';
export const SELECTED_DRAW_COLOR = '#f59e0b';

/** Standard Fibonacci retracement ratios (TradingView default set). */
export const FIB_RETRACEMENT_LEVELS = [
  { level: 0, label: '0' },
  { level: 0.236, label: '0.236' },
  { level: 0.382, label: '0.382' },
  { level: 0.5, label: '0.5' },
  { level: 0.618, label: '0.618' },
  { level: 0.786, label: '0.786' },
  { level: 1, label: '1' },
] as const;

export function fibRetracePrice(p1: DrawPoint, p2: DrawPoint, level: number): number {
  return p1.price + (p2.price - p1.price) * level;
}

const STORAGE_KEY = 'psx_chart_drawings_v1';

export function newDrawingId(): string {
  return `d-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function loadDrawings(symbol: string): ChartDrawing[] {
  if (!symbol) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const all = JSON.parse(raw) as Record<string, ChartDrawing[]>;
    const list = all[symbol.toUpperCase()];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveDrawings(symbol: string, drawings: ChartDrawing[]): void {
  if (!symbol) return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const all = raw ? (JSON.parse(raw) as Record<string, ChartDrawing[]>) : {};
    all[symbol.toUpperCase()] = drawings;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    /* ignore quota */
  }
}

export function priceAtY(y: number, yMin: number, yMax: number, padTop: number, innerH: number): number {
  if (innerH <= 0) return yMin;
  const t = (y - padTop) / innerH;
  return yMax - t * (yMax - yMin);
}

export function yAtPrice(price: number, yMin: number, yMax: number, padTop: number, innerH: number): number {
  if (yMax === yMin) return padTop + innerH / 2;
  return padTop + ((yMax - price) / (yMax - yMin)) * innerH;
}

/** Map a bar timestamp to pixel X, interpolating between visible bars. */
export function xAtTime(time: number, barTimes: number[], plotOffset: number, slot: number): number {
  if (!barTimes.length || slot <= 0) return plotOffset;
  const n = barTimes.length;
  if (time <= barTimes[0]) return plotOffset + slot / 2;
  if (time >= barTimes[n - 1]) return plotOffset + (n - 1) * slot + slot / 2;
  for (let i = 0; i < n - 1; i++) {
    const t0 = barTimes[i];
    const t1 = barTimes[i + 1];
    if (time >= t0 && time <= t1) {
      const f = t1 === t0 ? 0 : (time - t0) / (t1 - t0);
      return plotOffset + (i + f) * slot + slot / 2;
    }
  }
  return plotOffset + (n - 1) * slot + slot / 2;
}

export function snapTimeAtX(
  x: number,
  bars: { time: number }[],
  plotOffset: number,
  slot: number
): { time: number; barIndex: number } | null {
  if (!bars.length || slot <= 0 || x < plotOffset || x > plotOffset + bars.length * slot) return null;
  const idx = Math.min(bars.length - 1, Math.max(0, Math.floor((x - plotOffset) / slot)));
  return { time: bars[idx].time, barIndex: idx };
}

export function pointFromPixel(
  x: number,
  y: number,
  bars: { time: number }[],
  plotOffset: number,
  slot: number,
  yMin: number,
  yMax: number,
  padTop: number,
  innerH: number
): DrawPoint | null {
  const snapped = snapTimeAtX(x, bars, plotOffset, slot);
  if (!snapped) return null;
  return { time: snapped.time, price: priceAtY(y, yMin, yMax, padTop, innerH) };
}

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

export type DrawRenderCoords = {
  barTimes: number[];
  plotOffset: number;
  slot: number;
  plotLeft: number;
  plotRight: number;
  plotTop: number;
  plotBottom: number;
  yMin: number;
  yMax: number;
  padTop: number;
  innerH: number;
};

export function hitTestDrawings(
  x: number,
  y: number,
  drawings: ChartDrawing[],
  coords: DrawRenderCoords,
  tolerance = 8
): string | null {
  for (let i = drawings.length - 1; i >= 0; i--) {
    const d = drawings[i];
    if (hitTestOne(x, y, d, coords, tolerance)) return d.id;
  }
  return null;
}

function hitTestOne(x: number, y: number, d: ChartDrawing, c: DrawRenderCoords, tol: number): boolean {
  const { barTimes, plotOffset, slot, plotLeft, plotRight, yMin, yMax, padTop, innerH } = c;
  switch (d.type) {
    case 'hline': {
      const ly = yAtPrice(d.price, yMin, yMax, padTop, innerH);
      return y >= plotTop && y <= plotBottom && Math.abs(y - ly) <= tol;
    }
    case 'vline': {
      const lx = xAtTime(d.time, barTimes, plotOffset, slot);
      return x >= plotLeft && x <= plotRight && Math.abs(x - lx) <= tol;
    }
    case 'trendline': {
      const x1 = xAtTime(d.p1.time, barTimes, plotOffset, slot);
      const y1 = yAtPrice(d.p1.price, yMin, yMax, padTop, innerH);
      const x2 = xAtTime(d.p2.time, barTimes, plotOffset, slot);
      const y2 = yAtPrice(d.p2.price, yMin, yMax, padTop, innerH);
      return distToSegment(x, y, x1, y1, x2, y2) <= tol;
    }
    case 'fib': {
      const x1 = xAtTime(d.p1.time, barTimes, plotOffset, slot);
      const y1 = yAtPrice(d.p1.price, yMin, yMax, padTop, innerH);
      const x2 = xAtTime(d.p2.time, barTimes, plotOffset, slot);
      const y2 = yAtPrice(d.p2.price, yMin, yMax, padTop, innerH);
      if (distToSegment(x, y, x1, y1, x2, y2) <= tol) return true;
      if (Math.hypot(x - x1, y - y1) <= tol + 4 || Math.hypot(x - x2, y - y2) <= tol + 4) return true;
      for (const { level } of FIB_RETRACEMENT_LEVELS) {
        const ly = yAtPrice(fibRetracePrice(d.p1, d.p2, level), yMin, yMax, padTop, innerH);
        if (y >= c.plotTop && y <= c.plotBottom && Math.abs(y - ly) <= tol) return true;
      }
      return false;
    }
    case 'rect': {
      const x1 = xAtTime(d.p1.time, barTimes, plotOffset, slot);
      const y1 = yAtPrice(d.p1.price, yMin, yMax, padTop, innerH);
      const x2 = xAtTime(d.p2.time, barTimes, plotOffset, slot);
      const y2 = yAtPrice(d.p2.price, yMin, yMax, padTop, innerH);
      const left = Math.min(x1, x2);
      const right = Math.max(x1, x2);
      const top = Math.min(y1, y2);
      const bottom = Math.max(y1, y2);
      const nearEdge =
        (Math.abs(x - left) <= tol && y >= top - tol && y <= bottom + tol) ||
        (Math.abs(x - right) <= tol && y >= top - tol && y <= bottom + tol) ||
        (Math.abs(y - top) <= tol && x >= left - tol && x <= right + tol) ||
        (Math.abs(y - bottom) <= tol && x >= left - tol && x <= right + tol);
      const inside = x >= left && x <= right && y >= top && y <= bottom;
      return nearEdge || inside;
    }
    default:
      return false;
  }
}
