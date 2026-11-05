import { describe, expect, it } from 'vitest';
import { latestSavedHistory } from './portfolioHistoryCache';
import { PERFORMANCE_METHOD } from './stockPerformance';

const row = (rawDate: string, sourceKey: string, fetchedAt: string) =>
  ({ date: rawDate, rawDate, Portfolio: 1, KSE100: 1, KMI30: 1, method: PERFORMANCE_METHOD, sourceKey, fetchedAt, netWorth: 100 });

describe('last saved chart after an edit', () => {
  it('uses the newest saved ledger version, whichever key it has', () => {
    const drive = [row('2026-11-03', 'old', '2026-11-03T10:00:00Z'), row('2026-11-04', 'newer', '2026-11-04T10:00:00Z')];
    const device = [row('2026-11-03', 'newer', '2026-11-04T10:00:00Z')];
    expect(latestSavedHistory(device, drive).map(r => [r.rawDate, r.sourceKey])).toEqual([['2026-11-03', 'newer'], ['2026-11-04', 'newer']]);
  });
  it('returns nothing when no chart was ever saved', () => {
    expect(latestSavedHistory([], undefined)).toEqual([]);
  });
});
