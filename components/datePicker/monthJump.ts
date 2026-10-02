/** A calendar month as a year plus a 0-based month index. */
export interface YearMonth {
  year: number;
  monthIndex: number;
}

export function buildMonthLabels(locale: string): string[] {
  const formatter = new Intl.DateTimeFormat(locale, { month: 'short' });
  return Array.from({ length: 12 }, (_, i) => formatter.format(new Date(2024, i, 1)));
}

function ordinal({ year, monthIndex }: YearMonth): number {
  return year * 12 + monthIndex;
}

/** Whole months from `from` to `to` (negative when `to` is earlier). */
export function monthsBetween(from: YearMonth, to: YearMonth): number {
  return ordinal(to) - ordinal(from);
}

export function shiftYearMonth(value: YearMonth, months: number): YearMonth {
  const shifted = ordinal(value) + months;
  return { year: Math.floor(shifted / 12), monthIndex: ((shifted % 12) + 12) % 12 };
}

/** `YYYY-MM` -> year and 0-based month. */
export function yearMonthFromKey(monthKey: string): YearMonth {
  const [year, month] = monthKey.split('-').map(Number);
  return { year, monthIndex: month - 1 };
}

export function yearMonthToKey({ year, monthIndex }: YearMonth): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
}

export function clampYearMonth(value: YearMonth, min?: YearMonth, max?: YearMonth): YearMonth {
  if (min && ordinal(value) < ordinal(min)) return min;
  if (max && ordinal(value) > ordinal(max)) return max;
  return value;
}
