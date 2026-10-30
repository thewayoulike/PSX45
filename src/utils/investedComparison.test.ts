import { describe, expect, it } from 'vitest';
import { investedComparisonSegments } from './investedComparison';

describe('portfolio value colours against invested capital', () => {
  it('switches colour exactly where the value line crosses invested capital', () => {
    expect(investedComparisonSegments([{ x: 0, y: 70, investedY: 50 }, { x: 100, y: 30, investedY: 50 }])).toEqual([
      { from: { x: 0, y: 70 }, to: { x: 50, y: 50 }, baseline: 50, side: 'below' },
      { from: { x: 50, y: 50 }, to: { x: 100, y: 30 }, baseline: 50, side: 'above' },
    ]);
  });
  it('changes the comparison on a deposit date without interpolating the deposit backwards', () => {
    const result = investedComparisonSegments([
      { x: 0, y: 40, investedY: 60 },
      { x: 100, y: 40, investedY: 20 },
      { x: 200, y: 40, investedY: 20 },
    ]);
    expect(result.map(p => [p.baseline, p.side])).toEqual([[60, 'above'], [20, 'below']]);
    expect(result[0].to.x).toBe(result[1].from.x);
  });
  it('does not divide by zero or paint equality as a loss', () => {
    const result = investedComparisonSegments([{ x: 0, y: 50, investedY: 50 }, { x: 100, y: 50, investedY: 50 }]);
    expect(result).toHaveLength(1);
    expect(result[0].side).toBe('equal');
    expect(investedComparisonSegments([{ x: 0, y: 50, investedY: NaN }, { x: 100, y: 60, investedY: 50 }])).toEqual([]);
  });
});
