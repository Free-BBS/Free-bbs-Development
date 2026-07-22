const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const MYSQL_DATETIME = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?$/;
const ZONED_INSTANT = /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/i;

function validDate(date: Date, message: string): Date {
  if (Number.isNaN(date.getTime())) throw new TypeError(message);
  return date;
}

export function encodeUtcDateTime(value: string | Date | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return new Date(validDate(value, 'Invalid UTC date-time').getTime());
  if (!ZONED_INSTANT.test(value)) {
    throw new TypeError('UTC date-time must include Z or an explicit numeric offset');
  }
  return validDate(new Date(value), 'Invalid UTC date-time');
}

export function decodeUtcDateTime(value: unknown): string {
  if (value instanceof Date) return validDate(value, 'Invalid UTC date-time').toISOString();
  if (typeof value !== 'string') throw new TypeError('Invalid UTC date-time from MySQL');
  const mysql = MYSQL_DATETIME.exec(value);
  if (mysql) {
    const [, year, month, day, hour, minute, second, fraction = ''] = mysql;
    const milliseconds = Number(fraction.padEnd(3, '0').slice(0, 3));
    const date = new Date(
      Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second),
        milliseconds,
      ),
    );
    if (
      date.getUTCFullYear() !== Number(year) ||
      date.getUTCMonth() !== Number(month) - 1 ||
      date.getUTCDate() !== Number(day) ||
      date.getUTCHours() !== Number(hour) ||
      date.getUTCMinutes() !== Number(minute) ||
      date.getUTCSeconds() !== Number(second) ||
      date.getUTCMilliseconds() !== milliseconds
    ) {
      throw new TypeError('Invalid UTC date-time from MySQL');
    }
    return validDate(date, 'Invalid UTC date-time from MySQL').toISOString();
  }
  const encoded = encodeUtcDateTime(value);
  if (!encoded) throw new TypeError('Invalid UTC date-time from MySQL');
  return encoded.toISOString();
}

export function encodeDateOnly(value: string): string {
  const match = DATE_ONLY.exec(value);
  if (!match) throw new TypeError('DATE must be a YYYY-MM-DD calendar date');
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) {
    throw new TypeError('DATE must be a valid calendar date');
  }
  return value;
}

export const decodeDateOnly = encodeDateOnly;
