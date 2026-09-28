import { describe, expect, it } from 'vitest';
import { rebalanceGaps } from './rebalancePlan';

describe('rebalance plan', () => {
  it('shows the rupee gap against targets that add up to 100 and does not create trades', () => {
    const plan = rebalanceGaps(
      [
        { ticker: 'OGDC', value: 46_000 },
        { ticker: 'MEBL', value: 18_000 },
        { ticker: 'LUCK', value: 22_000 },
      ],
      14_000,
      [
        { ticker: 'OGDC', percent: 30 },
        { ticker: 'MEBL', percent: 25 },
        { ticker: 'LUCK', percent: 25 },
        { ticker: 'CASH', percent: 20 },
      ],
    );
    expect(plan.ok).toBe(true);
    const ogdc = plan.rows.find(row => row.ticker === 'OGDC');
    expect(ogdc?.currentPercent).toBeCloseTo(46, 4);
    expect(ogdc?.targetPercent).toBe(30);
    expect(ogdc?.gapRupees).toBeCloseTo(-16_000, 4);
    expect(plan.rows.find(row => row.ticker === 'CASH')?.gapRupees).toBeCloseTo(6_000, 4);
    expect(JSON.stringify(plan)).not.toMatch(/"type":"BUY"|"type":"SELL"/);
  });

  it('refuses targets that do not add up to 100', () => {
    const plan = rebalanceGaps(
      [{ ticker: 'OGDC', value: 100 }],
      0,
      [{ ticker: 'OGDC', percent: 40 }, { ticker: 'CASH', percent: 40 }],
    );
    expect(plan.ok).toBe(false);
    expect(plan.rows).toEqual([]);
    expect(plan.sum).toBe(80);
  });
});
