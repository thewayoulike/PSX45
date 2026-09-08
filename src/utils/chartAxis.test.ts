import { describe, expect, it } from 'vitest';
import { fmtChartAxisDate } from './chartAxis';

describe('fmtChartAxisDate', () => {
  it('labels PSX daily bars by Asia/Karachi calendar day (not browser TZ)', () => {
    // 2026-09-08 04:00 UTC = 09:00 in Karachi → Sep 8
    const t = Date.UTC(2026, 8, 8, 4, 0, 0);
    expect(fmtChartAxisDate(t, 'day')).toMatch(/Sep\s*8,\s*2026/);
  });

  it('keeps Sep 8 for UTC-midnight stamps that look like Sep 7 in US timezones', () => {
    // 2026-09-08 00:00 UTC = Sep 7 evening in US, but Sep 8 morning in Karachi
    const t = Date.UTC(2026, 8, 8, 0, 0, 0);
    expect(fmtChartAxisDate(t, 'day')).toMatch(/Sep\s*8,\s*2026/);
  });
});
