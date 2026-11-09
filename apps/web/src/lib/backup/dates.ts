/**
 * Date helpers ported from the app (utils/formatters.ts, utils/financialMonth.ts,
 * utils/statementPeriods.ts). Everything is local time: the app writes a bare
 * `YYYY-MM-DD` for quick entries and a full ISO stamp otherwise, and reads both
 * as the user's local day: the phone's, wherever the browser is.
 */

export type MonthCycle = { defaultDay: number; overrides: Record<string, number> };

const pad2 = (value: number) => String(value).padStart(2, "0");

export function dayKeyOf(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/**
 * The phone's time zone, from the transfer. The app reads every stamp as the
 * phone's local day and hour, so a browser in another zone (travel, a VPN, a
 * remote machine) must read them the same way: as the phone's wall clock.
 * Null reads them in this browser's own zone.
 */
let phoneTimeZone: string | null = null;
let wallClock: Intl.DateTimeFormat | null = null;

export function setPhoneTimeZone(timeZone: string | null | undefined) {
  phoneTimeZone = null;
  wallClock = null;
  if (!timeZone) return;
  try {
    wallClock = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    phoneTimeZone = timeZone;
  } catch {
    // Not a zone this browser knows: fall back to its own.
  }
}

/** The app's average month: a Gregorian year over twelve. */
export const DAYS_PER_MONTH = 365.2425 / 12;

/**
 * An instant as the phone's wall-clock time, expressed as a local `Date`, so
 * a moment (when the phone made its export) reads on the phone's clock like
 * every stamp in the backup does.
 */
export function onPhoneClock(instant: Date): Date {
  if (!wallClock || !phoneTimeZone) return instant;
  const parts: Record<string, number> = {};
  for (const part of wallClock.formatToParts(instant)) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  return new Date(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
}

/** A bare day key or an ISO stamp, as a local `Date` on the phone's clock. */
export function parseLocalDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : onPhoneClock(parsed);
}

export function clampDate(year: number, month0: number, day: number): Date {
  const lastDay = new Date(year, month0 + 1, 0).getDate();
  return new Date(year, month0, Math.min(Math.max(day, 1), lastDay));
}

export function addMonthsToDayKey(dayKey: string, months: number): string {
  const base = parseLocalDate(dayKey) ?? new Date();
  return dayKeyOf(clampDate(base.getFullYear(), base.getMonth() + months, base.getDate()));
}

export function nextOccurrenceOfMonthDay(day: number, after: Date): Date {
  const same = clampDate(after.getFullYear(), after.getMonth(), day);
  if (same.getTime() > after.getTime()) return same;
  return clampDate(after.getFullYear(), after.getMonth() + 1, day);
}

export function shiftMonthKey(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const index = y * 12 + (m - 1) + delta;
  return `${Math.floor(index / 12)}-${pad2((index % 12) + 1)}`;
}

/** Every month key from `start` to `end`, inclusive. */
export function monthRange(start: string, end: string): string[] {
  const keys: string[] = [];
  for (let key = start; key <= end; key = shiftMonthKey(key, 1)) keys.push(key);
  return keys;
}

const clampFirstDay = (value: unknown) =>
  typeof value === "number" && Number.isInteger(value) ? Math.min(31, Math.max(1, value)) : 1;

export function parseMonthCycle(
  firstDay: number | null | undefined,
  overridesJson: string | null | undefined,
): MonthCycle {
  let overrides: Record<string, number> = {};
  if (overridesJson) {
    try {
      const parsed = JSON.parse(overridesJson) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        overrides = Object.fromEntries(
          Object.entries(parsed as Record<string, unknown>).filter(
            (entry): entry is [string, number] => typeof entry[1] === "number",
          ),
        );
      }
    } catch {
      overrides = {};
    }
  }
  return { defaultDay: clampFirstDay(firstDay), overrides };
}

function firstDayFor(cycle: MonthCycle, year: number, month1: number): number {
  const override = cycle.overrides[`${year}-${pad2(month1)}`];
  const day = clampFirstDay(override ?? cycle.defaultDay);
  return Math.min(day, new Date(year, month1, 0).getDate());
}

/**
 * The financial month a date belongs to. A month is named after the calendar
 * month it starts in, so with a start day of 25, 25 Oct – 24 Nov is `YYYY-10`.
 */
export function financialMonthKey(date: Date, cycle: MonthCycle): string {
  const year = date.getFullYear();
  const month1 = date.getMonth() + 1;
  const firstDay = firstDayFor(cycle, year, month1);
  if (date.getDate() >= firstDay) return `${year}-${pad2(month1)}`;
  return month1 === 1 ? `${year - 1}-12` : `${year}-${pad2(month1 - 1)}`;
}

export function financialMonthRange(monthKey: string, cycle: MonthCycle) {
  const [y, m] = monthKey.split("-").map(Number);
  const start = new Date(y, m - 1, firstDayFor(cycle, y, m));
  const next = shiftMonthKey(monthKey, 1);
  const [ny, nm] = next.split("-").map(Number);
  const nextStart = new Date(ny, nm - 1, firstDayFor(cycle, ny, nm));
  const end = new Date(nextStart.getFullYear(), nextStart.getMonth(), nextStart.getDate() - 1);
  return { start, end };
}

/** Every local day from `start` to `end`, inclusive, as day keys. */
export function dayRange(start: Date, end: Date): string[] {
  const keys: string[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  while (cursor.getTime() <= end.getTime()) {
    keys.push(dayKeyOf(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

export function daysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / 86_400_000);
}
