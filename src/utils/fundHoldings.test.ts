import { describe, it, expect } from 'vitest';
import type { Transaction } from '../types';
import { computeFundBucketAverageCost, mergeFundHoldingsByCanon } from './fundHoldings';
import { buildFundConversionMap } from './fundCash';

const FUND_A = 'MF:fund-a';
const FUND_B = 'MF:fund-b';

/** Minimal Transaction factory — only the fields the engine reads. */
function tx(partial: Partial<Transaction> & Pick<Transaction, 'id' | 'type' | 'ticker' | 'quantity' | 'price' | 'date'>): Transaction {
  return {
    portfolioId: 'p1',
    broker: '',
    commission: 0,
    tax: 0,
    cdcCharges: 0,
    otherFees: 0,
    ...partial,
  } as Transaction;
}

const noConversions = new Map();
const fundMeta = { sector: 'Income', broker: 'ACME AMC', isFundPortfolio: true };

describe('computeFundBucketAverageCost — average cost (WAC)', () => {
  it('blends free (zero-cost) units into the average and realizes gain against the blend', () => {
    // Buy 100 @ 10 (cost 1000), then 10 free bonus units → 110 units still cost 1000.
    const txs = [
      tx({ id: 'b1', type: 'BUY', ticker: FUND_A, quantity: 100, price: 10, date: '2026-01-01' }),
      tx({ id: 'r1', type: 'REFUND_OF_CAPITAL', ticker: FUND_A, quantity: 10, price: 0, date: '2026-01-15' }),
      tx({ id: 's1', type: 'SELL', ticker: FUND_A, quantity: 50, price: 12, date: '2026-02-01' }),
    ];

    const { holding, realized } = computeFundBucketAverageCost(FUND_A, '_', txs, noConversions, fundMeta);

    // Average cost after bonus units = 1000 / 110 = 9.0909…
    const avg = 1000 / 110;
    expect(realized).toHaveLength(1);
    const r = realized[0];
    expect(r.buyAvg).toBeCloseTo(avg, 6);
    // Redemption of 50 @ 12: proceeds 600 - cost 50*avg.
    expect(r.profit).toBeCloseTo(600 - 50 * avg, 6);
    expect(r.eventType).toBe('redemption');

    // 60 units remain, still at the blended cost.
    expect(holding).not.toBeNull();
    expect(holding!.quantity).toBeCloseTo(60, 6);
    expect(holding!.avgPrice).toBeCloseTo(avg, 6);
  });

  it('is NOT FIFO: selling exactly the originally-bought units still books the bonus-unit gain', () => {
    // The reported bug: FIFO would match the 100 full-price units and show ~zero gain.
    const txs = [
      tx({ id: 'b1', type: 'BUY', ticker: FUND_A, quantity: 100, price: 10, date: '2026-01-01' }),
      tx({ id: 'r1', type: 'REFUND_OF_CAPITAL', ticker: FUND_A, quantity: 20, price: 0, date: '2026-01-10' }),
      tx({ id: 's1', type: 'SELL', ticker: FUND_A, quantity: 100, price: 10, date: '2026-02-01' }),
    ];

    const { realized } = computeFundBucketAverageCost(FUND_A, '_', txs, noConversions, fundMeta);
    // avg = 1000/120 = 8.333…; sell 100 @ 10 → profit = 1000 - 100*8.333 = 166.67, not 0.
    expect(realized[0].profit).toBeCloseTo(1000 - 100 * (1000 / 120), 4);
    expect(realized[0].profit).toBeGreaterThan(0);
  });

  it('leaves eventType undefined for non-fund portfolios', () => {
    const txs = [
      tx({ id: 'b1', type: 'BUY', ticker: FUND_A, quantity: 10, price: 10, date: '2026-01-01' }),
      tx({ id: 's1', type: 'SELL', ticker: FUND_A, quantity: 10, price: 11, date: '2026-02-01' }),
    ];
    const { realized } = computeFundBucketAverageCost(FUND_A, '_', txs, noConversions, {
      ...fundMeta,
      isFundPortfolio: false,
    });
    expect(realized[0].eventType).toBeUndefined();
  });

  it('returns a null holding once the pool is fully redeemed', () => {
    const txs = [
      tx({ id: 'b1', type: 'BUY', ticker: FUND_A, quantity: 10, price: 10, date: '2026-01-01' }),
      tx({ id: 's1', type: 'SELL', ticker: FUND_A, quantity: 10, price: 11, date: '2026-02-01' }),
    ];
    const { holding } = computeFundBucketAverageCost(FUND_A, '_', txs, noConversions, fundMeta);
    expect(holding).toBeNull();
  });

  it('carries buy-side fees into the average cost and keeps the held fraction on redemption', () => {
    const txs = [
      tx({ id: 'b1', type: 'BUY', ticker: FUND_A, quantity: 100, price: 10, date: '2026-01-01', commission: 50 }),
      tx({ id: 's1', type: 'SELL', ticker: FUND_A, quantity: 40, price: 12, date: '2026-02-01' }),
    ];
    const { holding } = computeFundBucketAverageCost(FUND_A, '_', txs, noConversions, fundMeta);
    // Cost 1000 + 50 fee = 1050 over 100 units = 10.5 avg; 60 units remain.
    expect(holding!.avgPrice).toBeCloseTo(10.5, 6);
    expect(holding!.quantity).toBeCloseTo(60, 6);
    // Held commission scales to the 60% still held.
    expect(holding!.totalCommission).toBeCloseTo(30, 6);
  });
});

describe('computeFundBucketAverageCost — conversions', () => {
  it('tags a linked SELL as a convert (not a redemption) and realizes its gain', () => {
    const sell = tx({ id: 's1', type: 'SELL', ticker: FUND_A, quantity: 100, price: 12, date: '2026-02-01', linkId: 'L1' });
    const buy = tx({ id: 'b2', type: 'BUY', ticker: FUND_B, quantity: 120, price: 10, date: '2026-02-01', linkId: 'L1' });
    const buyA = tx({ id: 'b1', type: 'BUY', ticker: FUND_A, quantity: 100, price: 10, date: '2026-01-01' });

    const conversionMap = buildFundConversionMap([buyA, sell, buy]);
    const { holding, realized } = computeFundBucketAverageCost(FUND_A, '_', [buyA, sell], conversionMap, fundMeta);

    expect(realized).toHaveLength(1);
    expect(realized[0].eventType).toBe('convert');
    expect(realized[0].profit).toBeCloseTo(1200 - 1000, 6); // sold 100 @ 12 vs cost 10
    expect(holding).toBeNull(); // whole position converted out
  });
});

describe('mergeFundHoldingsByCanon', () => {
  it('merges two buckets that canonicalize to the same fund, blending their average cost', () => {
    const canon = new Map<string, string>([['MF:legacy-a', FUND_A]]);
    const holdings = {
      [`${FUND_A}|_`]: {
        ticker: FUND_A, sector: 'Income', broker: 'ACME', quantity: 100, avgPrice: 10,
        currentPrice: 0, totalCommission: 0, totalTax: 0, totalCDC: 0, totalOtherFees: 0,
      },
      ['MF:legacy-a|_']: {
        ticker: 'MF:legacy-a', sector: 'Income', broker: 'ACME', quantity: 100, avgPrice: 12,
        currentPrice: 0, totalCommission: 0, totalTax: 0, totalCDC: 0, totalOtherFees: 0,
      },
    };
    const merged = mergeFundHoldingsByCanon(holdings, canon);
    const keys = Object.keys(merged);
    expect(keys).toHaveLength(1);
    expect(merged[keys[0]].quantity).toBeCloseTo(200, 6);
    expect(merged[keys[0]].avgPrice).toBeCloseTo(11, 6); // (100*10 + 100*12) / 200
  });
});
