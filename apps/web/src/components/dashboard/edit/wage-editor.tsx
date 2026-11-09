"use client";

import { useTranslations } from "next-intl";
import { useId, useMemo, useState } from "react";

import type { Model } from "@/lib/backup/model";

import { EditUnavailable } from "../editing";
import { usePaywall } from "../paywall";
import { FREE_MAX_WAGE_ENTRIES } from "../pro-limits";
import { offersEdits, useDashboard, useFormat } from "../state";
import { Card, ClayImg, Pill, Select } from "../ui";
import {
  CancelButton,
  Confirm,
  DeleteButton,
  EditBlocked,
  EditError,
  Field,
  INPUT,
  MAX_AMOUNT,
  Pills,
  Reloadable,
  SaveButton,
  Sheet,
  evaluateAmount,
  formatAmountInput,
  formatDecimal,
  useEditRun,
  phoneNow,
} from "./kit";

/*
 * The app's Hourly value screen on the web: one income rate per month, each
 * made with the wage calculator (what you earn, your work week, the extra time
 * work takes) and saved through the phone as `module:wage` ops, which the
 * phone checks like its own screen (services/webDashboardEditModules/wage.ts).
 */

type WageType = "hourly" | "monthly" | "yearly";

type WageConfig = {
  wageType: WageType;
  wageAmount: number;
  hoursWorkedPerWeek: number;
  workdaysPerWeek: number;
  commuteMinutesPerWorkday: number;
};

/** The ops the phone's wage module reads. */
type WageOp =
  | { entity: "module:wage"; op: "create"; month: string; config: WageConfig }
  | { entity: "module:wage"; op: "update"; month: string; at: string | null; config: WageConfig }
  | { entity: "module:wage"; op: "delete"; month: string; at: string | null };

/** One month's entry as the phone stores it. */
type WageEntry = { month: string; at: string | null; config: WageConfig; trueRate: number; baseRate: number };

type Period = "hourly" | "weekly" | "monthly" | "yearly";
const PERIODS: Period[] = ["hourly", "weekly", "monthly", "yearly"];

/** The app's periodValueForEntry: the true hourly rate, or one weekly take-home scaled. */
function periodValue(entry: WageEntry, period: Period): number {
  if (period === "hourly") return entry.trueRate;
  const weekly = entry.baseRate * entry.config.hoursWorkedPerWeek;
  return period === "weekly" ? weekly : period === "monthly" ? weekly * 4.33 : weekly * 52;
}

const WAGE_TYPES: WageType[] = ["hourly", "monthly", "yearly"];
/** As the app's calculator starts a new month (DEFAULT_WAGE_CONFIG). */
const DEFAULT_CONFIG: WageConfig = { wageType: "monthly", wageAmount: 0, hoursWorkedPerWeek: 40, workdaysPerWeek: 5, commuteMinutesPerWorkday: 0 };

const num = (value: unknown, fallback: number) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);

/** The months the app lists, newest first: one per month, the latest saved row winning. */
function wageEntries(model: Model): WageEntry[] {
  const byMonth = new Map<string, Record<string, unknown>>();
  for (const row of model.raw.monthly_wage_settings ?? []) {
    if (row.deleted_at) continue;
    const parts = /^(\d{4})-(\d{1,2})$/.exec((row.month ?? "").trim());
    if (!parts) continue;
    const month = `${parts[1]}-${parts[2].padStart(2, "0")}`;
    const existing = byMonth.get(month);
    if (!existing || (row.updated_at ?? "") > String(existing.updated_at ?? "")) byMonth.set(month, row as unknown as Record<string, unknown>);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([month, row]) => {
      const type = row.wage_type;
      const config: WageConfig = {
        wageType: WAGE_TYPES.includes(type as WageType) ? (type as WageType) : "monthly",
        wageAmount: num(row.wage_amount, 0),
        hoursWorkedPerWeek: num(row.hours_worked_per_week, 40),
        workdaysPerWeek: num(row.workdays_per_week, 5),
        commuteMinutesPerWorkday: num(row.commute_minutes_per_workday, 0),
      };
      const rates = computeRates(config);
      return {
        month,
        at: typeof row.updated_at === "string" ? row.updated_at : null,
        config,
        trueRate: num(row.true_hourly_rate, rates.trueHourlyRate),
        baseRate: num(row.base_hourly_rate, rates.baseHourlyRate),
      };
    });
}

/** The app's computeHourlyRates. */
function computeRates(config: WageConfig) {
  if (config.wageAmount <= 0 || config.hoursWorkedPerWeek <= 0) {
    return { baseHourlyRate: 0, trueHourlyRate: 0, weeklyIncome: 0, trueHoursPerWeek: 0, commuteHoursPerWeek: 0 };
  }
  const baseHourlyRate =
    config.wageType === "hourly"
      ? config.wageAmount
      : config.wageType === "monthly"
        ? config.wageAmount / 4.33 / config.hoursWorkedPerWeek
        : config.wageAmount / 52 / config.hoursWorkedPerWeek;
  const weeklyIncome = baseHourlyRate * config.hoursWorkedPerWeek;
  const commuteHoursPerWeek = (config.commuteMinutesPerWorkday * config.workdaysPerWeek) / 60;
  const trueHoursPerWeek = config.hoursWorkedPerWeek + commuteHoursPerWeek;
  return { baseHourlyRate, trueHourlyRate: trueHoursPerWeek > 0 ? weeklyIncome / trueHoursPerWeek : 0, weeklyIncome, trueHoursPerWeek, commuteHoursPerWeek };
}

/**
 * A count as the calculator reads one: 0 when empty, not one, or not above
 * zero. Hours and days are never grouped, so either "," or "." is the decimal
 * mark, whatever the browser's language.
 */
function readCount(text: string): number {
  const clean = text.trim().replace(",", ".");
  if (!/^\d*\.?\d+$/.test(clean)) return 0;
  const value = Number(clean);
  return value > 0 ? value : 0;
}

/**
 * The Hourly value card: each month's true hourly rate, newest first, with the
 * app's add, edit and delete while the phone is connected.
 */
export function WageCard() {
  const t = useTranslations("dashboard.edit.wage");
  const te = useTranslations("dashboard.edit");
  const paywall = usePaywall();
  const { fullModel: model, link } = useDashboard();
  const f = useFormat();
  const { run, busy, error, ready } = useEditRun();
  const editable = offersEdits(link.editing);
  const entries = useMemo(() => wageEntries(model), [model]);
  const [editing, setEditing] = useState<WageEntry | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<WageEntry | null>(null);
  const [period, setPeriod] = useState<Period>("hourly");
  const can = editable && ready && !busy;

  const add = () => {
    // As the screen's add button: the free plan's limit before the month picker.
    if (!link.pro && entries.length >= FREE_MAX_WAGE_ENTRIES) {
      paywall("wage_entries");
      return;
    }
    setEditing(null);
  };

  const remove = async (entry: WageEntry) => {
    if (!ready || busy) return;
    const op: WageOp = { entity: "module:wage", op: "delete", month: entry.month, at: entry.at };
    if (await run([op], "wage_delete")) setDeleting(null);
  };

  return (
    <Card
      title={t("title")}
      subtitle={t("subtitle")}
      action={
        editable ? (
          <button
            type="button"
            onClick={add}
            disabled={!can}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-[13px] font-extrabold text-card shadow-[var(--shadow-soft)] hover:bg-primary-dark disabled:opacity-50"
          >
            <ClayImg name="ui/plus" size={16} />
            {t("add")}
          </button>
        ) : null
      }
    >
      <div className="space-y-3">
        <EditUnavailable state={link.editing} />
        <EditError message={error} />
        {deleting ? (
          <Confirm
            title={t("deleteTitle")}
            body={t("deleteBody", { month: f.monthLong(deleting.month) })}
            actions={[
              { label: te("cancel"), onClick: () => setDeleting(null) },
              { label: te("delete"), tone: "danger", onClick: () => void remove(deleting), disabled: !ready || busy },
            ]}
          />
        ) : null}
        {entries.length ? (
          <label className="flex items-center justify-between gap-3">
            <span className="text-[12.5px] font-bold text-foreground-soft">{t("showAs")}</span>
            <Select value={period} onChange={(event) => setPeriod(event.target.value as Period)} aria-label={t("showAs")}>
              {PERIODS.map((value) => (
                <option key={value} value={value}>
                  {t(`period.${value}`)}
                </option>
              ))}
            </Select>
          </label>
        ) : null}
        {entries.length ? (
          <ul className="divide-y divide-border">
            {entries.map((entry, index) => {
              const older = entries[index + 1];
              const value = periodValue(entry, period);
              const delta = older ? value - periodValue(older, period) : null;
              return (
                <li key={entry.month} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-[14px] font-bold text-foreground">
                      {f.monthLong(entry.month)}
                      {entry.month === model.currentMonth ? <Pill tone="brand">{t("now")}</Pill> : null}
                    </p>
                    <p className="text-[12px] text-foreground-soft">{t(`type.${entry.config.wageType}`)}</p>
                  </div>
                  <div className="text-right">
                    <p className="tabular text-[15px] font-extrabold text-foreground">
                      {f.money(value)}
                      <span className="text-[12px] font-bold text-foreground-muted">{t(`suffix.${period}`)}</span>
                    </p>
                    {delta !== null && Math.abs(delta) >= 0.005 ? (
                      <p className={`tabular text-[12px] font-bold ${delta > 0 ? "text-success" : "text-error"}`}>{f.money(delta, { signed: true })}</p>
                    ) : null}
                  </div>
                  {editable ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setEditing(entry)}
                        disabled={!can}
                        aria-label={`${te("editTitle")}: ${f.monthLong(entry.month)}`}
                        title={te("editTitle")}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-foreground-soft hover:bg-background-subtle disabled:opacity-40"
                      >
                        <ClayImg name="ui/pencil" size={16} />
                      </button>
                      <DeleteButton label={`${te("delete")}: ${f.monthLong(entry.month)}`} onClick={() => setDeleting(entry)} disabled={!can} />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-1 py-2 text-[13px] text-foreground-muted">{t("empty")}</p>
        )}
      </div>
      {editing !== undefined ? (
        <WageEditor key={editing?.month ?? "new"} entry={editing} entries={entries} onOpen={(entry) => setEditing(entry)} onClose={() => setEditing(undefined)} />
      ) : null}
    </Card>
  );
}

/**
 * The app's add-a-month picker and wage calculator in one sheet: the month
 * (new entries only), what you earn, your work week and the extra time work
 * takes, then the true hourly rate they make. After a conflict it can start
 * over on the phone's newer copy of the month.
 */
function WageEditor({ entry, entries, onOpen, onClose }: { entry: WageEntry | null; entries: WageEntry[]; onOpen: (entry: WageEntry) => void; onClose: () => void }) {
  return (
    <Reloadable row={entry} fresh={(row) => (row ? entries.find((item) => item.month === row.month) : null)} at={(row) => row?.at}>
      {(row) => <WageForm entry={row} entries={entries} onOpen={onOpen} onClose={onClose} />}
    </Reloadable>
  );
}

function WageForm({ entry, entries, onOpen, onClose }: { entry: WageEntry | null; entries: WageEntry[]; onOpen: (entry: WageEntry) => void; onClose: () => void }) {
  const t = useTranslations("dashboard.edit.wage");
  const te = useTranslations("dashboard.edit");
  const tu = useTranslations("dashboard.units");
  const { fullModel: model } = useDashboard();
  const f = useFormat();
  const { run, busy, error, ready, clear, reload } = useEditRun();
  const formId = useId();
  const initial = entry?.config ?? DEFAULT_CONFIG;
  const [now] = useState(phoneNow);
  const [year, setYear] = useState(String(now.getFullYear()));
  const [monthNumber, setMonthNumber] = useState(String(now.getMonth() + 1).padStart(2, "0"));
  const [wageType, setWageType] = useState<WageType>(initial.wageType);
  const [amount, setAmount] = useState(initial.wageAmount > 0 ? formatAmountInput(initial.wageAmount, f.locale) : "");
  const [hours, setHours] = useState(formatDecimal(initial.hoursWorkedPerWeek, f.locale));
  const [workdays, setWorkdays] = useState(formatDecimal(initial.workdaysPerWeek, f.locale));
  const [commute, setCommute] = useState(formatDecimal(initial.commuteMinutesPerWorkday, f.locale));
  const [touched, setTouched] = useState(false);
  const change = (apply: () => void) => {
    clear();
    apply();
  };

  const month = entry?.month ?? `${year}-${monthNumber}`;
  const existing = entry ? null : (entries.find((item) => item.month === month) ?? null);
  const config: WageConfig = {
    wageType,
    wageAmount: Math.max(evaluateAmount(amount, f.locale) ?? 0, 0),
    hoursWorkedPerWeek: readCount(hours),
    workdaysPerWeek: readCount(workdays),
    commuteMinutesPerWorkday: readCount(commute),
  };
  const rates = computeRates(config);
  const problems = {
    // The phone saves amounts up to its MAX_AMOUNT.
    amount: config.wageAmount <= 0 || config.wageAmount > MAX_AMOUNT ? te("required") : null,
    hours: config.hoursWorkedPerWeek <= 0 ? te("required") : null,
    workdays: config.workdaysPerWeek <= 0 ? te("required") : null,
  };
  const invalid = Boolean(problems.amount || problems.hours || problems.workdays);

  const years = useMemo(() => {
    const current = now.getFullYear();
    const range = Array.from({ length: 9 }, (_, i) => String(current - 5 + i));
    const fromData = entries.map((item) => item.month.slice(0, 4));
    return [...new Set([...range, ...fromData, year])].sort((a, b) => Number(b) - Number(a));
  }, [entries, now, year]);
  const months = useMemo(() => {
    const format = new Intl.DateTimeFormat(f.locale, { month: "long" });
    return Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1).padStart(2, "0"), label: format.format(new Date(2024, i, 1)) }));
  }, [f.locale]);

  const save = async () => {
    setTouched(true);
    if (invalid || existing || !ready || busy) return;
    const op: WageOp = entry ? { entity: "module:wage", op: "update", month: entry.month, at: entry.at, config } : { entity: "module:wage", op: "create", month, config };
    if (await run([op], entry ? "wage_update" : "wage_create")) onClose();
  };

  const input = (label: string, value: string, set: (value: string) => void, problem: string | null, opts: { hint?: string; prefix?: string; placeholder: string }) => (
    <Field label={label} error={touched ? problem : null} hint={opts.hint}>
      <span className="relative block">
        {opts.prefix ? <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[14.5px] font-bold text-foreground-muted">{opts.prefix}</span> : null}
        <input
          inputMode="decimal"
          value={value}
          placeholder={opts.placeholder}
          aria-invalid={touched && Boolean(problem)}
          onChange={(event) => change(() => set(event.target.value))}
          className={`${INPUT} ${opts.prefix ? "pl-12" : ""} ${touched && problem ? "border-error/60" : ""}`}
        />
      </span>
    </Field>
  );

  const hoursLabel = (value: number) => tu("hours", { h: formatDecimal(value, f.locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) });

  const row = (label: string, value: string) => (
    <div className="flex items-center justify-between gap-3 text-[13.5px]">
      <span className="text-foreground-soft">{label}</span>
      <span className="tabular font-bold text-foreground">{value}</span>
    </div>
  );

  return (
    <Sheet
      busy={busy}
      onClose={onClose}
      wide
      title={entry ? f.monthLong(entry.month) : t("addTitle")}
      footer={
        <div className="flex flex-wrap gap-2">
          <CancelButton onClick={onClose} disabled={busy} />
          <SaveButton label={t("saveFor", { month: f.monthLong(month) })} busy={busy} disabled={!ready || Boolean(existing)} form={formId} />
        </div>
      }
    >
      <form
        id={formId}
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
        className="grid gap-5 md:grid-cols-2"
      >
        <div className="space-y-4">
          {!entry ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("year")}>
                <Select value={year} onChange={(event) => change(() => setYear(event.target.value))} aria-label={t("year")} className="w-full">
                  {years.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t("month")}>
                <Select value={monthNumber} onChange={(event) => change(() => setMonthNumber(event.target.value))} aria-label={t("month")} className="w-full">
                  {months.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          ) : null}
          {existing ? (
            <Confirm
              title={t("existsTitle", { month: f.monthLong(existing.month) })}
              body={t("existsBody")}
              actions={[{ label: te("editTitle"), tone: "primary", onClick: () => onOpen(existing) }]}
            />
          ) : null}
          <p className="text-[14px] font-extrabold text-foreground">{t("step1")}</p>
          <Pills label={t("step1")} value={wageType} onChange={(value) => change(() => setWageType(value))} options={WAGE_TYPES.map((value) => ({ value, label: t(`type.${value}`) }))} />
          {input(t("amount", { symbol: model.symbol }), amount, setAmount, problems.amount, { hint: t("afterTax"), prefix: model.symbol, placeholder: "0" })}
          <p className="pt-1 text-[14px] font-extrabold text-foreground">{t("step2")}</p>
          <div className="grid grid-cols-2 gap-3">
            {input(t("hoursPerWeek"), hours, setHours, problems.hours, { placeholder: "40" })}
            {input(t("workdaysPerWeek"), workdays, setWorkdays, problems.workdays, { placeholder: "5" })}
          </div>
          <p className="pt-1 text-[14px] font-extrabold text-foreground">{t("step3")}</p>
          {input(t("commuteMinutes"), commute, setCommute, null, { hint: t("commuteHint"), placeholder: "0" })}
        </div>
        <div className="space-y-3">
          <div className="rounded-[24px] bg-primary px-5 py-6 text-center text-card">
            <p className="text-[11.5px] font-extrabold uppercase tracking-widest opacity-75">{t("trueRate")}</p>
            <p className="tabular mt-2 text-[32px] font-extrabold tracking-[-0.02em]">{f.money(rates.trueHourlyRate)}</p>
          </div>
          <div className="space-y-2.5 rounded-[20px] border border-border bg-card p-4">
            {row(t("weeklyIncome"), f.money(rates.weeklyIncome))}
            {row(t("baseRate"), `${f.money(rates.baseHourlyRate)}${t("perHour")}`)}
            {row(t("hoursPerWeek"), hoursLabel(config.hoursWorkedPerWeek))}
            {row(t("commutePerWeek"), hoursLabel(rates.commuteHoursPerWeek))}
            {row(t("totalPerWeek"), hoursLabel(rates.trueHoursPerWeek))}
          </div>
          <EditError message={error} onReload={reload} />
          <EditBlocked />
        </div>
      </form>
    </Sheet>
  );
}
