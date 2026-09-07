import { describe, expect, it } from 'vitest';
import {
  filterTransactionsByTickers,
  firstEntitledTickers,
  isTickerEntitled,
} from './freemiumEntitlements';

describe('firstEntitledTickers', () => {
  it('orders by earliest transaction date and includes sold symbols', () => {
    const allowed = firstEntitledTickers([
      { ticker: 'LUCK', date: '2024-06-01' },
      { ticker: 'OGDC', date: '2024-01-01' },
      { ticker: 'OGDC', date: '2024-12-01' },
      { ticker: 'PPL', date: '2024-02-01' },
      { ticker: 'HBL', date: '2024-03-01' },
    ], 3);
    expect(allowed).toEqual(['OGDC', 'PPL', 'HBL']);
  });

  it('returns fewer than limit when history is smaller', () => {
    expect(firstEntitledTickers([{ ticker: 'sys', date: '2024-01-01' }], 3)).toEqual(['SYS']);
  });
});

describe('filterTransactionsByTickers', () => {
  it('keeps only entitled tickers', () => {
    const out = filterTransactionsByTickers(
      [
        { ticker: 'OGDC', id: 1 },
        { ticker: 'LUCK', id: 2 },
      ],
      ['OGDC'],
    );
    expect(out.map((t) => t.id)).toEqual([1]);
  });
});

describe('isTickerEntitled', () => {
  it('matches case-insensitively', () => {
    expect(isTickerEntitled('ogdc', ['OGDC', 'PPL'])).toBe(true);
    expect(isTickerEntitled('HBL', ['OGDC'])).toBe(false);
  });
});
