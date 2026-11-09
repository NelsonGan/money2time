"use client";

import { useTranslations } from "next-intl";
import { useId, useMemo, useState, type FormEvent } from "react";

import { SUBSCRIPTION_LOGOS } from "@/lib/backup/assets.generated";
import { SUBSCRIPTION_LOGO_COUNTRIES, SUBSCRIPTION_LOGO_NAMES } from "@/lib/backup/logo-names.generated";
import type { RecurringRule } from "@/lib/backup/model";
import { isRepeatingPattern, maxRecurrenceInterval, RECURRENCE_FREQUENCIES, recurrenceFrequencyOf, storedRecurrenceOf, type RecurrenceFrequency } from "@/lib/backup/recurrence";
import type { RuleFields } from "@/lib/cloud/edits";

import { useDashboard, useFormat } from "../state";
import { AccountLogo, CategoryGlyph, ClayImg, Segmented, Select, SubscriptionLogo } from "../ui";
import {
  AccountPickerSheet,
  CategoryPickerSheet,
  DAY_MAX,
  DAY_MIN,
  EditBlocked,
  EditError,
  INPUT,
  MAX_AMOUNT,
  PickerRow,
  Pills,
  Reloadable,
  SaveButton,
  Sheet,
  categoryLabel,
  evaluateAmount,
  formatAmountInput,
  isDayKey,
  phoneToday,
  useEditRun,
  firstAccount,
  settledAmount,
} from "./kit";
import { browserCountry, byGlobal, logoCatalog, logoCountries, normalize, searchLogos, type LogoEntry } from "./logo-catalog";

/*
 * The app's recurring rule editor on the web: the transaction editor's fields
 * (type, date, amount, account or from/to, category, note) and then the rule's
 * own (name, logo, repeat, every, ends, status). The phone saves it with the
 * account's currency, as the app does.
 */

type RuleType = "expense" | "income" | "transfer";

type Draft = {
  type: RuleType;
  amount: string;
  /** An expense or income rule's currency; a transfer uses its from account's. */
  currency: string;
  date: string;
  accountId: string | null;
  fromAccountId: string | null;
  toAccountId: string | null;
  categoryId: string | null;
  note: string;
  name: string;
  /** The logo the user picked; ignored while `logoManual` is false. */
  logoId: string | null;
  logoManual: boolean;
  pattern: RecurrenceFrequency;
  interval: string;
  ends: "never" | "on_date";
  endDate: string;
  active: boolean;
};

const TYPE_TINT: Record<RuleType, string> = { expense: "text-error", income: "text-success", transfer: "text-foreground" };

/**
 * Adds a recurring rule (`rule` null) or edits one, as the app's recurring
 * editor. After a conflict it can start over on the phone's newer copy.
 */
export function RuleEditor({ rule, onClose }: { rule: RecurringRule | null; onClose: () => void }) {
  const { fullModel: model } = useDashboard();
  return (
    <Reloadable row={rule} fresh={(row) => (row ? model.recurring.find((item) => item.id === row.id) : null)} at={(row) => row?.updatedAt}>
      {(row) => <RuleForm rule={row} onClose={onClose} />}
    </Reloadable>
  );
}

function RuleForm({ rule, onClose }: { rule: RecurringRule | null; onClose: () => void }) {
  const t = useTranslations("dashboard.edit");
  const tr = useTranslations("dashboard.edit.rule");
  const { fullModel: model } = useDashboard();
  const f = useFormat();
  const { run, busy, error, ready, clear, reload } = useEditRun();
  const formId = useId();

  const initial = useMemo<Draft>(() => {
    if (rule) {
      const type: RuleType = rule.type === "income" || rule.type === "transfer" ? rule.type : "expense";
      const cadence = recurrenceFrequencyOf(isRepeatingPattern(rule.pattern) ? rule.pattern : "monthly", rule.interval || 1);
      return {
        type,
        amount: formatAmountInput(Math.abs(rule.amount), f.locale),
        currency: rule.currency,
        date: rule.nextRunDay ?? phoneToday(),
        accountId: type === "transfer" ? null : rule.accountId,
        fromAccountId: type === "transfer" ? rule.fromAccountId : null,
        toAccountId: type === "transfer" ? rule.toAccountId : null,
        categoryId: type === "transfer" ? null : rule.categoryId,
        note: rule.note,
        name: rule.name,
        logoId: rule.logoId,
        logoManual: rule.logoId != null,
        pattern: cadence.frequency,
        interval: String(cadence.interval),
        ends: rule.endDay ? "on_date" : "never",
        endDate: rule.endDay ?? "",
        active: rule.active,
      };
    }
    const account = firstAccount(model.accounts);
    return {
      type: "expense",
      amount: "",
      currency: account?.currency ?? model.currency,
      date: phoneToday(),
      accountId: account?.id ?? null,
      fromAccountId: null,
      toAccountId: null,
      categoryId: null,
      note: "",
      name: "",
      logoId: null,
      logoManual: false,
      pattern: "monthly",
      interval: "1",
      ends: "never",
      endDate: "",
      active: true,
    };
  }, [rule, model, f.locale]);

  const [draft, setDraft] = useState<Draft>(initial);
  const set = (patch: Partial<Draft>) => {
    clear();
    setDraft((current) => ({ ...current, ...patch }));
  };
  const [picker, setPicker] = useState<"account" | "from" | "to" | "category" | "logo" | null>(null);
  const [touched, setTouched] = useState(false);

  const { type } = draft;
  const flow = type !== "transfer";
  const account = draft.accountId ? (model.accountById.get(draft.accountId) ?? null) : null;
  const from = draft.fromAccountId ? (model.accountById.get(draft.fromAccountId) ?? null) : null;
  const to = draft.toAccountId ? (model.accountById.get(draft.toAccountId) ?? null) : null;
  const category = draft.categoryId ? model.categories.get(draft.categoryId) : undefined;
  const amount = evaluateAmount(draft.amount, f.locale);
  const interval = /^\d+$/.test(draft.interval.trim()) ? Number(draft.interval.trim()) : NaN;
  const maxInterval = maxRecurrenceInterval(draft.pattern);
  const currency = flow ? draft.currency : (from?.currency ?? model.currency);
  const symbol = currency === model.currency ? model.symbol : currency;

  // As in the app: a name that matches a brand suggests its logo until the user picks one.
  const logoId = draft.logoManual ? draft.logoId : suggestLogo(draft.name);

  // What the app's editor checks before a save.
  const missing = {
    amount: amount === null || amount < 0 || amount > MAX_AMOUNT,
    account: flow && !account,
    category: flow && (!category || category.deleted || category.type !== type),
    from: type === "transfer" && !from,
    to: type === "transfer" && !to,
    same: type === "transfer" && !!from && from.id === to?.id,
    name: !draft.name.trim(),
    date: !isDayKey(draft.date),
    interval: !Number.isInteger(interval) || interval < 1 || interval > maxInterval,
    // As the phone checks: an ended rule can still be saved or resumed while its dates stay as they are.
    endDate:
      draft.ends === "on_date" &&
      (!isDayKey(draft.endDate) || (draft.endDate < draft.date && (!rule || draft.date !== initial.date || draft.endDate !== initial.endDate || initial.ends !== "on_date"))),
  };
  const invalid = Object.values(missing).some(Boolean);

  const switchType = (next: RuleType) => {
    if (next === type) return;
    const keepCategory = next !== "transfer" && category?.type === next;
    const base = account ?? from ?? firstAccount(model.accounts);
    set({
      type: next,
      categoryId: keepCategory ? draft.categoryId : null,
      accountId: next === "transfer" ? null : (account?.id ?? from?.id ?? base?.id ?? null),
      currency: next === "transfer" || account ? draft.currency : ((from ?? base)?.currency ?? draft.currency),
      fromAccountId: next === "transfer" ? (from?.id ?? account?.id ?? base?.id ?? null) : null,
      toAccountId: next === "transfer" ? draft.toAccountId : null,
    });
  };

  /** The rule as the phone takes it; on edit, only what differs from the rule. */
  const fields = (): RuleFields => {
    const stored = storedRecurrenceOf(draft.pattern, interval);
    const out: RuleFields = {
      type,
      amount: amount ?? 0,
      nextRunDate: draft.date,
      note: draft.note.trim(),
      name: draft.name.trim(),
      logoId: logoId ?? null,
      pattern: stored.pattern,
      interval: stored.interval,
      endDate: draft.ends === "on_date" ? draft.endDate : null,
      isActive: draft.active,
    };
    if (flow) {
      out.accountId = draft.accountId;
      out.categoryId = draft.categoryId;
      out.currency = draft.currency;
    } else {
      out.fromAccountId = draft.fromAccountId;
      out.toAccountId = draft.toAccountId;
    }
    if (!rule) return out;
    const before: Record<string, unknown> = {
      type: initial.type,
      amount: evaluateAmount(initial.amount, f.locale),
      nextRunDate: initial.date,
      note: initial.note.trim(),
      name: initial.name.trim(),
      logoId: initial.logoId,
      pattern: rule.pattern,
      interval: rule.interval,
      endDate: initial.ends === "on_date" ? initial.endDate : null,
      isActive: initial.active,
      accountId: initial.accountId,
      categoryId: initial.categoryId,
      currency: initial.type === "transfer" ? null : initial.currency,
      fromAccountId: initial.fromAccountId,
      toAccountId: initial.toAccountId,
    };
    const changed: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(out)) {
      if ((value ?? null) !== (before[key] ?? null)) changed[key] = value;
    }
    // A type change carries everything that type needs, except a logo and dates left as they were.
    if (!changed.type) return changed as RuleFields;
    const full: Record<string, unknown> = { ...out };
    for (const key of ["logoId", "nextRunDate", "endDate"]) if (!(key in changed)) delete full[key];
    return full as RuleFields;
  };

  const save = async () => {
    setTouched(true);
    if (invalid || !ready || busy) return;
    const set_ = fields();
    if (rule && !Object.keys(set_).length) {
      onClose();
      return;
    }
    const ok = rule
      ? await run([{ entity: "recurring", op: "update", id: rule.id, at: rule.updatedAt, set: set_ }], "recurring_update")
      : await run([{ entity: "recurring", op: "create", rule: set_ }], "recurring_create");
    if (ok) onClose();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void save();
  };

  const req = (bad: boolean, text: string = t("required")) => (touched && bad ? <p className="px-1 text-[12px] font-semibold text-error">{text}</p> : null);

  return (
    <Sheet
      wide
      busy={busy}
      onClose={onClose}
      title={
        <span className="block min-w-0">
          <span className="block truncate">{rule ? tr("editRule") : tr("newRule")}</span>
          <span className="block truncate text-[12.5px] font-semibold tracking-normal text-foreground-muted">{tr("sameFlow")}</span>
        </span>
      }
      footer={
        <div className="flex">
          <SaveButton label={tr("saveRule")} busy={busy} disabled={!ready} form={formId} />
        </div>
      }
    >
      <form id={formId} onSubmit={submit} className="grid gap-5 md:grid-cols-2">
        {/* Card 1: the entry the rule makes. */}
        <div className="min-w-0 space-y-3">
          <Pills
            label={t("type")}
            value={type}
            onChange={switchType}
            options={[
              { value: "expense", label: t("expense") },
              { value: "income", label: t("income") },
              { value: "transfer", label: t("transfer") },
            ]}
          />

          <div className="space-y-3 rounded-[22px] border border-border/60 bg-card p-3">
            <label className="block">
              <span className="mb-1.5 block px-1 text-[12.5px] font-bold text-foreground-soft">{t("date")}</span>
              <input type="date" required min={DAY_MIN} max={DAY_MAX} value={draft.date} onChange={(event) => set({ date: event.target.value })} className={INPUT} />
            </label>
            {req(missing.date)}

            <div className={`rounded-2xl border bg-background-subtle/50 px-4 py-3 ${touched && missing.amount ? "border-error/60" : "border-border/60"}`}>
              <label className="block">
                <span className="block text-[11.5px] font-bold text-foreground-muted">{t("amount")}</span>
                <span className={`flex items-baseline gap-1 text-[30px] font-extrabold tracking-[-0.02em] ${TYPE_TINT[type]}`}>
                  <span className="shrink-0">{symbol}</span>
                  <input
                    data-autofocus
                    inputMode="decimal"
                    autoComplete="off"
                    value={draft.amount}
                    placeholder="0"
                    aria-invalid={touched && missing.amount}
                    onChange={(event) => set({ amount: event.target.value })}
                    onBlur={() => {
                      const settled = settledAmount(draft.amount, f.locale);
                      if (settled !== null) set({ amount: settled });
                    }}
                    className="tabular w-full min-w-0 bg-transparent outline-none placeholder:text-foreground-muted/60"
                  />
                </span>
              </label>
              {flow && model.currencies.length > 1 ? (
                <Select aria-label={t("currencyLabel")} value={draft.currency} onChange={(event) => set({ currency: event.target.value })} className="mt-2 w-[120px]">
                  {(model.currencies.includes(draft.currency) ? model.currencies : [draft.currency, ...model.currencies]).map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </Select>
              ) : null}
            </div>
            {req(missing.amount, tr("amountRequired"))}

            {flow ? (
              <>
                <PickerRow
                  label={t("accountLabel")}
                  value={account?.name ?? null}
                  placeholder={t("chooseAccount")}
                  icon={account ? <AccountLogo logoId={account.logoId} name={account.name} size={26} /> : <ClayImg name="settings/accounts" size={24} />}
                  error={touched && missing.account}
                  onClick={() => setPicker("account")}
                />
                {req(missing.account)}
                <PickerRow
                  label={t("categoryLabel")}
                  value={categoryLabel(model, draft.categoryId)}
                  placeholder={tr("chooseCategory")}
                  icon={category ? <CategoryGlyph icon={category.icon} name={category.name} color={category.color} size={26} /> : undefined}
                  error={touched && missing.category}
                  onClick={() => setPicker("category")}
                />
                {req(missing.category)}
              </>
            ) : (
              <div className="space-y-2">
                <PickerRow
                  label={t("from")}
                  value={from?.name ?? null}
                  placeholder={t("chooseAccount")}
                  icon={from ? <AccountLogo logoId={from.logoId} name={from.name} size={26} /> : <ClayImg name="settings/accounts" size={24} />}
                  error={touched && (missing.from || missing.same)}
                  onClick={() => setPicker("from")}
                />
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => set({ fromAccountId: draft.toAccountId, toAccountId: draft.fromAccountId })}
                    aria-label={t("swapAccounts")}
                    title={t("swapAccounts")}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-primary/35 bg-primary/10 text-primary-dark"
                  >
                    <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" />
                    </svg>
                  </button>
                </div>
                <PickerRow
                  label={t("to")}
                  value={to?.name ?? null}
                  placeholder={t("chooseAccount")}
                  icon={to ? <AccountLogo logoId={to.logoId} name={to.name} size={26} /> : <ClayImg name="settings/accounts" size={24} />}
                  error={touched && (missing.to || missing.same)}
                  onClick={() => setPicker("to")}
                />
                {touched && missing.same ? req(true, t("differentAccount")) : req(missing.from || missing.to)}
              </div>
            )}

            <label className="block">
              <span className="mb-1.5 block px-1 text-[12.5px] font-bold text-foreground-soft">{t("note")}</span>
              <input value={draft.note} maxLength={500} placeholder={t("optional")} onChange={(event) => set({ note: event.target.value })} className={INPUT} />
            </label>
          </div>
        </div>

        {/* Card 2: the rule's own settings. */}
        <div className="min-w-0 space-y-3">
          <div className="space-y-3 rounded-[22px] border border-border/60 bg-card p-3">
            <p className="px-1 text-[11.5px] font-extrabold uppercase tracking-[0.08em] text-foreground-muted">{tr("settings")}</p>
            <label className="block">
              <span className="mb-1.5 block px-1 text-[12.5px] font-bold text-foreground-soft">{tr("ruleName")}</span>
              <input
                value={draft.name}
                maxLength={200}
                placeholder={tr("ruleNamePlaceholder")}
                aria-invalid={touched && missing.name}
                onChange={(event) => set({ name: event.target.value })}
                className={`${INPUT} ${touched && missing.name ? "border-error/60" : ""}`}
              />
            </label>
            {req(missing.name, tr("enterRuleName"))}

            <PickerRow
              label={tr("logo")}
              value={logoId ? logoName(logoId, tr("customLogo")) : tr("noLogo")}
              placeholder={tr("noLogo")}
              icon={<SubscriptionLogo logoId={logoId ?? null} name={draft.name || "?"} size={26} />}
              onClick={() => setPicker("logo")}
            />

            <div>
              <span className="mb-1.5 block px-1 text-[12.5px] font-bold text-foreground-soft">{tr("repeat")}</span>
              <div role="radiogroup" aria-label={tr("repeat")} className="grid grid-cols-2 gap-2">
                {RECURRENCE_FREQUENCIES.map((pattern) => {
                  const active = draft.pattern === pattern;
                  return (
                    <button
                      key={pattern}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => set({ pattern })}
                      className={`rounded-2xl border px-3 py-3 text-[14px] font-bold transition-colors ${
                        active ? "border-primary/30 bg-primary/15 text-primary-dark" : "border-transparent bg-background-subtle/70 text-foreground hover:bg-background-subtle"
                      }`}
                    >
                      {tr(pattern)}
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="block">
              <span className="mb-1.5 block px-1 text-[12.5px] font-bold text-foreground-soft">{tr("every")}</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={maxInterval}
                step={1}
                value={draft.interval}
                aria-invalid={touched && missing.interval}
                onChange={(event) => set({ interval: event.target.value })}
                className={`${INPUT} ${touched && missing.interval ? "border-error/60" : ""}`}
              />
            </label>
            {req(missing.interval)}

            <div>
              <span className="mb-1.5 block px-1 text-[12.5px] font-bold text-foreground-soft">{tr("ends")}</span>
              <Pills
                label={tr("ends")}
                value={draft.ends}
                onChange={(ends) => set({ ends, endDate: ends === "on_date" && !draft.endDate ? draft.date : draft.endDate })}
                options={[
                  { value: "never", label: tr("never") },
                  { value: "on_date", label: tr("onDate") },
                ]}
              />
            </div>
            {draft.ends === "on_date" ? (
              <>
                <label className="block">
                  <span className="mb-1.5 block px-1 text-[12.5px] font-bold text-foreground-soft">{tr("endDate")}</span>
                  <input
                    type="date"
                    min={draft.date}
                    max={DAY_MAX}
                    value={draft.endDate}
                    aria-invalid={touched && missing.endDate}
                    onChange={(event) => set({ endDate: event.target.value })}
                    className={`${INPUT} ${touched && missing.endDate ? "border-error/60" : ""}`}
                  />
                </label>
                {req(missing.endDate, tr("validEndDate"))}
              </>
            ) : null}

            <div className="flex items-center justify-between gap-3 px-1">
              <span className="text-[12.5px] font-bold text-foreground-soft">{tr("status")}</span>
              <Segmented
                label={tr("status")}
                value={draft.active ? "active" : "paused"}
                onChange={(value) => set({ active: value === "active" })}
                options={[
                  { value: "active", label: tr("active") },
                  { value: "paused", label: tr("paused") },
                ]}
              />
            </div>
          </div>

          <EditError message={error} onReload={reload} />
          <EditBlocked />
        </div>
      </form>

      {picker === "account" ? <AccountPickerSheet value={draft.accountId} onClose={() => setPicker(null)} onChange={(id) => set({ accountId: id, currency: model.accountById.get(id)?.currency ?? draft.currency })} /> : null}
      {picker === "from" ? <AccountPickerSheet value={draft.fromAccountId} disabledId={draft.toAccountId} onClose={() => setPicker(null)} onChange={(id) => set({ fromAccountId: id })} /> : null}
      {picker === "to" ? <AccountPickerSheet value={draft.toAccountId} disabledId={draft.fromAccountId} onClose={() => setPicker(null)} onChange={(id) => set({ toAccountId: id })} /> : null}
      {picker === "category" && flow ? <CategoryPickerSheet type={type as "expense" | "income"} value={draft.categoryId} onChange={(id) => set({ categoryId: id })} onClose={() => setPicker(null)} /> : null}
      {picker === "logo" ? (
        <LogoPickerSheet
          value={logoId ?? null}
          name={draft.name}
          customId={initial.logoId?.startsWith("custom:") ? initial.logoId : null}
          onClose={() => setPicker(null)}
          onChange={(id) => set({ logoId: id, logoManual: true })}
        />
      ) : null}
    </Sheet>
  );
}

// -------------------------------------------------------------------- logos --

/** The subscription logos, named as the app names them. */
let catalog: LogoEntry[] | null = null;
function logoCatalogOnce(): LogoEntry[] {
  catalog ??= logoCatalog(SUBSCRIPTION_LOGOS, SUBSCRIPTION_LOGO_NAMES);
  return catalog;
}

/** The app's name match (suggestSubscriptionLogo): exact, then the longest brand the name starts with, then one unambiguous expansion. */
function suggestLogo(ruleName: string): string | null {
  const q = normalize(ruleName);
  if (q.length < 2) return null;
  const exact: LogoEntry[] = [];
  const extendsBrand: LogoEntry[] = [];
  const brandExtends: LogoEntry[] = [];
  for (const entry of logoCatalogOnce()) {
    if (entry.key === q || entry.slug === q) exact.push(entry);
    else if (q.startsWith(`${entry.key} `) || q.startsWith(`${entry.slug} `)) extendsBrand.push(entry);
    else if (entry.key.startsWith(`${q} `)) brandExtends.push(entry);
  }
  if (exact.length) return [...exact].sort(byGlobal)[0].id;
  if (extendsBrand.length) return [...extendsBrand].sort((a, b) => b.key.length - a.key.length || byGlobal(a, b))[0].id;
  const distinct = new Set(brandExtends.map((entry) => entry.key));
  return distinct.size === 1 ? [...brandExtends].sort(byGlobal)[0].id : null;
}

function logoName(id: string, custom: string): string {
  return logoCatalogOnce().find((entry) => entry.id === id)?.name ?? custom;
}

/** The app's subscription logo picker: "No logo" first, search across every country, or browse one. */
function LogoPickerSheet({
  value,
  name,
  customId,
  onChange,
  onClose,
}: {
  value: string | null;
  name: string;
  customId: string | null;
  onChange: (id: string | null) => void;
  onClose: () => void;
}) {
  const tr = useTranslations("dashboard.edit.rule");
  const f = useFormat();
  const countries = useMemo(() => logoCountries(logoCatalogOnce(), SUBSCRIPTION_LOGO_COUNTRIES, f.locale, tr("global")), [f.locale, tr]);
  // No region to go on: the cross-border list.
  const [country, setCountry] = useState(() => browserCountry(countries.map((c) => c.slug), "global"));
  const [query, setQuery] = useState("");
  const results = useMemo(
    () =>
      query.trim()
        ? searchLogos(logoCatalogOnce(), query, SUBSCRIPTION_LOGO_COUNTRIES)
        : logoCatalogOnce()
            .filter((entry) => entry.country === country)
            .sort((a, b) => a.name.localeCompare(b.name, f.locale)),
    [query, country, f.locale],
  );
  const pick = (id: string | null) => {
    onChange(id);
    onClose();
  };
  const tile = (active: boolean) =>
    `flex min-w-0 flex-col items-center gap-1.5 rounded-2xl border px-2 py-3 text-center transition-colors ${
      active ? "border-primary/30 bg-primary/15" : "border-transparent bg-background-subtle/70 hover:bg-background-subtle"
    }`;
  return (
    <Sheet title={tr("logo")} onClose={onClose} wide>
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <label className="min-w-[200px] flex-1">
            <span className="sr-only">{tr("searchLogos")}</span>
            <input type="search" value={query} placeholder={tr("searchLogos")} onChange={(event) => setQuery(event.target.value)} className={INPUT} data-autofocus />
          </label>
          {!query.trim() ? (
            <Select aria-label={tr("country")} value={country} onChange={(event) => setCountry(event.target.value)} className="w-[200px] self-center">
              {countries.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.label}
                </option>
              ))}
            </Select>
          ) : null}
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          <button type="button" aria-pressed={!value} onClick={() => pick(null)} className={tile(!value)}>
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-[28%] border border-dashed border-border text-foreground-muted">
              <ClayImg name="ui/close" size={18} />
            </span>
            <span className="w-full truncate text-[12px] font-bold text-foreground">{tr("noLogo")}</span>
          </button>
          {customId ? (
            <button type="button" aria-pressed={value === customId} onClick={() => pick(customId)} className={tile(value === customId)}>
              <SubscriptionLogo logoId={customId} name={name || "?"} size={40} />
              <span className="w-full truncate text-[12px] font-bold text-foreground">{tr("customLogo")}</span>
            </button>
          ) : null}
          {results.map((entry) => (
            <button key={entry.id} type="button" aria-pressed={value === entry.id} onClick={() => pick(entry.id)} className={tile(value === entry.id)} title={entry.name}>
              <SubscriptionLogo logoId={entry.id} name={entry.name} size={40} />
              <span className="w-full truncate text-[12px] font-bold text-foreground">{entry.name}</span>
            </button>
          ))}
        </div>
        {query.trim() && !results.length ? <p className="py-6 text-center text-[13px] text-foreground-muted">{tr("noResults")}</p> : null}
      </div>
    </Sheet>
  );
}
