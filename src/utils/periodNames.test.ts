import { describe, expect, it } from 'vitest';
import { realPeriodNames, withRealPeriods } from './periodNames';

describe('real period names', () => {
  it('uses the PSX page column names when the data only has FY placeholders', () => {
    expect(realPeriodNames(['FY', 'FY-1', 'FY-2'], ['2026', '2025', '2024'])).toEqual(['2026', '2025', '2024']);
    expect(realPeriodNames(['FY', 'FY-1'], ['Q1 2027', 'Q3 2026'], false)).toEqual(['Q1 2027', 'Q3 2026']);
  });
  it('counts back from the nearest real year', () => {
    expect(realPeriodNames(['2026', '2025', 'FY-2', 'FY-3'])).toEqual(['2026', '2025', '2024', '2023']);
  });
  it('falls back to plain words when no year is known', () => {
    expect(realPeriodNames(['FY', 'FY-1', 'FY-2'])).toEqual(['Latest year', '1 year earlier', '2 years earlier']);
    expect(realPeriodNames(['FY', 'FY-1'], [], false)).toEqual(['Latest quarter', '1 quarter earlier']);
  });
  it('leaves real labels alone', () => {
    const rows = [{ year: '2025', eps: '1' }];
    expect(withRealPeriods(rows, [{ year: '2024' }])).toBe(rows);
  });
});
