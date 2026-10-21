import { describe, expect, it } from 'vitest';
import { marketTabFromLocation, marketTabPath } from './marketTabRoute';

describe('market tab addresses', () => {
  it('opens the tab named in the path', () => {
    expect(marketTabFromLocation('/markets/stocks', '')).toBe('stocks');
    expect(marketTabFromLocation('/markets/crypto/', '')).toBe('crypto');
    expect(marketTabFromLocation('/markets/funds', '')).toBe('funds');
  });

  it('still honours old #tab links and unknown paths fall back to the overview', () => {
    expect(marketTabFromLocation('/markets', '#forex')).toBe('forex');
    expect(marketTabFromLocation('/market-overview', '#news')).toBe('news');
    expect(marketTabFromLocation('/markets', '#nope')).toBe('overview');
    expect(marketTabFromLocation('/markets', '')).toBe('overview');
  });

  it('gives each tab its own address and keeps the overview at /markets', () => {
    expect(marketTabPath('overview')).toBe('/markets');
    expect(marketTabPath('commodities')).toBe('/markets/commodities');
  });
});
