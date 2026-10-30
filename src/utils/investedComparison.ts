export type ComparisonPlotPoint = { x: number; y: number; investedY: number };
type Position = { x: number; y: number };
export type ComparisonSegment = { from: Position; to: Position; baseline: number; side: 'above' | 'below' | 'equal' };

/** Split at crossings of the linear value curve and the step-after invested line.
 * SVG Y increases downwards, so a smaller Y is a higher portfolio value.
 * A dated deposit/withdrawal changes the baseline at the next point, not before it.
 */
export function investedComparisonSegments(points: readonly ComparisonPlotPoint[]): ComparisonSegment[] {
  const segments: ComparisonSegment[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (![a.x, a.y, a.investedY, b.x, b.y, b.investedY].every(Number.isFinite) || b.x <= a.x) continue;
    const baseline = a.investedY;
    const add = (from: Position, to: Position) => {
      const middleY = (from.y + to.y) / 2;
      segments.push({ from, to, baseline, side: middleY < baseline ? 'above' : middleY > baseline ? 'below' : 'equal' });
    };
    const start = { x: a.x, y: a.y };
    const end = { x: b.x, y: b.y };
    const t = (baseline - a.y) / (b.y - a.y);
    if (t > 0 && t < 1) {
      const cross = { x: a.x + t * (b.x - a.x), y: baseline };
      add(start, cross);
      add(cross, end);
    } else add(start, end);
  }
  return segments;
}
