import { expect, it } from 'vitest';
import { fxCrossChange, fxCrossRate, fxChangeLabel } from './forexHeatmap';

const old = { date: '2026-10-17', rates: { USD: 1, EUR: .8, PKR: 280 } };
const now = { date: '2026-10-18', rates: { USD: 1, EUR: .88, PKR: 280 } };
it('reports row currency strength against the column with reciprocal percentages', () => {
  expect(fxCrossRate(now, 'EUR', 'PKR')).toBeCloseTo(318.181818);
  expect(fxCrossChange(now, old, 'USD', 'EUR')).toBeCloseTo(10);
  expect(fxCrossChange(now, old, 'EUR', 'USD')).toBeCloseTo(-9.090909);
  expect(fxCrossChange(now, old, 'USD', 'PKR')).toBe(0);
});
it('keeps absent rates or unavailable history distinct from unchanged rates', () => {
  expect(fxCrossChange(now, null, 'USD', 'EUR')).toBeNull();
  expect(fxCrossChange(now, old, 'CHF', 'USD')).toBeNull();
  expect(fxCrossRate({ date: now.date, rates: { USD: 1, PKR: 0 } }, 'USD', 'PKR')).toBeNull();
  expect(fxChangeLabel(null)).toBe('—');
  expect(fxChangeLabel(-.00001)).toBe('0.00%');
  expect(fxChangeLabel(10)).toBe('+10.00%');
});
