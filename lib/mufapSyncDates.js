/** Shared date helpers for MUFAP NAV sync (testable without network). */

/** Asia/Karachi calendar date as YYYY-MM-DD. */
export function pkToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Add calendar days to a YYYY-MM-DD (PK-oriented, noon UTC avoids edge flips). */
export function addDaysYmd(ymd, delta) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 7, 0, 0));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

/** UTC weekday for a YYYY-MM-DD (0=Sun … 6=Sat). */
function weekdayUtc(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 7, 0, 0)).getUTCDay();
}

/** True for Sat/Sun — PSX/MUFAP have no regular NAV publish those days. */
export function isWeekendYmd(ymd) {
  const wd = weekdayUtc(ymd);
  return wd === 0 || wd === 6;
}

/**
 * Prior business day (skips Sat/Sun).
 * Mon → Fri; Sat/Sun → Fri.
 */
export function previousBusinessDay(ymd) {
  let d = addDaysYmd(ymd, -1);
  while (isWeekendYmd(d)) d = addDaysYmd(d, -1);
  return d;
}

/**
 * Dates to try for “latest NAV”, newest first.
 * Covers late AMC publishes and empty same-day MUFAP pages.
 */
export function candidateNavDates(todayYmd, lookbackDays = 5) {
  const n = Math.max(1, lookbackDays | 0);
  const out = [];
  for (let i = 0; i < n; i++) out.push(addDaysYmd(todayYmd, -i));
  return out;
}

/**
 * Prior NAV day candidates for Daily P&L (newest first).
 * Starts at previous business day, then further weekdays only —
 * so Monday’s “yesterday” is Friday, not the weekend.
 */
export function candidatePrevNavDates(todayYmd, lookbackDays = 5) {
  const n = Math.max(1, lookbackDays | 0);
  const out = [];
  let d = previousBusinessDay(todayYmd);
  while (out.length < n) {
    if (!isWeekendYmd(d)) out.push(d);
    d = addDaysYmd(d, -1);
  }
  return out;
}
