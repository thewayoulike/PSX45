// PSX session calendar: holidays and special trading hours. Update each year from PSX notices.
// Moon-dependent holidays (Eid, Ashura, Eid Milad) are announced shortly before; add them here when
// PSX publishes them. A missing holiday is still caught by the "no trades" notice in the Lab.

/** Fixed-date national holidays (MM-DD) when PSX is closed. */
export const FIXED_HOLIDAYS = ['02-05', '03-23', '05-01', '05-28', '08-14', '11-09', '12-25'];
/** Extra closures for specific dates (YYYY-MM-DD), e.g. Eid announced by PSX. */
export const EXTRA_HOLIDAYS: string[] = [];

/** Continuous-trading windows in minutes after midnight PKT. */
export type SessionHours = { weekday: [number, number][]; friday: [number, number][] };
/**
 * Special hours by date range (inclusive). Ramadan 2026 per PSX notice N-209 (18 Feb 2026),
 * seen via news reports: Mon–Thu 09:17–13:30, Fri 09:17–12:30.
 */
export const SPECIAL_HOURS: { from: string; to: string; label: string; hours: SessionHours }[] = [
  { from: '2026-02-19', to: '2026-03-19', label: 'Ramadan', hours: { weekday: [[557, 810]], friday: [[557, 750]] } },
];

export function isHoliday(day: string) {
  return FIXED_HOLIDAYS.includes(day.slice(5)) || EXTRA_HOLIDAYS.includes(day);
}
export function specialHours(day: string) {
  return SPECIAL_HOURS.find(s => day >= s.from && day <= s.to) ?? null;
}
