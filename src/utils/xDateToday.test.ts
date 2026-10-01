import { afterEach, expect, it, vi } from 'vitest';
import { companyInfoToUpcomingPayouts } from './xDateMerge';

const originalTz = process.env.TZ;
afterEach(() => { vi.useRealTimers(); process.env.TZ = originalTz; });

it('marks an ex-date as today in Pakistan, including just after midnight', () => {
  process.env.TZ = 'Asia/Karachi';
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-01T19:30:00Z')); // 00:30 PKT on 2 October
  const [payout] = companyInfoToUpcomingPayouts({ symbol: 'ogdc', latestDividend: { exDividendDate: '2026-10-02', cashAmount: 'Rs. 3.00' } as any });
  expect(payout).toMatchObject({ ticker: 'OGDC', isDueToday: true });
  const [later] = companyInfoToUpcomingPayouts({ symbol: 'ogdc', latestDividend: { exDividendDate: '2026-10-03', cashAmount: 'Rs. 3.00' } as any });
  expect((later as any).isDueToday).toBeUndefined();
});
