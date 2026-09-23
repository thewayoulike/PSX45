import { describe, expect, it } from 'vitest';
import { holdingsDailyReturn } from './holdingsDailyReturn';

describe('holdings daily return vs the indices', () => {
  it('is the close-to-close move of shares already held, not a return on cost', () => {
    expect(holdingsDailyReturn(
      { OGDC: 100 },
      { OGDC: 100 },
      { OGDC: 110 },
    )).toBe(10);
  });

  it('ignores shares bought today', () => {
    expect(holdingsDailyReturn(
      { OGDC: 100 },
      { OGDC: 200, SYS: 50 },
      { OGDC: 202, SYS: 80 },
    )).toBe(1);
  });
});
