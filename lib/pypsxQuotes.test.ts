import { expect, it } from 'vitest';
import { quoteToPrice } from './pypsxQuotes.js';

it('uses a last-trade price but ignores a close-only quote that may be the previous session', () => {
  expect(quoteToPrice({ last: 101.5, price_field: 'last' })).toBe(101.5);
  expect(quoteToPrice({ last: 99, price: 99, price_field: 'close' })).toBeNull();
  expect(quoteToPrice({ last: '1,250.25' })).toBe(1250.25);
  expect(quoteToPrice({ last: 0 })).toBeNull();
});
