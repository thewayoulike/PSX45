import { formatDatePK } from './dates';

/** Whole Pakistan calendar days from today until the meeting. Negative means it has passed. */
export function daysUntilMeeting(date: Date, today = new Date()): number {
  const ms = Date.parse(`${formatDatePK(date)}T00:00:00Z`) - Date.parse(`${formatDatePK(today)}T00:00:00Z`);
  return Math.round(ms / 86400000);
}
