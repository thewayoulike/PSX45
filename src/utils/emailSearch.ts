import { formatDatePK } from './dates';

export type EmailSearchPeriod = 'all' | '1m' | '3m' | '6m' | '1y' | 'custom';
export interface EmailSearchFilters {
  sender: string;
  subject: string;
  period: EmailSearchPeriod;
  startDate: string;
  endDate: string;
}

const dayMs = 86400000;
function calendarDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Choose both a start date and an end date.');
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error('Choose valid calendar dates.');
  return date;
}

/** Calendar-month presets and inclusive end dates, using the app's Pakistan timezone. */
export function emailSearchDates(period: EmailSearchPeriod, startDate = '', endDate = '', now = new Date()): { start: string; end: string } | null {
  if (period === 'all') return null;
  if (period === 'custom') {
    calendarDate(startDate); calendarDate(endDate);
    if (startDate > endDate) throw new Error('Start date must be on or before the end date.');
    return { start: startDate, end: endDate };
  }
  const months = { '1m': 1, '3m': 3, '6m': 6, '1y': 12 }[period];
  const end = formatDatePK(now);
  const today = calendarDate(end);
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - months, 1));
  const lastDay = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
  start.setUTCDate(Math.min(today.getUTCDate(), lastDay));
  return { start: start.toISOString().slice(0, 10), end };
}

export function buildEmailSearchQuery(filters: EmailSearchFilters, now = new Date()): string {
  const parts: string[] = [];
  if (filters.sender.trim()) parts.push(`from:${filters.sender.trim()}`);
  if (filters.subject.trim()) parts.push(`subject:(${filters.subject.trim()})`);
  const dates = emailSearchDates(filters.period, filters.startDate, filters.endDate, now);
  if (dates) {
    // Gmail treats date strings as PST. Epoch seconds keep the selected Pakistan days correct.
    // https://developers.google.com/workspace/gmail/api/guides/filtering
    const start = Date.parse(`${dates.start}T00:00:00+05:00`);
    const endExclusive = Date.parse(`${dates.end}T00:00:00+05:00`) + dayMs;
    parts.push(`after:${start / 1000}`, `before:${endExclusive / 1000}`);
  }
  return parts.join(' ');
}
