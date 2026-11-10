/**
 * The local calendar day of a stored instant, without asking `Date` for the
 * local time of every row.
 *
 * Hermes keeps a small cache of the time zone's UTC offsets, and it only grows
 * when instants are looked up oldest first. The app holds its transactions
 * newest first, so every pass that read a local date (`getFullYear()` and
 * friends) missed that cache on every row: about 11µs a row on an iPhone
 * simulator against 0.06µs oldest first, which made each pass over 20,000
 * transactions (the launch sort, the calendar's month groups, the widget
 * snapshot) cost over 200ms. Walking the dates oldest first once does not fix
 * it: the cache holds only a few years of daylight-saving changes, and warming
 * one range evicts another.
 *
 * So the offset is kept here, per UTC day. A block of days is learned together,
 * oldest first (the order Hermes answers quickly), by reading the offset at
 * each day boundary. A day whose two ends agree has that offset throughout; a
 * day they differ on (a daylight-saving change, or a zone moving its clocks)
 * is left to `Date`, as is anything outside 1970 to 2100 or with an offset
 * that is not whole minutes. The civil date then comes from integer
 * arithmetic, and each day is one shared object, so its keys are built once.
 */

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;
/** UTC days whose offsets are learned together. */
const BLOCK_DAYS = 64;
const FAST_PATH_START_MS = 0;
const FAST_PATH_END_MS = Date.UTC(2100, 0, 1);

/** A local calendar day. One shared object per day: do not change it. */
export interface LocalDay {
  /** `YYYY-MM-DD`. */
  readonly dayKey: string;
  /** `YYYY-MM`. */
  readonly monthKey: string;
  readonly year: number;
  /** 1 to 12. */
  readonly month1: number;
  readonly day: number;
}

/**
 * UTC day number -> the zone's `getTimezoneOffset()` minutes for the whole of
 * that day, or NaN when the offset changes during it.
 */
let offsetByUtcDay = new Map<number, number>();
/** Local days by their day number (days since 1970-01-01 on the local calendar). */
let localDayByNumber = new Map<number, LocalDay>();
/** The first UTC day of every block learned so far. */
let learnedBlocks: number[] = [];
let cachedZoneFingerprint: string | null = null;

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

function offsetAt(timeMs: number): number {
  return new Date(timeMs).getTimezoneOffset();
}

/**
 * Learn the offsets of the block of days holding `utcDay`, oldest first, and
 * return that day's. One read per day boundary, shared by the two days it
 * separates.
 */
function learnBlock(utcDay: number): number {
  // A new block is rare, so it is also where a zone change gets noticed
  // between foregrounds (by the quick check only: re-reading every block for
  // each new one would make learning a long history quadratic).
  dropLearnedDaysIfZoneChanged();
  const first = Math.floor(utcDay / BLOCK_DAYS) * BLOCK_DAYS;
  learnedBlocks.push(first);
  let atStart = offsetAt(first * DAY_MS);
  for (let day = first; day < first + BLOCK_DAYS; day += 1) {
    const atEnd = offsetAt((day + 1) * DAY_MS);
    offsetByUtcDay.set(day, atStart === atEnd && Number.isInteger(atStart) ? atStart : NaN);
    atStart = atEnd;
  }
  return offsetByUtcDay.get(utcDay) as number;
}

/** The civil date of a day number, by Howard Hinnant's `civil_from_days`. */
function localDayForNumber(dayNumber: number): LocalDay {
  const cached = localDayByNumber.get(dayNumber);
  if (cached) return cached;
  const shifted = dayNumber + 719_468;
  const era = Math.floor(shifted / 146_097);
  const dayOfEra = shifted - era * 146_097;
  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1460) +
      Math.floor(dayOfEra / 36_524) -
      Math.floor(dayOfEra / 146_096)) /
      365,
  );
  const dayOfYear =
    dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const monthFromMarch = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * monthFromMarch + 2) / 5) + 1;
  const month1 = monthFromMarch < 10 ? monthFromMarch + 3 : monthFromMarch - 9;
  const year = yearOfEra + era * 400 + (month1 <= 2 ? 1 : 0);
  const monthKey = `${year}-${pad2(month1)}`;
  const localDay: LocalDay = { dayKey: `${monthKey}-${pad2(day)}`, monthKey, year, month1, day };
  localDayByNumber.set(dayNumber, localDay);
  return localDay;
}

/** The slow, always-right answer: the local date as `Date` reports it. */
function localDayFromDate(date: Date): LocalDay {
  const year = date.getFullYear();
  const month1 = date.getMonth() + 1;
  const day = date.getDate();
  if (year >= 1970 && year < 2100) {
    return localDayForNumber(Math.floor(Date.UTC(year, month1 - 1, day) / DAY_MS));
  }
  // Outside the cached range the year need not be four digits; keep the keys
  // exactly as the app has always written them.
  const monthKey = `${year}-${pad2(month1)}`;
  return { dayKey: `${monthKey}-${pad2(day)}`, monthKey, year, month1, day };
}

/**
 * The local calendar day `timeMs` (epoch milliseconds) falls on: the same
 * year, month and day `new Date(timeMs)` reports. `timeMs` must be a real
 * time, not NaN.
 */
export function localDayOfTime(timeMs: number): LocalDay {
  if (!(timeMs >= FAST_PATH_START_MS && timeMs < FAST_PATH_END_MS)) {
    return localDayFromDate(new Date(timeMs));
  }
  const utcDay = Math.floor(timeMs / DAY_MS);
  const offset = offsetByUtcDay.get(utcDay) ?? learnBlock(utcDay);
  if (Number.isNaN(offset)) return localDayFromDate(new Date(timeMs));
  return localDayForNumber(Math.floor((timeMs - offset * MINUTE_MS) / DAY_MS));
}

/** Days in a calendar month (`month1` is 1 to 12), without building a `Date`. */
export function daysInCalendarMonth(year: number, month1: number): number {
  if (month1 === 2) return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28;
  return month1 === 4 || month1 === 6 || month1 === 9 || month1 === 11 ? 30 : 31;
}

function zoneFingerprint(): string {
  const year = new Date().getFullYear();
  return `${offsetAt(Date.UTC(year, 0, 1))}:${offsetAt(Date.UTC(year, 6, 1))}:${offsetAt(Date.now())}`;
}

/** Forget every learned offset and day. */
export function resetLocalDays(): void {
  offsetByUtcDay = new Map();
  localDayByNumber = new Map();
  learnedBlocks = [];
  cachedZoneFingerprint = null;
}

/** The quick check: this year's offsets. Returns whether anything was dropped. */
function dropLearnedDaysIfZoneChanged(): boolean {
  const fingerprint = zoneFingerprint();
  if (cachedZoneFingerprint === null) {
    cachedZoneFingerprint = fingerprint;
    return false;
  }
  if (cachedZoneFingerprint === fingerprint) return false;
  resetLocalDays();
  cachedZoneFingerprint = fingerprint;
  return true;
}

/** Days between the offsets re-read in each learned block by the full check. */
const RECHECK_STRIDE_DAYS = 16;

/**
 * Whether the zone still gives the offsets that were learned, by re-reading
 * one day in sixteen of every block, oldest first. Two zones can agree all
 * this year and differ in the years the entries are from (Amman and Riyadh
 * since 2022, Asuncion and Buenos Aires since 2024), which this year's
 * offsets alone cannot tell apart.
 */
function learnedOffsetsStillHold(): boolean {
  const blocks = [...learnedBlocks].sort((a, b) => a - b);
  for (const first of blocks) {
    for (let day = first; day < first + BLOCK_DAYS; day += RECHECK_STRIDE_DAYS) {
      const learned = offsetByUtcDay.get(day);
      if (learned === undefined || Number.isNaN(learned)) continue;
      if (offsetAt(day * DAY_MS) !== learned) return false;
    }
  }
  return true;
}

/**
 * Drop the learned offsets when the device's time zone is no longer the one
 * they were read in (travel, or a changed setting). The app calls it on every
 * return to the foreground; it costs a few offset reads per learned block.
 * Returns whether anything was dropped.
 */
export function syncLocalDaysWithTimeZone(): boolean {
  if (dropLearnedDaysIfZoneChanged()) return true;
  if (learnedOffsetsStillHold()) return false;
  resetLocalDays();
  cachedZoneFingerprint = zoneFingerprint();
  return true;
}
