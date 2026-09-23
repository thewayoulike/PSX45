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

/** Regular PSX session in Pakistan time (Mon–Thu ~9:15–15:45, Fri ~9:00–12:30). */
export const isPsxMarketHours = (now: Date = new Date()): boolean => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: PK_TIMEZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const weekday = parts.find((p) => p.type === 'weekday')?.value || '';
  const hour = Number(parts.find((p) => p.type === 'hour')?.value);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return false;
  if (weekday === 'Sat' || weekday === 'Sun') return false;
  const mins = hour * 60 + minute;
  if (weekday === 'Fri') return mins >= 9 * 60 && mins <= 12 * 60 + 30;
  return mins >= 9 * 60 + 15 && mins <= 15 * 60 + 45;
};

const MONTH_INDEX: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const calendarDay = (year: number, month: number, day: number): string => {
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1990) return '';
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return '';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

/** Normalize a form/import date to a Pakistan calendar day. Blank input is today. Unreadable text is blank so the row can be flagged. */
export const toDatePK = (input?: unknown): string => {
  if (input === null || input === undefined || input === '') return todayPK();
  if (typeof input === 'number' && Number.isFinite(input)) {
    const serial = Math.floor(input);
    const date = new Date(Math.round((serial - 25569) * 86400 * 1000));
    return Number.isNaN(date.getTime()) ? '' : formatDatePK(date);
  }
  const str = String(input).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const slash = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) return calendarDay(Number(slash[3]), Number(slash[2]), Number(slash[1]));
  const dashMonth = str.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (dashMonth) {
    const month = MONTH_INDEX[dashMonth[2].toLowerCase()];
    return month ? calendarDay(Number(dashMonth[3]), month, Number(dashMonth[1])) : '';
  }
  const named = str.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (named) {
    const month = MONTH_INDEX[named[1].slice(0, 3).toLowerCase()];
    return month ? calendarDay(Number(named[3]), month, Number(named[2])) : '';
  }
  const dateObj = new Date(str);
  if (!Number.isNaN(dateObj.getTime()) && str.length > 5 && !/[a-zA-Z]/.test(str)) {
    return formatDatePK(dateObj);
  }
  return '';
};
