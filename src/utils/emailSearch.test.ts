import { describe, expect, it } from 'vitest';
import { buildEmailSearchQuery, emailSearchDates, type EmailSearchFilters, type EmailSearchPeriod } from './emailSearch';

const now = new Date('2026-09-25T10:00:00Z');
const filters: EmailSearchFilters = { sender: '', subject: '', period: '1m', startDate: '', endDate: '' };

describe('email search periods', () => {
  it.each([
    ['1m', '2026-08-25'], ['3m', '2026-06-25'], ['6m', '2026-03-25'], ['1y', '2025-09-25'],
  ])('uses calendar months for %s through today', (period, start) => {
    expect(emailSearchDates(period as EmailSearchPeriod, '', '', now)).toEqual({ start, end: '2026-09-25' });
  });
  it('clamps month ends and leap-day anniversaries', () => {
    expect(emailSearchDates('1m', '', '', new Date('2026-03-31T08:00:00Z'))?.start).toBe('2026-02-28');
    expect(emailSearchDates('1m', '', '', new Date('2024-03-31T08:00:00Z'))?.start).toBe('2024-02-29');
    expect(emailSearchDates('1y', '', '', new Date('2024-02-29T08:00:00Z'))?.start).toBe('2023-02-28');
  });
  it('uses the Pakistan day when the UTC date differs', () => {
    expect(emailSearchDates('1m', '', '', new Date('2026-09-24T20:00:00Z'))).toEqual({ start: '2026-08-25', end: '2026-09-25' });
  });
  it('allows a single custom day and includes the whole end day in Pakistan time', () => {
    const query = buildEmailSearchQuery({ ...filters, period: 'custom', startDate: '2026-09-25', endDate: '2026-09-25' }, now);
    const start = Number(query.match(/after:(\d+)/)![1]);
    const end = Number(query.match(/before:(\d+)/)![1]);
    expect(new Date(start * 1000).toISOString()).toBe('2026-09-24T19:00:00.000Z');
    expect(new Date(end * 1000).toISOString()).toBe('2026-09-25T19:00:00.000Z');
  });
  it('combines sender/subject with dates and permits date-only searches', () => {
    expect(buildEmailSearchQuery({ ...filters, sender: ' broker@example.com ', subject: ' Equity Trade ' }, now)).toMatch(/^from:broker@example.com subject:\(Equity Trade\) after:\d+ before:\d+$/);
    expect(buildEmailSearchQuery(filters, now)).toMatch(/^after:\d+ before:\d+$/);
  });
  it('preserves all-time search without stale custom dates', () => {
    expect(buildEmailSearchQuery({ ...filters, period: 'all', sender: 'broker@example.com', startDate: 'invalid' }, now)).toBe('from:broker@example.com');
  });
  it.each([
    ['', '2026-09-25'], ['2026-09-25', ''], ['2026-09-26', '2026-09-25'],
    ['2026-02-30', '2026-09-25'], ['not-a-date', '2026-09-25'],
  ])('rejects an invalid custom range %s / %s', (startDate, endDate) => {
    expect(() => buildEmailSearchQuery({ ...filters, period: 'custom', startDate, endDate }, now)).toThrow();
  });
});
