import { expect, it } from 'vitest';
import { fifoTransferSlices } from './transferLots';

const total = (s: { quantity: number; price: number }[]) => s.reduce((sum, x) => sum + x.quantity * x.price, 0);

it('carries the original cost through a split, instead of pricing new shares at the average', () => {
  const slices = fifoTransferSlices([
    { type: 'BUY', date: '2026-01-05', quantity: 100, price: 100 },
    { type: 'SPLIT', date: '2026-03-01', quantity: 100, price: 2 },
  ], 200, '2026-04-01');
  expect(slices.reduce((q, s) => q + s.quantity, 0)).toBe(200);
  expect(total(slices)).toBeCloseTo(10000);
});
it('moves bonus shares at zero cost and rights shares at the price paid', () => {
  const slices = fifoTransferSlices([
    { type: 'BUY', date: '2026-01-05', quantity: 100, price: 110 },
    { type: 'BONUS', date: '2026-02-01', quantity: 10, price: 0 },
    { type: 'RIGHTS', date: '2026-02-10', quantity: 20, price: 50 },
  ], 130, '2026-04-01');
  expect(slices).toEqual([{ quantity: 100, price: 110 }, { quantity: 10, price: 0 }, { quantity: 20, price: 50 }]);
});
it('ignores corporate actions after the transfer date', () => {
  const slices = fifoTransferSlices([
    { type: 'BUY', date: '2026-01-05', quantity: 100, price: 100 },
    { type: 'SPLIT', date: '2026-05-01', quantity: 100, price: 2 },
  ], 100, '2026-04-01');
  expect(slices).toEqual([{ quantity: 100, price: 100 }]);
});
