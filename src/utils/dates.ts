/** Pakistan Standard Time (Asia/Karachi, UTC+5, no DST). */
export const PK_TIMEZONE = 'Asia/Karachi';

/** Calendar day YYYY-MM-DD in Pakistan, not UTC. */
export const formatDatePK = (date: Date = new Date()): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: PK_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);

export const todayPK = (): string => formatDatePK();

/** Normalize a form/import date to a Pakistan calendar day. */
export const toDatePK = (input?: unknown): string => {
  if (input === null || input === undefined || input === '') return todayPK();
  if (typeof input === 'number') {
    const date = new Date(Math.round((input - 25569) * 86400 * 1000));
    return Number.isNaN(date.getTime()) ? todayPK() : formatDatePK(date);
  }
  const str = String(input).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const dateObj = new Date(str);
  if (!Number.isNaN(dateObj.getTime()) && str.length > 5 && !/[a-zA-Z]/.test(str)) {
    return formatDatePK(dateObj);
  }
  return todayPK();
};
