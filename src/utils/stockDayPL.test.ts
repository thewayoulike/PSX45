import { describe, expect, it } from 'vitest';
import { stockDayChange } from './stockDayPL';

describe('day change around a corporate action', () => {
  it('does not book bonus shares as a gain from a zero price', () => {
    const pl = stockDayChange({
      quantity: 550,
      current: 259,
      ldcp: 285,
      trades: [{ type: 'BONUS', quantity: 50, price: 0 }],
    });
    expect(pl).toBeCloseTo((259 - 285) * 500, 4);
  });

  it('treats rights like a purchase at the price paid', () => {
    const pl = stockDayChange({
      quantity: 550,
      current: 210,
      ldcp: 200,
      trades: [{ type: 'RIGHTS', quantity: 50, price: 180 }],
    });
    expect(pl).toBeCloseTo(500 * 10 + 50 * 30, 4);
  });
});
