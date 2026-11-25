import { describe, expect, it } from 'vitest';
import { blankDayReason } from './PerformanceChart';

describe('blankDayReason', () => {
  it('is empty when the day has a value', () => {
    expect(blankDayReason({ Portfolio: 0.4 })).toBeNull();
  });
  it('names the stock with a corporate action first', () => {
    expect(blankDayReason({ Portfolio: null, corporateActions: ['MACTER'], missing: ['KEL'] })).toContain('MACTER');
  });
  it('names stocks without a closing price', () => {
    expect(blankDayReason({ Portfolio: null, missing: ['A', 'B', 'C', 'D', 'E'] })).toContain('A, B, C and 2 more');
  });
  it('explains a day with no shares', () => {
    expect(blankDayReason({ Portfolio: null })).toMatch(/held no shares/);
  });
});
