import { getLocales } from 'expo-localization';
import { DEFAULT_CURRENCY_SYMBOL, MAJOR_CURRENCIES } from '~/constants/appDefaults';
import type { DateRange, UserSettings, WageConfig } from '~/types';
import { I18n } from '~/lib/i18n';

type AmountFormatSettings = Pick<UserSettings, 'currencySymbol' | 'displayMode' | 'hourRounding'>;

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

export function dayKeyFromDateLocal(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function dayKeyFromIsoLocal(dateIso: string): string {
  const parsed = new Date(dateIso);
  if (Number.isNaN(parsed.getTime())) return dateIso.slice(0, 10);
  return dayKeyFromDateLocal(parsed);
}

export function monthKeyFromDateLocal(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

export function monthKeyFromIsoLocal(dateIso: string): string {
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

export function amountToHoursByRate(
  amount: number,
  trueHourlyRate: number,
  rounding: number,
): number {
  if (trueHourlyRate <= 0) return 0;
  const raw = amount / trueHourlyRate;
  return Math.round(raw / rounding) * rounding;
}

function amountToHours(
  amount: number,
  settings: AmountFormatSettings,
  trueHourlyRate: number,
): number {
  return amountToHoursByRate(amount, trueHourlyRate, settings.hourRounding);
}

export function formatCurrency(amount: number, currencySymbol = '$'): string {
  return `${currencySymbol}${Math.abs(amount).toFixed(2)}`;
}

export function formatHours(hours: number): string {
  const absHours = Math.abs(hours);
  if (absHours < 0.01) return '0m';

  const wholeHours = Math.floor(absHours);
  const minutes = Math.round((absHours - wholeHours) * 60);

  if (wholeHours === 0) return `${minutes}m`;
  if (minutes === 0) return `${wholeHours}h`;
  return `${wholeHours}h ${minutes}m`;
}

export function formatAmount(
  amount: number,
  settings: AmountFormatSettings,
  options: {
    showSign?: boolean;
    isIncome?: boolean;
    neutralSign?: boolean;
    trueHourlyRate?: number;
  } = {},
): string {
  const { showSign = false, neutralSign = false, trueHourlyRate = 0 } = options;
  const amountSign = amount > 0 ? '+' : amount < 0 ? '-' : '';
  const sign = showSign ? (neutralSign ? '' : amountSign) : amount < 0 ? '-' : '';

  if (settings.displayMode === 'time') {
    if (trueHourlyRate <= 0) {
      return `${sign}${formatCurrency(Math.abs(amount), settings.currencySymbol)}`;
    }
    return `${sign}${formatHours(Math.abs(amountToHours(amount, settings, trueHourlyRate)))}`;
  }

  return `${sign}${formatCurrency(Math.abs(amount), settings.currencySymbol)}`;
}

export function formatRelativeDate(dateString: string): string {
  const date = new Date(dateString);
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
  if (daysDiff < 7) return date.toLocaleDateString('en-US', { weekday: 'long' });
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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
 * Detect the user's currency symbol from their device locale.
 * Falls back to DEFAULT_CURRENCY_SYMBOL ('$') if locale cannot be determined.
 */
export function getLocaleCurrencySymbol(): string {
  try {
    const locales = getLocales();
    const currencyCode = locales[0]?.currencyCode;
    if (currencyCode) {
      const match = MAJOR_CURRENCIES.find(
        (c: (typeof MAJOR_CURRENCIES)[number]) => c.code === currencyCode,
      );
      if (match) return match.symbol;
    }
  } catch {
    // Localization unavailable (e.g. web fallback)
  }
  return DEFAULT_CURRENCY_SYMBOL;
}
