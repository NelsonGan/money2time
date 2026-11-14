"use client";

import { useLocale, useTranslations } from "next-intl";
import { createContext, useContext, useMemo, type ReactNode } from "react";

import { financialMonthRange, monthRange, onPhoneClock, parseLocalDate, shiftMonthKey } from "@/lib/backup/dates";
import type { Model, Tx } from "@/lib/backup/model";
import type { DashboardEditAction } from "@/lib/analytics";
import type { EditOp, EditResult } from "@/lib/cloud/edits";
import type { BrowserState } from "@/lib/cloud/relay";

import type { Filters } from "./filters";

export type Mode = "money" | "hours";
export type Preset = "month" | "3m" | "6m" | "12m" | "ytd" | "year" | "all";
export const PRESETS: Preset[] = ["month", "3m", "6m", "12m", "ytd", "year", "all"];
/** Periods only Pro shows: a year or more at a time. Free accounts see up to six months. */
const PRO_PRESETS = ["12m", "ytd", "year", "all"] as const satisfies Preset[];
export const isProPreset = (preset: Preset): preset is (typeof PRO_PRESETS)[number] => (PRO_PRESETS as readonly Preset[]).includes(preset);

export type Period = { preset: Preset; end: string };

type ResolvedPeriod = {
  preset: Preset;
  months: string[];
  monthSet: Set<string>;
  start: string;
  end: string;
  previous: string[];
  previousSet: Set<string>;
  canBack: boolean;
  canForward: boolean;
  startDate: Date;
  endDate: Date;
  /**
   * The month a single-month card (pace, calendar, budget) looks at: the
   * period's last month, but never past the backup's own month, so "Year"
   * does not open on an empty December.
   */
  focus: string;
};

/** The months a preset covers, ending at `end`. */
export function resolvePeriod(period: Period, model: Model): ResolvedPeriod {
  const end = period.end;
  let start: string;
  switch (period.preset) {
    case "month":
      start = end;
      break;
    case "3m":
      start = shiftMonthKey(end, -2);
      break;
    case "6m":
      start = shiftMonthKey(end, -5);
      break;
    case "12m":
      start = shiftMonthKey(end, -11);
      break;
    case "ytd":
      start = `${end.slice(0, 4)}-01`;
      break;
    case "year":
      start = `${end.slice(0, 4)}-01`;
      break;
    case "all":
    default:
      start = model.firstMonth < end ? model.firstMonth : end;
  }
  const effectiveEnd = period.preset === "year" ? `${end.slice(0, 4)}-12` : end;
  const months = monthRange(start, effectiveEnd);
  const length = months.length;
  const previous = period.preset === "all" ? [] : monthRange(shiftMonthKey(start, -length), shiftMonthKey(start, -1));
  return {
    preset: period.preset,
    months,
    monthSet: new Set(months),
    start,
    end: effectiveEnd,
    previous,
    previousSet: new Set(previous),
    canBack: period.preset !== "all" && start > model.firstMonth,
    canForward: period.preset !== "all" && effectiveEnd < model.currentMonth,
    startDate: financialMonthRange(start, model.cycle).start,
    endDate: financialMonthRange(effectiveEnd, model.cycle).end,
    focus: effectiveEnd > model.currentMonth ? model.currentMonth : effectiveEnd,
  };
}

export function stepPeriod(period: Period, direction: -1 | 1): Period {
  const step =
    period.preset === "month" ? 1 : period.preset === "3m" ? 3 : period.preset === "6m" ? 6 : 12;
  return { ...period, end: shiftMonthKey(period.end, direction * step) };
}

export function presetEnd(preset: Preset, model: Model): string {
  if (preset === "year") return `${model.currentMonth.slice(0, 4)}-12`;
  return model.currentMonth;
}

/**
 * A sum in hours at the hourly rate of `month` (the latest one by default).
 * With no wage set there is no rate, and it reads as 0 like every
 * transaction's hours, not as a vast number.
 */
export function hoursAt(model: Model, value: number, month: string = model.currentMonth): number {
  const rate = model.rateForMonth(month);
  return rate > 0 ? value / rate : 0;
}

/** A figure in both units; the toggle picks which one is shown. */
export type Amt = { money: number; hours: number };
export const ZERO: Amt = { money: 0, hours: 0 };
export const addAmt = (a: Amt, b: Amt): Amt => ({ money: a.money + b.money, hours: a.hours + b.hours });
export const sumAmt = (txs: Tx[]): Amt => {
  let money = 0;
  let hours = 0;
  for (const tx of txs) {
    money += tx.amount;
    hours += tx.hours;
  }
  return { money, hours };
};

type PeriodTxs = { current: Tx[]; previous: Tx[] };

type Ctx = {
  /** The data on screen, with the visitor's filters applied. */
  model: Model;
  /** Everything the phone sent, for the filter lists themselves. */
  fullModel: Model;
  filters: Filters;
  setFilters: (filters: Filters) => void;
  /** Amounts masked, for a screen others can see. */
  hidden: boolean;
  setHidden: (hidden: boolean) => void;
  mode: Mode;
  setMode: (mode: Mode) => void;
  period: Period;
  setPeriod: (period: Period) => void;
  resolved: ResolvedPeriod;
  /** The period's rows and the period before's, split once for every page. */
  periodTxs: PeriodTxs;
  asset: (ref: string | null | undefined) => string | null;
  navigate: (view: string) => void;
  link: LinkState;
};

/**
 * Whether changes can be made here right now. `ready`: the phone is here and
 * the data on screen is its latest. `away`: the phone is not connected, so the
 * dashboard reads only. `update`: the phone's app predates editing from the
 * web. `off`: the phone has not allowed this browser to make changes.
 * `saving`: the phone is saving a change. `syncing`: the phone's latest data
 * is on its way (after a change, or as it arrives).
 */
export type EditAvailability = "ready" | "away" | "update" | "off" | "saving" | "syncing";

/** Whether a page offers its change controls: the phone can take changes, or soon will (saving, syncing). */
export function offersEdits(state: EditAvailability): boolean {
  return state !== "away" && state !== "update" && state !== "off";
}

/**
 * Fresh data on its way, step by step: the phone building its export
 * (`preparing`), the transfer (`receiving`, with `progress`), and this browser
 * decrypting and reading it (`opening`).
 */
export type Loading = "preparing" | "receiving" | "opening";

/**
 * The linked phone and the data on screen, and the one way to change it:
 * through the phone. What changes while a transfer runs is in
 * `TransferState` instead, so the pages do not redraw on every step of it.
 */
export type LinkState = {
  phoneName: string | null;
  /** When the phone made the data on screen (its export time), in ms. */
  dataAt: number;
  /** The phone that sent it, by its own name. */
  sourceDevice: string | null;
  /** Money2Time Pro, as the phone that sent the data said. */
  pro: boolean;
  /** The phone saves a budget's currency from here (`phoneTakesBudgetCurrencies`). */
  budgetCurrencies: boolean;
  /** The phone saves a card's due date as days after the statement (`phoneTakesCreditDueDaysAfter`). */
  creditDueDaysAfter: boolean;
  /** The phone saves a shared album's bills from here, and restores deleted ones (`phoneTakesSharedAlbums`). */
  sharedAlbums: boolean;
  /** The last transfer that failed, if the latest one did. */
  error: string | null;
  /** Refresh was pressed with no phone around: show how to bring it. */
  needsPhone: boolean;
  refresh: () => void;
  /** Another tab of this browser holds the seat; take it back here. */
  takeOver: () => void;
  unlink: () => void;
  editing: EditAvailability;
  /** Sends a batch of changes for the phone to check and save. */
  edit: (ops: EditOp[], action: DashboardEditAction) => Promise<EditResult>;
};

/** The relay connection and a transfer in progress: read only by what shows them. */
export type TransferState = {
  /** Whether the phone is here right now. */
  connection: BrowserState;
  /** 0–1 while the phone is sending, else null. */
  progress: number | null;
  /** Fresh data on its way, or null when there is none. */
  loading: Loading | null;
};

const DashboardContext = createContext<Ctx | null>(null);
const TransferContext = createContext<TransferState | null>(null);
const FormatContext = createContext<Format | null>(null);

/**
 * The dashboard's state for every page, plus what each page would otherwise
 * work out for itself: the period's rows and the formatters, made once here.
 */
export function DashboardProvider({ value, transfer, children }: { value: Omit<Ctx, "periodTxs">; transfer: TransferState; children: ReactNode }) {
  const { model, resolved, mode, hidden } = value;
  const periodTxs = useMemo(() => {
    const current: Tx[] = [];
    const previous: Tx[] = [];
    for (const tx of model.txs) {
      if (resolved.monthSet.has(tx.month)) current.push(tx);
      else if (resolved.previousSet.has(tx.month)) previous.push(tx);
    }
    return { current, previous };
  }, [model, resolved]);
  const ctx = useMemo(() => ({ ...value, periodTxs }), [value, periodTxs]);
  const format = useBuildFormat(model, mode, hidden);
  return (
    <DashboardContext.Provider value={ctx}>
      <FormatContext.Provider value={format}>
        <TransferContext.Provider value={transfer}>{children}</TransferContext.Provider>
      </FormatContext.Provider>
    </DashboardContext.Provider>
  );
}

export function useDashboard(): Ctx {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error("useDashboard outside DashboardProvider");
  return ctx;
}

/** The relay connection and transfer progress; reading it redraws on every step of a transfer. */
export function useTransfer(): TransferState {
  const transfer = useContext(TransferContext);
  if (!transfer) throw new Error("useTransfer outside DashboardProvider");
  return transfer;
}

/** Spending and income rows inside the selected period (and the one before). */
export function usePeriodTxs(): PeriodTxs {
  return useDashboard().periodTxs;
}

const DATE_STYLES = {
  short: { day: "numeric", month: "short" },
  medium: { day: "numeric", month: "short", year: "numeric" },
  long: { weekday: "long", day: "numeric", month: "long", year: "numeric" },
} as const satisfies Record<string, Intl.DateTimeFormatOptions>;

const monthDate = (monthKey: string) => {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(y, m - 1, 1);
};

/**
 * Number, money and hours formatting for the viewer's locale and the backup's
 * currency symbol. `value` follows the money/hours toggle. Every formatter is
 * made once per locale, data and toggle, and shared by every page.
 */
function useBuildFormat(model: Model, mode: Mode, hidden: boolean) {
  const locale = useLocale();
  const t = useTranslations("dashboard.units");

  return useMemo(() => {
    // Hidden: every amount and duration reads as dots; counts and shares stay.
    const MASK = "•••••";
    // Decimals as the currency has them: none for yen, won or rupiah.
    let decimals = 2;
    try {
      decimals = new Intl.NumberFormat(locale, { style: "currency", currency: model.currency }).resolvedOptions().maximumFractionDigits ?? 2;
    } catch {
      decimals = 2;
    }
    const two = new Intl.NumberFormat(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    const zero = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
    const compactFmt = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 });
    const pct = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 });
    // An interest rate keeps its own decimals: 3.75% is not 3.8%.
    const ratePct = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 3 });
    const dates = {
      short: new Intl.DateTimeFormat(locale, DATE_STYLES.short),
      medium: new Intl.DateTimeFormat(locale, DATE_STYLES.medium),
      long: new Intl.DateTimeFormat(locale, DATE_STYLES.long),
    };
    const monthShortFmt = new Intl.DateTimeFormat(locale, { month: "short" });
    const monthLongFmt = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" });
    const monthYearShortFmt = new Intl.DateTimeFormat(locale, { month: "short", year: "2-digit" });
    const timeFmt = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" });
    const hourFmt = new Intl.DateTimeFormat(locale, { hour: "numeric" });
    // Other currencies, made the first time each one is shown.
    const foreignFmts = new Map<string, Intl.NumberFormat | null>();
    const symbol = model.symbol;
    const sign = (value: number) => (value < 0 ? "−" : "");

    const money = (value: number, opts: { whole?: boolean; signed?: boolean } = {}) => {
      if (hidden) return MASK;
      const abs = Math.abs(value);
      const body = opts.whole || abs >= 100_000 ? zero.format(Math.round(abs)) : two.format(abs);
      const prefix = value < 0 ? "−" : opts.signed && value > 0 ? "+" : "";
      return `${prefix}${symbol}${body}`;
    };
    const moneyCompact = (value: number) =>
      hidden
        ? MASK
        : Math.abs(value) < 1000 ? `${sign(value)}${symbol}${zero.format(Math.abs(value))}` : `${sign(value)}${symbol}${compactFmt.format(Math.abs(value))}`;

    // The app's formatHours: hours and minutes ("150h 30m"), or with workdays
    // on, whole workdays and the rest as whole hours once a day is reached.
    const hours = (value: number, opts: { signed?: boolean } = {}) => {
      if (hidden) return MASK;
      const abs = Math.abs(value);
      const prefix = value < 0 ? "−" : opts.signed && value > 0 ? "+" : "";
      const totalMinutes = Math.round(abs * 60);
      const dayMinutes = model.workdayHours ? Math.round(model.workdayHours * 60) : null;
      if (dayMinutes && totalMinutes >= dayMinutes) {
        let days = Math.floor(totalMinutes / dayMinutes);
        let restHours = Math.round((totalMinutes % dayMinutes) / 60);
        // A remainder that rounds up to a whole workday belongs to the day count.
        if (restHours * 60 >= dayMinutes) {
          days += 1;
          restHours = 0;
        }
        return `${prefix}${restHours ? t("daysHours", { d: zero.format(days), h: restHours }) : t("days", { d: zero.format(days) })}`;
      }
      const h = Math.floor(totalMinutes / 60);
      const m = totalMinutes % 60;
      if (h === 0) return `${prefix}${t("minutes", { m })}`;
      if (m === 0) return `${prefix}${t("hours", { h: zero.format(h) })}`;
      return `${prefix}${t("hoursMinutes", { h: zero.format(h), m })}`;
    };
    const hoursCompact = (value: number) => {
      if (hidden) return MASK;
      const abs = Math.abs(value);
      return `${sign(value)}${t("hours", { h: abs >= 1000 ? compactFmt.format(abs) : zero.format(abs) })}`;
    };
    const date = (value: Date, style: keyof typeof DATE_STYLES = "medium") => dates[style].format(value);
    const moneyIn = (value: number, code: string | null | undefined) => (!code || code === model.currency ? money(value) : foreignIn(value, code));
    const foreignIn = (value: number, code: string) => {
      if (hidden) return MASK;
      if (!foreignFmts.has(code)) {
        try {
          foreignFmts.set(code, new Intl.NumberFormat(locale, { style: "currency", currency: code }));
        } catch {
          foreignFmts.set(code, null);
        }
      }
      return foreignFmts.get(code)?.format(value) ?? `${code} ${two.format(value)}`;
    };

    return {
      locale,
      money,
      moneyCompact,
      hours,
      hoursCompact,
      number: (value: number) => zero.format(value),
      /** An amount in another currency than the main one, in its own code. */
      foreign: foreignIn,
      /** Money in `code`: the main currency's own format, else `foreign`'s. */
      moneyIn,
      /**
       * A figure whose money is in `code` (a budget in another currency): the
       * toggle's hours as `value` gives them, else the money in that currency.
       */
      valueIn: (amt: Amt, code: string | null | undefined) => (mode === "hours" ? hours(amt.hours) : moneyIn(amt.money, code)),
      percent: (value: number) => pct.format(value),
      /** An interest rate given in percent (3.75 for 3.75%), as the locale writes it. */
      rate: (percentValue: number) => ratePct.format(percentValue / 100),
      /** The figure in the unit the toggle shows. */
      value: (amt: Amt, opts: { signed?: boolean; whole?: boolean } = {}) =>
        mode === "hours" ? hours(amt.hours, opts) : money(amt.money, opts),
      /** The figure in the other unit, for the small line under a headline. */
      other: (amt: Amt) => (mode === "hours" ? money(amt.money) : hours(amt.hours)),
      axis: (value: number) => (mode === "hours" ? hoursCompact(value) : moneyCompact(value)),
      pick: (amt: Amt) => (mode === "hours" ? amt.hours : amt.money),
      plain: (value: number) => (mode === "hours" ? hours(value) : money(value)),
      date,
      /** A moment (in ms) as a date on the phone's clock, like every date in its data. */
      instant: (ms: number, style: keyof typeof DATE_STYLES = "medium") => date(onPhoneClock(new Date(ms)), style),
      /** A time of day: "9:41 AM". */
      time: (value: Date) => timeFmt.format(value),
      /** An hour of the day: "9 AM". */
      hour: (value: Date) => hourFmt.format(value),
      monthShort: (monthKey: string) => monthShortFmt.format(monthDate(monthKey)),
      monthLong: (monthKey: string) => monthLongFmt.format(monthDate(monthKey)),
      monthYearShort: (monthKey: string) => monthYearShortFmt.format(monthDate(monthKey)),
      day: (dayKey: string, style: keyof typeof DATE_STYLES = "medium") => date(parseLocalDate(dayKey) ?? new Date(), style),
    };
  }, [locale, model, mode, t, hidden]);
}

type Format = ReturnType<typeof useBuildFormat>;

/** The dashboard's formatters, made once in the provider. */
export function useFormat(): Format {
  const format = useContext(FormatContext);
  if (!format) throw new Error("useFormat outside DashboardProvider");
  return format;
}

/** Short label for a month on an axis: "Oct", or "Oct 25" across years. */
export function useMonthLabels(months: string[]) {
  const f = useFormat();
  return useMemo(() => {
    const multiYear = months.length > 0 && months[0].slice(0, 4) !== months[months.length - 1].slice(0, 4);
    return {
      labels: months.map((m) => (multiYear && months.length > 12 ? f.monthYearShort(m) : f.monthShort(m))),
      titles: months.map((m) => f.monthLong(m)),
    };
  }, [f, months]);
}
