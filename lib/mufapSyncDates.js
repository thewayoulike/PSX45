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
