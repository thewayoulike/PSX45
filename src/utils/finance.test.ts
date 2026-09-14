import { describe, expect, it } from 'vitest';
import { calculateXIRR } from './finance';
const flows = (a: number, b: number, end = '2027-01-01') => [
  { amount: a, date: new Date('2026-01-01') }, { amount: b, date: new Date(end) },
];
describe('XIRR validity', () => {
  it('does not manufacture a result for same-day or one-sign flows', () => {
    expect(calculateXIRR(flows(-100, 110, '2026-01-01'))).toBeNull();
    expect(calculateXIRR(flows(-100, 100, '2026-01-01'))).toBeNull();
    expect(calculateXIRR(flows(100, 110))).toBeNull();
  });
  it('solves ordinary, zero, and near-total-loss returns', () => {
    expect(calculateXIRR(flows(-100, 110))).toBeCloseTo(10, 7);
    expect(calculateXIRR(flows(-100, 100))).toBeCloseTo(0, 7);
    expect(calculateXIRR(flows(-100, 0.01))).toBeCloseTo(-99.99, 7);
  });
  it('rejects invalid and non-finite inputs', () => {
    expect(calculateXIRR(flows(-100, Infinity))).toBeNull();
    expect(calculateXIRR(flows(-100, 110, 'bad-date'))).toBeNull();
    expect(calculateXIRR([])).toBeNull();
  });
  it('does not select an arbitrary root when multiple solutions are detected', () => {
    // -100 + 230/(1+r) - 132/(1+r)^2 has roots at 10% and 20%.
    expect(calculateXIRR([...flows(-100, 230), { amount: -132, date: new Date('2028-01-01') }])).toBeNull();
  });
});
