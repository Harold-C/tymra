export const NEW_ZEALAND_TIME_ZONE = "Pacific/Auckland" as const;

const datePartsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: NEW_ZEALAND_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const dateTimePartsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: NEW_ZEALAND_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export function nzDateKey(value: Date): string {
  const parts = partValues(datePartsFormatter, value);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function addNzCalendarDays(value: Date | string, days: number): string {
  if (!Number.isInteger(days)) throw new Error("New Zealand calendar-day offset must be an integer");
  const { year, month, day } = parseDateKey(typeof value === "string" ? value : nzDateKey(value));
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return `${shifted.getUTCFullYear()}-${twoDigits(shifted.getUTCMonth() + 1)}-${twoDigits(shifted.getUTCDate())}`;
}

export function addNzCalendarMonths(value: Date | string, months: number): string {
  if (!Number.isInteger(months)) throw new Error("New Zealand calendar-month offset must be an integer");
  const { year, month, day } = parseDateKey(typeof value === "string" ? value : nzDateKey(value));
  const targetMonth = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(targetMonth.getUTCFullYear(), targetMonth.getUTCMonth() + 1, 0)).getUTCDate();
  return `${targetMonth.getUTCFullYear()}-${twoDigits(targetMonth.getUTCMonth() + 1)}-${twoDigits(Math.min(day, lastDay))}`;
}

export function nzDayOfWeek(value: Date | string): number {
  const { year, month, day } = parseDateKey(typeof value === "string" ? value : nzDateKey(value));
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function nzStartOfDay(value: Date | string): Date {
  const { year, month, day } = parseDateKey(typeof value === "string" ? value : nzDateKey(value));
  return nzLocalDateTime(year, month, day, 0, 0, 0);
}

export function nzDateTime(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/u.exec(value);
  if (!match) throw new Error(`Invalid New Zealand local date-time ${value}`);
  const dateKey = `${match[1]}-${match[2]}-${match[3]}`;
  parseDateKey(dateKey);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] ?? 0);
  if (hour > 23 || minute > 59 || second > 59) throw new Error(`Invalid New Zealand local date-time ${value}`);
  return nzLocalDateTime(Number(match[1]), Number(match[2]), Number(match[3]), hour, minute, second);
}

export function nzEndOfDay(value: Date | string): Date {
  return new Date(nzStartOfDay(addNzCalendarDays(value, 1)).getTime() - 1);
}

export function nzCalendarDayDifference(later: Date | string, earlier: Date | string): number {
  return dateKeyOrdinal(typeof later === "string" ? later : nzDateKey(later))
    - dateKeyOrdinal(typeof earlier === "string" ? earlier : nzDateKey(earlier));
}

export function nzDateStorageValue(value: Date | string): Date {
  const key = typeof value === "string" ? value : nzDateKey(value);
  parseDateKey(key);
  return new Date(`${key}T00:00:00.000Z`);
}

function nzLocalDateTime(year: number, month: number, day: number, hour: number, minute: number, second: number): Date {
  const wallClock = Date.UTC(year, month - 1, day, hour, minute, second);
  let instant = new Date(wallClock);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const offset = timezoneOffsetMs(instant);
    const corrected = new Date(wallClock - offset);
    if (corrected.getTime() === instant.getTime()) return corrected;
    instant = corrected;
  }
  return instant;
}

function timezoneOffsetMs(value: Date): number {
  const parts = partValues(dateTimePartsFormatter, value);
  return Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  ) - value.getTime();
}

function dateKeyOrdinal(value: string): number {
  const { year, month, day } = parseDateKey(value);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

function parseDateKey(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) throw new Error(`Invalid New Zealand calendar date ${value}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error(`Invalid New Zealand calendar date ${value}`);
  }
  return { year, month, day };
}

function partValues(formatter: Intl.DateTimeFormat, value: Date) {
  return Object.fromEntries(formatter.formatToParts(value).map((part) => [part.type, part.value])) as Record<string, string>;
}

function twoDigits(value: number) {
  return String(value).padStart(2, "0");
}
