import { describe, expect, it } from 'vitest';
import { resolveFundDayNav } from './mufapData';

describe('resolveFundDayNav', () => {
  it('uses catalog prevNav when MUFAP validity rolled (Mon vs Fri)', () => {
    // Current Mon NAV; catalog carries Friday prior — Daily P&L must not baseline to current.
    const ldcp = resolveFundDayNav(53.5888, 53.5888, {
      currentValidity: 'Sep 21, 2026',
      catalogPrevNav: 53.5492,
      catalogPrevValidity: 'Sep 18, 2026',
    });
    expect(ldcp).toBeCloseTo(53.5492, 4);
  });

  it('baselines when catalog prev shares the same validity date', () => {
    const ldcp = resolveFundDayNav(53.5888, 53.5, {
      currentValidity: 'Sep 21, 2026',
      catalogPrevNav: 53.5,
      catalogPrevValidity: 'Sep 21, 2026',
    });
    expect(ldcp).toBeCloseTo(53.5888, 4);
  });

  it('trusts day-mark prior NAV even without a price timestamp', () => {
    const ldcp = resolveFundDayNav(53.5888, 53.5492, {
      currentValidity: 'Sep 21, 2026',
      dayMark: { nav: 53.5492, validityDate: 'Sep 18, 2026', syncedAt: '2026-09-21T12:00:00Z' },
    });
    expect(ldcp).toBeCloseTo(53.5492, 4);
  });
});
