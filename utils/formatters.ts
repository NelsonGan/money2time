import { getLocales } from 'expo-localization';

import {
  ALL_CURRENCIES,
  DEFAULT_CURRENCY,
  DEFAULT_CURRENCY_SYMBOL,
  MAJOR_CURRENCIES,
} from '~/constants/appDefaults';
import { I18n } from '~/lib/i18n';
import type { DateRange, UserSettings, WageConfig } from '~/types';

type WorkdayFormatSettings = Pick<UserSettings, 'workdayDisplayEnabled' | 'workingHoursPerDay'>;
type AmountFormatSettings = Pick<UserSettings, 'currencySymbol' | 'displayMode'> &
  Partial<WorkdayFormatSettings>;
const SYMBOL_BY_CODE = new Map(ALL_CURRENCIES.map((c) => [c.code, c.symbol]));
const MONEY_PRECISION_MULTIPLIER = 100;
const monthYearFormatterByLocale = new Map<string, Intl.DateTimeFormat>();
const shortMonthYearFormatterByLocale = new Map<string, Intl.DateTimeFormat>();
const relativeWeekdayFormatterByLocale = new Map<string, Intl.DateTimeFormat>();
const relativeMonthDayFormatterByLocale = new Map<string, Intl.DateTimeFormat>();
const shortDateFormatterByLocale = new Map<string, Intl.DateTimeFormat>();

function resolveLocale(locale?: string) {
  return locale ?? I18n.locale ?? I18n.defaultLocale ?? 'en';
}

function getMonthYearFormatter(locale: string) {
  const cached = monthYearFormatterByLocale.get(locale);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' });
  monthYearFormatterByLocale.set(locale, formatter);
  return formatter;
}

function getShortMonthYearFormatter(locale: string) {
  const cached = shortMonthYearFormatterByLocale.get(locale);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric' });
  shortMonthYearFormatterByLocale.set(locale, formatter);
  return formatter;
}

function getRelativeWeekdayFormatter(locale: string) {
  const cached = relativeWeekdayFormatterByLocale.get(locale);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat(locale, { weekday: 'long' });
  relativeWeekdayFormatterByLocale.set(locale, formatter);
  return formatter;
}

function getRelativeMonthDayFormatter(locale: string) {
  const cached = relativeMonthDayFormatterByLocale.get(locale);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' });
  relativeMonthDayFormatterByLocale.set(locale, formatter);
  return formatter;
}

export function computeHourlyRates(config: WageConfig): {
  baseHourlyRate: number;
  trueHourlyRate: number;
  weeklyIncome: number;
  trueHoursPerWeek: number;
  commuteHoursPerWeek: number;
} {
  if (config.wageAmount <= 0 || config.hoursWorkedPerWeek <= 0) {
    return {
      baseHourlyRate: 0,
      trueHourlyRate: 0,
      weeklyIncome: 0,
      trueHoursPerWeek: 0,
      commuteHoursPerWeek: 0,
    };
  }

  let baseHourlyRate: number;
  switch (config.wageType) {
    case 'hourly':
      baseHourlyRate = config.wageAmount;
      break;
    case 'monthly':
      baseHourlyRate = config.wageAmount / 4.33 / config.hoursWorkedPerWeek;
      break;
    case 'yearly':
      baseHourlyRate = config.wageAmount / 52 / config.hoursWorkedPerWeek;
      break;
    default:
      baseHourlyRate = 0;
  }

  const weeklyIncome = baseHourlyRate * config.hoursWorkedPerWeek;
  const commuteHoursPerWeek = (config.commuteMinutesPerWorkday * config.workdaysPerWeek) / 60;
  const trueHoursPerWeek = config.hoursWorkedPerWeek + commuteHoursPerWeek;
  const trueHourlyRate = trueHoursPerWeek > 0 ? weeklyIncome / trueHoursPerWeek : 0;

  return {
    baseHourlyRate,
    trueHourlyRate,
    weeklyIncome,
    trueHoursPerWeek,
    commuteHoursPerWeek,
  };
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function isDigitCode(charCode: number): boolean {
  return charCode >= 48 && charCode <= 57;
}

function isSimpleDayKey(dateText: string): boolean {
  if (dateText.length !== 10) return false;
  if (dateText.charCodeAt(4) !== 45 || dateText.charCodeAt(7) !== 45) return false;

  for (let index = 0; index < dateText.length; index += 1) {
    if (index === 4 || index === 7) continue;
    if (!isDigitCode(dateText.charCodeAt(index))) return false;
  }

  const month = Number(dateText.slice(5, 7));
  const day = Number(dateText.slice(8, 10));
  return (
    Number.isInteger(month) &&
    Number.isInteger(day) &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= 31
  );
}

export function dayKeyFromDateLocal(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function dayKeyFromIsoLocal(dateIso: string): string {
  if (isSimpleDayKey(dateIso)) return dateIso;
  const parsed = new Date(dateIso);
  if (Number.isNaN(parsed.getTime())) return dateIso.slice(0, 10);
  return dayKeyFromDateLocal(parsed);
}

export function monthKeyFromDateLocal(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

export function monthKeyFromIsoLocal(dateIso: string): string {
  if (isSimpleDayKey(dateIso)) return dateIso.slice(0, 7);
  const parsed = new Date(dateIso);
  if (Number.isNaN(parsed.getTime())) return dateIso.slice(0, 7);
  return monthKeyFromDateLocal(parsed);
}

export function monthKeyFromDateIso(dateIso: string): string {
  return monthKeyFromIsoLocal(dateIso);
}

export function normalizeMonthKey(month: string): string {
  const trimmed = month.trim();
  const match = trimmed.match(/^(\d{4})-(\d{1,2})$/);
  if (!match) return trimmed;

  const year = match[1];
  const monthValue = Number(match[2]);
  if (!Number.isFinite(monthValue)) return trimmed;
  if (monthValue < 1 || monthValue > 12) return trimmed;
  return `${year}-${String(monthValue).padStart(2, '0')}`;
}

export function startOfMonthDate(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function addMonthsAtMonthStart(date: Date, offset: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + offset, 1);
}

export function monthOffsetFromAnchorDate(anchor: Date, target: Date): number {
  return (
    (target.getFullYear() - anchor.getFullYear()) * 12 + (target.getMonth() - anchor.getMonth())
  );
}

export function parseMonthKey(month: string): Date | null {
  const normalizedMonth = normalizeMonthKey(month);
  const match = normalizedMonth.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const monthValue = Number(match[2]);
  if (!Number.isInteger(year) || !Number.isInteger(monthValue)) return null;
  if (monthValue < 1 || monthValue > 12) return null;
  return new Date(year, monthValue - 1, 1);
}

export function formatMonthYearLabel(date: Date, locale?: string): string {
  return getMonthYearFormatter(resolveLocale(locale)).format(date);
}

/** Abbreviated month + year, e.g. "Jan 2025" instead of "January 2025". */
export function formatShortMonthYearLabel(date: Date, locale?: string): string {
  return getShortMonthYearFormatter(resolveLocale(locale)).format(date);
}

export function amountToHoursByRate(amount: number, trueHourlyRate: number): number {
  if (trueHourlyRate <= 0) return 0;
  return amount / trueHourlyRate;
}

export function formatCurrency(amount: number, currencySymbol = '$'): string {
  const [intPart, decPart] = Math.abs(amount).toFixed(2).split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${currencySymbol}${grouped}.${decPart}`;
}

export function normalizeMoneyAmount(amount: number): number {
  if (!Number.isFinite(amount)) return 0;
  const rounded = Math.round(amount * MONEY_PRECISION_MULTIPLIER) / MONEY_PRECISION_MULTIPLIER;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * Renders a money amount for a text input: rounded to cents, never "-0", and
 * free of float artifacts (a raw String(3400.0000000000005) would leak into
 * the field). Shared by the account and savings-goal balance editors.
 */
export function toBalanceInputValue(value: number) {
  if (!Number.isFinite(value)) return '0';
  const rounded = Math.round(value * 100) / 100;
  if (Object.is(rounded, -0)) return '0';
  return String(rounded);
}

function trimTrailingZeros(value: string) {
  if (!value.includes('.')) return value;
  return value.replace(/\.?0+$/, '');
}

export function formatCompactNumber(value: number): string {
  const absValue = Math.abs(value);
  if (!Number.isFinite(absValue) || absValue === 0) return '0';

  const units = [
    { threshold: 1_000_000_000_000, suffix: 'T' },
    { threshold: 1_000_000_000, suffix: 'B' },
    { threshold: 1_000_000, suffix: 'M' },
    { threshold: 1_000, suffix: 'K' },
  ] as const;

  for (const unit of units) {
    if (absValue < unit.threshold) continue;
    const scaled = absValue / unit.threshold;
    const decimalPlaces = scaled >= 100 ? 0 : 1;
    return `${trimTrailingZeros(scaled.toFixed(decimalPlaces))}${unit.suffix}`;
  }

  if (absValue >= 100) return Math.round(absValue).toString();
  if (absValue >= 10) return trimTrailingZeros(absValue.toFixed(1));
  if (absValue >= 1) return trimTrailingZeros(absValue.toFixed(2));

  const decimals = Math.max(0, 3 - Math.floor(Math.log10(absValue)) - 1);
  return trimTrailingZeros(absValue.toFixed(Math.min(6, decimals)));
}

export function formatCompactCurrency(amount: number, currencySymbol = '$'): string {
  return `${currencySymbol}${formatCompactNumber(amount)}`;
}

const timeOfDayFormatterByLocale = new Map<string, Intl.DateTimeFormat>();

function getTimeOfDayFormatter(locale: string): Intl.DateTimeFormat | null {
  const cached = timeOfDayFormatterByLocale.get(locale);
  if (cached) return cached;
  try {
    const formatter = new Intl.DateTimeFormat(locale, {
      hour: 'numeric',
      minute: '2-digit',
    });
    timeOfDayFormatterByLocale.set(locale, formatter);
    return formatter;
  } catch {
    return null;
  }
}

/**
 * Format a wall-clock time (e.g. notification reminder time) using the active
 * app locale's conventions — "10:30 AM" in English, "上午10:30" in Chinese, etc.
 * Falls back to a manual 12-hour format if `Intl.DateTimeFormat` isn't usable
 * for the requested locale on the current runtime.
 */
export function formatTimeOfDay(hour: number, minute: number): string {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  const locale = I18n.locale || 'en';
  const formatter = getTimeOfDayFormatter(locale);
  if (formatter) return formatter.format(date);
  const period = hour < 12 ? 'AM' : 'PM';
  const display = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const min = minute < 10 ? `0${minute}` : String(minute);
  return `${display}:${min} ${period}`;
}

const MIN_PER_HOUR = 60;

/** Hours-and-minutes form: "1h 51m", "45m", "0m". Takes an already-absolute minute count. */
function formatMinutesAsHours(totalMinutes: number): string {
  const h = String(I18n.t('common.hour_unit'));
  const m = String(I18n.t('common.minute_unit'));

  if (totalMinutes < 1) return `0${m}`;
  if (totalMinutes >= MIN_PER_HOUR) {
    const hrs = Math.floor(totalMinutes / MIN_PER_HOUR);
    const mins = totalMinutes % MIN_PER_HOUR;
    return mins > 0 ? `${hrs}${h} ${mins}${m}` : `${hrs}${h}`;
  }
  return `${totalMinutes}${m}`;
}

/**
 * The minutes in one of the user's working days, or null when the working-day
 * preference is off or its hours-per-day value is out of range (1-24).
 */
function minutesPerWorkday(settings?: Partial<WorkdayFormatSettings>): number | null {
  if (!settings?.workdayDisplayEnabled) return null;
  const workingHoursPerDay = settings.workingHoursPerDay;
  if (
    typeof workingHoursPerDay !== 'number' ||
    !Number.isFinite(workingHoursPerDay) ||
    workingHoursPerDay < 1 ||
    workingHoursPerDay > 24
  ) {
    return null;
  }
  return Math.round(workingHoursPerDay * MIN_PER_HOUR);
}

/**
 * The app's standard work-time value. By default, keep the total in hours rather than
 * rolling it into 24-hour calendar days: 24 hours of work is not one working day.
 * When the working-day preference is enabled, convert the total using the user's
 * configured hours per workday, but only once it actually reaches a whole working day:
 * below that, "0.23d" tells the reader nothing, so a sub-day total stays in hours and
 * minutes. Above it the remainder is carried as whole hours ("3d 6h"), never as a
 * decimal fraction of a day. Negative values format as their magnitude.
 */
export function formatHours(hours: number, settings?: Partial<WorkdayFormatSettings>): string {
  const h = String(I18n.t('common.hour_unit'));
  const d = String(I18n.t('common.day_unit'));

  const totalMinutes = Math.round(Math.abs(hours) * 60);
  const dayMinutes = minutesPerWorkday(settings);

  if (dayMinutes !== null && totalMinutes >= dayMinutes) {
    let days = Math.floor(totalMinutes / dayMinutes);
    let remainderHours = Math.round((totalMinutes % dayMinutes) / MIN_PER_HOUR);
    // A remainder that rounds up to a full working day belongs to the day count.
    if (remainderHours * MIN_PER_HOUR >= dayMinutes) {
      days += 1;
      remainderHours = 0;
    }
    return remainderHours > 0 ? `${days}${d} ${remainderHours}${h}` : `${days}${d}`;
  }

  return formatMinutesAsHours(totalMinutes);
}

/**
 * Time-value label for tight spaces (calendar cells, map pins). It keeps the value in
 * hours but abbreviates large totals, so 1500 hours becomes "1.5Kh" rather than a
 * calendar-day equivalent. Unlike `formatHours` it stays on a single unit: in
 * working-day mode a whole-day total keeps its remainder as a decimal ("3.75d") rather
 * than spelling out a second "6h" the space can't hold.
 */
export function formatHoursCompact(
  hours: number,
  settings?: Partial<WorkdayFormatSettings>,
): string {
  const totalMinutes = Math.round(Math.abs(hours) * 60);
  const dayMinutes = minutesPerWorkday(settings);
  if (dayMinutes !== null) {
    if (totalMinutes < dayMinutes) return formatMinutesAsHours(totalMinutes);
    const workdays = Number((totalMinutes / dayMinutes).toFixed(2));
    return `${workdays}${String(I18n.t('common.day_unit'))}`;
  }

  const roundedHours = totalMinutes / 60;
  if (roundedHours >= 1000) {
    return `${formatCompactNumber(roundedHours)}${String(I18n.t('common.hour_unit'))}`;
  }
  return formatHours(hours, settings);
}

export function formatAmount(
  amount: number,
  settings: AmountFormatSettings,
  options: {
    showSign?: boolean;
    isIncome?: boolean;
    neutralSign?: boolean;
    trueHourlyRate?: number;
    /**
     * Render with this currency's symbol instead of the reporting-currency
     * symbol from `settings`. Use when displaying an amount in an account's
     * native (foreign) currency. Ignored in time display mode.
     */
    currencyCode?: string;
    /** Abbreviate to a short form for tight spaces (e.g. $1.2K, 12h). */
    compact?: boolean;
  } = {},
): string {
  const {
    showSign = false,
    neutralSign = false,
    trueHourlyRate = 0,
    currencyCode,
    compact = false,
  } = options;
  const normalizedAmount = normalizeMoneyAmount(amount);
  const amountSign = normalizedAmount > 0 ? '+' : normalizedAmount < 0 ? '-' : '';
  const sign = showSign ? (neutralSign ? '' : amountSign) : normalizedAmount < 0 ? '-' : '';
  const symbol = currencyCode
    ? (SYMBOL_BY_CODE.get(currencyCode) ?? settings.currencySymbol)
    : settings.currencySymbol;

  const money = (value: number) =>
    compact ? `${symbol}${formatCompactNumber(value)}` : formatCurrency(value, symbol);

  if (settings.displayMode === 'time') {
    if (trueHourlyRate <= 0) {
      return `${sign}${money(Math.abs(normalizedAmount))}`;
    }
    const hours = Math.abs(amountToHoursByRate(normalizedAmount, trueHourlyRate));
    return `${sign}${compact ? formatHoursCompact(hours, settings) : formatHours(hours, settings)}`;
  }

  return `${sign}${money(Math.abs(normalizedAmount))}`;
}

export function formatRelativeDate(dateString: string, locale?: string): string {
  const date = new Date(dateString);
  const resolvedLocale = resolveLocale(locale);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const yesterdayOnly = new Date(
    yesterday.getFullYear(),
    yesterday.getMonth(),
    yesterday.getDate(),
  );

  if (dateOnly.getTime() === todayOnly.getTime()) return I18n.t('common.today');
  if (dateOnly.getTime() === yesterdayOnly.getTime()) return I18n.t('common.yesterday');

  const daysDiff = Math.floor((todayOnly.getTime() - dateOnly.getTime()) / (1000 * 60 * 60 * 24));
  // Weekday shorthand ("Monday") only reads as recent for the *past* week.
  // A future date has a negative diff, so without the lower bound every future
  // date — even one years out — would render as a bare weekday name.
  if (daysDiff >= 0 && daysDiff < 7)
    return getRelativeWeekdayFormatter(resolvedLocale).format(date);
  return getRelativeMonthDayFormatter(resolvedLocale).format(date);
}

function getShortDateFormatter(locale: string) {
  const cached = shortDateFormatterByLocale.get(locale);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  shortDateFormatterByLocale.set(locale, formatter);
  return formatter;
}

/** Absolute day/month/year, e.g. "9 Jun 2026". Used on shareable receipts. */
export function formatShortDate(dateString: string, locale?: string): string {
  return getShortDateFormatter(resolveLocale(locale)).format(new Date(dateString));
}

export function formatDateInput(date: Date): string {
  return dayKeyFromDateLocal(date);
}

export function toRange(start: Date, end: Date): DateRange {
  const startD = new Date(start);
  const endD = new Date(end);
  startD.setHours(0, 0, 0, 0);
  endD.setHours(23, 59, 59, 999);
  return { start: startD.toISOString(), end: endD.toISOString() };
}

/**
 * Detect the user's currency code from their device locale.
 * Falls back to DEFAULT_CURRENCY ('USD') if locale cannot be determined.
 */
export function getLocaleCurrencyCode(): string {
  try {
    const locales = getLocales();
    const currencyCode = locales[0]?.currencyCode;
    if (
      currencyCode &&
      MAJOR_CURRENCIES.some((currency) => currency.code === currencyCode.toUpperCase())
    ) {
      return currencyCode.toUpperCase();
    }
  } catch {
    // Localization unavailable (e.g. web fallback)
  }
  return DEFAULT_CURRENCY;
}

/**
 * Detect the user's currency symbol from their device locale.
 * Falls back to DEFAULT_CURRENCY_SYMBOL ('$') if locale cannot be determined.
 */
export function getLocaleCurrencySymbol(): string {
  const localeCurrencyCode = getLocaleCurrencyCode();
  const match = MAJOR_CURRENCIES.find((currency) => currency.code === localeCurrencyCode);
  return match?.symbol ?? DEFAULT_CURRENCY_SYMBOL;
}
