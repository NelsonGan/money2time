"use client";

import { useTranslations } from "next-intl";
import { useId, useMemo, useState, type FormEvent } from "react";

import type { Account } from "@/lib/backup/model";
import { loanProgress } from "@/lib/backup/loans";

import { useDashboard, useFormat } from "../state";
import { AccountLogo, CategoryGlyph, ClayImg, Select } from "../ui";
import { AccountLogoPickerSheet } from "./account-editor";
import {
  AccountPickerSheet,
  CancelButton,
  CategoryPickerSheet,
  Confirm,
  DAY_MAX,
  DAY_MIN,
  DeleteButton,
  EditBlocked,
  EditError,
  Field,
  INPUT,
  MAX_AMOUNT,
  MoneyField,
  PickerRow,
  Reloadable,
  SaveButton,
  Sheet,
  Toggle,
  categoryLabel,
  categoryTree,
  convertAmount,
  evaluateAmount,
  formatAmountInput,
  isDayKey,
  movedBalance,
  phoneToday,
  readNumber,
  transfersInto,
  useEditRun,
  formatDecimal,
} from "./kit";
import { MAX_LOAN_TERM_MONTHS, computeLoanQuote, contractFields, inputValue, pendingRateChange, rateForTotalRepayable, totalRepayableFor, type LoanModel } from "./loan-math";

/*
 * The loan block of the app's account editor (AccountsScreen) on the web:
 * the contract (interest model, amount, period, rate or total, instalment),
 * how repayments are collected and reported, and the start date. The phone
 * works the contract out again from this form with the app's own loan maths
 * (services/webDashboardEditModules/loan.ts there) and asks the same
 * questions: the new rate's start, a currency change, a changed balance.
 */

/** The loan editor's form as the phone's `module:loan` reads it. */
type LoanForm = {
  name: string;
  group: string | null;
  logoId: string | null;
  currency: string;
  includeInTotals: boolean;
  model: LoanModel;
  principal: number;
  termMonths: number | null;
  driver: "rate" | "total";
  rate: number | null;
  total: number | null;
  instalment: number | null;
  paidPeriods?: number;
  startDate: string;
  countAsExpense: boolean;
  paymentCategoryId: string | null;
  collectFromAccountId?: string | null;
};

/** The loan ops the phone's `module:loan` reads. */
type LoanOp =
  | { entity: "module:loan"; op: "create"; loan: LoanForm }
  | {
      entity: "module:loan";
      op: "update";
      id: string;
      at: string | null;
      loan: LoanForm;
      balance?: number;
      balanceRecord?: "difference" | "flow";
      rateApply?: "start" | "today";
    }
  | { entity: "module:loan"; op: "archive"; id: string; at: string | null; archived: boolean }
  | { entity: "module:loan"; op: "delete"; id: string; at: string | null };

/** The loan columns the editor reads that the dashboard's row type leaves out. */
type LoanRow = Account["raw"] & { card_design?: string | null; loan_count_as_expense?: number | boolean | null; loan_payment_category_id?: string | null };

type Draft = {
  name: string;
  logoId: string | null;
  group: string | null;
  currency: string;
  includeInTotals: boolean;
  model: LoanModel;
  principal: string;
  term: string;
  driver: "rate" | "total";
  rate: string;
  total: string;
  manual: boolean;
  instalment: string;
  paidPeriods: string;
  startDate: string;
  countAsExpense: boolean;
  categoryId: string | null;
  /** The pick, or undefined while untouched (the rule paying in now shows). */
  collect: string | null | undefined;
  balance: string;
};

const DEFAULT_LOAN_CATEGORY_NAME = "bills";

/**
 * Creates or edits a loan: the loan fields of the app's account editor on the
 * web. After a conflict it can start over on the phone's newer copy.
 */
export function LoanEditor({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const { fullModel: model } = useDashboard();
  return (
    <Reloadable row={account} fresh={(row) => (row ? model.accountById.get(row.id) : null)} at={(row) => row?.raw.updated_at}>
      {(row) => <LoanForm account={row} onClose={onClose} />}
    </Reloadable>
  );
}

function LoanForm({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const t = useTranslations("dashboard.edit.loan");
  const te = useTranslations("dashboard.edit");
  const { fullModel: model } = useDashboard();
  const f = useFormat();
  const { run, busy, error, ready, clear, fail, reload } = useEditRun();
  const formId = useId();
  // The balance the editor opened on; a correction is worked out from it.
  const [openedBalance, setOpenedBalance] = useState(() => account?.balance ?? 0);
  const row = account?.raw as LoanRow | undefined;
  const groupNames = useMemo(() => model.groups.map((group) => group.name), [model.groups]);
  const today = phoneToday();

  const initial = useMemo<Draft>(() => {
    if (!account || !row) {
      return {
        name: "",
        logoId: null,
        group: null,
        currency: model.currency,
        includeInTotals: true,
        model: "reducing",
        principal: "",
        term: "",
        driver: "rate",
        rate: "",
        total: "",
        manual: false,
        instalment: "",
        paidPeriods: "",
        startDate: today,
        countAsExpense: true,
        categoryId: null,
        collect: undefined,
        balance: "",
      };
    }
    const instalment = row.loan_monthly_payment ?? null;
    const term = row.loan_term_months ?? null;
    // As the app reopens a loan: the stored total leads, the rate is read back off it.
    const total =
      row.loan_total_repayable ??
      (instalment != null && term != null ? Math.round(instalment * term * 100) / 100 : totalRepayableFor(row.loan_original_principal ?? 0, row.loan_interest_rate ?? null, term ?? 0));
    const auto = instalment == null || total == null || term == null || term <= 0 || Math.abs(instalment - Math.round((total / term) * 100) / 100) <= 0.005;
    return {
      name: account.name,
      logoId: account.logoId,
      // The app's picker offers group records only, so a name without one opens (and saves) ungrouped.
      group: account.group && groupNames.includes(account.group) ? account.group : null,
      currency: account.currency,
      includeInTotals: account.includeInTotals,
      model: row.loan_interest_model === "reducing" ? "reducing" : "flat",
      principal: row.loan_original_principal != null ? formatAmountInput(row.loan_original_principal, f.locale) : "",
      term: term != null ? String(term) : "",
      driver: "total",
      rate: "",
      total: total == null ? "" : formatAmountInput(total, f.locale),
      manual: !auto,
      instalment: instalment != null ? formatAmountInput(instalment, f.locale) : "",
      paidPeriods: "",
      startDate: row.loan_start_date ?? today,
      countAsExpense: Boolean(row.loan_count_as_expense),
      categoryId: row.loan_payment_category_id ?? null,
      collect: undefined,
      balance: formatAmountInput(account.balance, f.locale),
    };
  }, [account, row, groupNames, model.currency, f.locale, today]);

  const [draft, setDraft] = useState<Draft>(initial);
  const [prompt, setPrompt] = useState<null | "delete" | "rate" | "currency" | "balance">(null);
  const [rateApply, setRateApply] = useState<"start" | "today" | undefined>(undefined);
  const [picker, setPicker] = useState<null | "logo" | "collect" | "category">(null);
  const [touched, setTouched] = useState(false);
  const [details, setDetails] = useState(false);
  const set = (patch: Partial<Draft>) => {
    clear();
    if (prompt !== "delete") setPrompt(null);
    setRateApply(undefined);
    setDraft((current) => ({ ...current, ...patch }));
  };

  // ---- the contract, worked out as the app's form does while it is typed
  const principal = evaluateAmount(draft.principal, f.locale);
  const principalValue = principal ?? 0;
  const term = readNumber(draft.term, f.locale);
  const termValue = term ?? 0;
  const fields = contractFields({
    model: draft.model,
    principal: principalValue,
    termMonths: termValue,
    driver: draft.driver,
    rate: readNumber(draft.rate, f.locale),
    total: draft.driver === "total" ? evaluateAmount(draft.total, f.locale) : null,
  });
  const total = fields.total;
  const derivedInstalment = total != null && total > 0 && Number.isInteger(termValue) && termValue > 0 ? Math.round((total / termValue) * 100) / 100 : null;
  const typedInstalment = evaluateAmount(draft.instalment, f.locale);
  const instalment = draft.manual ? typedInstalment : derivedInstalment;
  const derivedRate = total != null ? rateForTotalRepayable(principalValue, total, termValue) : null;
  const paidPeriods = draft.paidPeriods.trim() ? readNumber(draft.paidPeriods, f.locale) : 0;
  // Where an existing loan stands, read off the balance typed, as the app's form reads it.
  const typedBalance = account ? evaluateAmount(draft.balance, f.locale) : null;
  const progressPayment = instalment ?? row?.loan_monthly_payment ?? 0;
  const progress =
    account && row && typedBalance !== null && typedBalance > 0 && progressPayment > 0
      ? loanProgress(
          {
            ...row,
            loan_original_principal: principal,
            loan_monthly_payment: progressPayment,
            loan_payment_day: null,
            loan_start_date: null,
            loan_interest_rate: derivedRate,
            loan_interest_model: draft.model,
            loan_term_months: Number.isInteger(termValue) ? termValue : null,
            loan_total_repayable: total ?? row.loan_total_repayable ?? null,
          },
          typedBalance,
          model.today,
        )
      : null;
  const quote = computeLoanQuote({
    principal: principalValue,
    termMonths: termValue,
    // An existing loan's progress is read off its balance on the phone; this previews it.
    paidPeriods: account ? Math.min(Math.max(0, progress?.instalmentsPaid ?? 0), Math.max(0, termValue - 1)) : (paidPeriods ?? 0),
    startDate: draft.startDate,
    totalRepayable: total,
    instalment,
  });
  const validPrincipal = principal !== null && Number.isFinite(principal) && principal > 0 && principal <= MAX_AMOUNT;
  const termError = term !== null && !(Number.isInteger(term) && term >= 1 && term <= MAX_LOAN_TERM_MONTHS) ? t("termError", { max: MAX_LOAN_TERM_MONTHS }) : null;
  const paidError =
    !account && draft.paidPeriods.trim() && !(paidPeriods !== null && Number.isInteger(paidPeriods) && paidPeriods >= 0 && (!Number.isInteger(termValue) || paidPeriods < termValue)) ? t("paidPeriodsError") : null;
  const totalError =
    total != null && validPrincipal && !termError && term !== null && !quote && !paidError ? (total < principalValue ? t("instalmentErrorLow") : t("instalmentErrorHigh")) : null;
  const percent = (value: number) => formatDecimal(value, f.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const effectiveRateHint = draft.model === "flat" && fields.rate != null && derivedRate != null && derivedRate > 0 ? t("effectiveRateHint", { rate: percent(derivedRate) }) : null;

  // ---- repayments
  const sources = useMemo(() => model.accounts.filter((item) => item.type === "debit" && item.currency === draft.currency), [model.accounts, draft.currency]);
  const existingRule = useMemo(() => (account ? (transfersInto(model, account.id)[0] ?? null) : null), [model, account]);
  const collectId = draft.collect === undefined ? (existingRule?.from_account_id ?? null) : draft.collect;
  const collect = sources.find((item) => item.id === collectId) ?? null;
  // A rule paying from an account this picker cannot offer stays read only.
  const external = existingRule != null && draft.collect === undefined && !collect;
  const externalLabel = external ? (model.accountById.get(existingRule?.from_account_id ?? "")?.name ?? existingRule?.name ?? "") : null;
  const roots = useMemo(() => categoryTree(model, "expense").map((node) => node.parent), [model]);
  const effectiveCategory = useMemo(() => {
    const picked = draft.categoryId ? model.categories.get(draft.categoryId) : null;
    const drawable = picked && !picked.deleted && picked.type === "expense" && (!picked.parentId || roots.some((root) => root.id === picked.parentId));
    if (drawable) return picked.id;
    return roots.find((root) => root.name.trim().toLowerCase() === DEFAULT_LOAN_CATEGORY_NAME)?.id ?? roots[0]?.id ?? null;
  }, [draft.categoryId, model, roots]);
  const category = effectiveCategory ? model.categories.get(effectiveCategory) : null;

  // ---- balance (an existing loan only)
  const balance = account ? evaluateAmount(draft.balance, f.locale) : null;
  const currencyChanged = Boolean(account && draft.currency !== account.currency);
  const balanceChanged = Boolean(account && !currencyChanged && balance !== null && Math.abs(balance - openedBalance) > 0.000001);
  const currencies = [...new Set([...model.currencies, draft.currency])];

  const name = draft.name.trim();
  const validContract = account ? validPrincipal && (term === null || quote != null) : quote != null;
  const tooLarge = [total, instalment].some((value) => value != null && value > MAX_AMOUNT);
  const missing = {
    name: !name,
    contract: !validContract || tooLarge,
    balance: Boolean(account) && (balance === null || Math.abs(balance) > MAX_AMOUNT),
    start: !isDayKey(draft.startDate),
  };
  const invalid = Object.values(missing).some(Boolean);

  const form = (): LoanForm => {
    const out: LoanForm = {
      name,
      group: draft.group,
      logoId: draft.logoId,
      currency: draft.currency,
      includeInTotals: draft.includeInTotals,
      model: draft.model,
      principal: principalValue,
      termMonths: term,
      driver: draft.driver,
      rate: draft.driver === "rate" && fields.rate != null && Number.isFinite(fields.rate) ? fields.rate : null,
      total: draft.driver === "total" ? total : null,
      instalment: draft.manual ? typedInstalment : null,
      startDate: draft.startDate,
      countAsExpense: draft.countAsExpense,
      paymentCategoryId: draft.countAsExpense ? effectiveCategory : (draft.categoryId ?? null),
    };
    if (!account) out.paidPeriods = paidPeriods ?? 0;
    if (!external) out.collectFromAccountId = collect?.id ?? null;
    return out;
  };

  const send = async (record?: "difference" | "flow", apply = rateApply) => {
    if (!ready || busy) return;
    const op: LoanOp = account
      ? {
          entity: "module:loan",
          op: "update",
          id: account.id,
          at: account.raw.updated_at ?? null,
          loan: form(),
          ...(record && balance !== null ? { balance, balanceRecord: record } : {}),
          ...(apply ? { rateApply: apply } : {}),
        }
      : { entity: "module:loan", op: "create", loan: form() };
    const ok = await run([op], account ? "loan_update" : "loan_create");
    if (ok) onClose();
    else {
      setPrompt(null);
      setRateApply(undefined);
    }
  };

  /** After the rate question: the currency question, then the balance one, as the app asks them. */
  const next = (apply?: "start" | "today") => {
    setRateApply(apply);
    if (currencyChanged) setPrompt("currency");
    else if (balanceChanged && account) {
      // The phone records the difference from its balance now: if a payment
      // moved it since the editor opened, start the balance over from it.
      const live = movedBalance(model, account, openedBalance);
      if (live !== null) {
        setOpenedBalance(live);
        setDraft((current) => ({ ...current, balance: formatAmountInput(live, f.locale) }));
        setPrompt(null);
        setRateApply(undefined);
        fail("conflict");
        return;
      }
      setPrompt("balance");
    } else void send(undefined, apply);
  };

  const rateChange =
    account && row
      ? pendingRateChange(
          row,
          {
            model: draft.model,
            principal: validPrincipal ? principalValue : null,
            totalRepayable: quote ? quote.totalRepayable : null,
            termMonths: quote ? termValue : (row.loan_term_months ?? null),
            rate: derivedRate,
          },
          today,
        )
      : null;

  const save = () => {
    setTouched(true);
    if (invalid || !ready || busy) return;
    if (rateChange) {
      setPrompt("rate");
      return;
    }
    next();
  };

  const remove = async () => {
    if (!account || !ready || busy) return;
    if (await run([{ entity: "module:loan", op: "delete", id: account.id, at: account.raw.updated_at ?? null }], "loan_delete")) onClose();
  };
  const archive = async () => {
    if (!account || !ready || busy) return;
    const archived = !(account.loan?.archived ?? false);
    if (await run([{ entity: "module:loan", op: "archive", id: account.id, at: account.raw.updated_at ?? null, archived }], archived ? "loan_archive" : "loan_unarchive")) onClose();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save();
  };
  const show = (key: keyof typeof missing) => touched && missing[key];
  const money = (value: number) => f.foreign(value, draft.currency);
  // On a loan a falling balance is debt paid, so it records as income.
  const flowIsIncome = balance !== null && account ? balance - openedBalance < 0 : false;

  return (
    <Sheet
      busy={busy}
      onClose={onClose}
      title={account ? t("editTitle") : t("newTitle")}
      headerAction={account ? <DeleteButton label={t("delete")} onClick={() => setPrompt("delete")} disabled={busy} /> : null}
      footer={
        <div className="flex flex-wrap gap-2">
          <CancelButton onClick={onClose} disabled={busy} />
          <SaveButton label={t("save")} busy={busy} disabled={!ready || (prompt !== null && prompt !== "delete")} form={formId} />
        </div>
      }
    >
      <form id={formId} onSubmit={submit} className="space-y-4">
        {prompt === "delete" ? (
          <Confirm
            title={t("delete")}
            body={t("deleteBody")}
            actions={[
              { label: te("cancel"), onClick: () => setPrompt(null) },
              { label: te("delete"), tone: "danger", onClick: () => void remove(), disabled: !ready || busy },
            ]}
          />
        ) : null}

        <Field label={t("name")} error={show("name") ? te("required") : null}>
          <input
            data-autofocus
            value={draft.name}
            maxLength={200}
            placeholder={t("namePlaceholder")}
            aria-invalid={show("name")}
            onChange={(event) => set({ name: event.target.value })}
            className={`${INPUT} ${show("name") ? "border-error/60" : ""}`}
          />
        </Field>

        <Field label={t("logo")}>
          <div className="flex min-h-12 w-full items-center gap-3 rounded-2xl border border-border bg-background-subtle/60 px-4 py-2.5">
            <button type="button" onClick={() => setPicker("logo")} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={t("logo")}>
              {draft.logoId ? (
                <AccountLogo logoId={draft.logoId} name={name || "?"} size={36} />
              ) : (
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[28%] bg-card">
                  <ClayImg name="ui/plus" size={18} />
                </span>
              )}
              <span className={`min-w-0 flex-1 truncate text-[14.5px] ${draft.logoId ? "font-bold text-foreground" : "text-foreground-muted"}`}>{draft.logoId ? t("logo") : t("logoAdd")}</span>
            </button>
            {draft.logoId ? (
              <button type="button" onClick={() => set({ logoId: null })} aria-label={t("logoClear")} title={t("logoClear")} className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-background-subtle text-foreground-muted hover:text-foreground">
                <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            ) : null}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("group")}>
            <Select value={draft.group ?? ""} onChange={(event) => set({ group: event.target.value || null })} className="w-full">
              <option value="">{te("ungrouped")}</option>
              {groupNames.map((group) => (
                <option key={group} value={group}>
                  {group}
                </option>
              ))}
              {draft.group && !groupNames.includes(draft.group) ? <option value={draft.group}>{draft.group}</option> : null}
            </Select>
          </Field>
          <Field label={t("currency")}>
            <Select
              value={draft.currency}
              onChange={(event) => {
                const code = event.target.value;
                // The contract's money is in the loan's currency too, so it converts in place.
                const convert = (text: string) => {
                  const value = evaluateAmount(text, f.locale);
                  const converted = value !== null && value !== 0 ? convertAmount(model, value, draft.currency, code) : null;
                  return converted === null ? text : formatAmountInput(Math.round(converted * 100) / 100, f.locale);
                };
                set({
                  currency: code,
                  principal: convert(draft.principal),
                  total: convert(draft.total),
                  instalment: convert(draft.instalment),
                  balance: account ? initial.balance : draft.balance,
                  collect: undefined,
                });
              }}
              className="w-full"
            >
              {currencies.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label={t("interestModel")} hint={t("interestModelInfo")}>
          <div role="radiogroup" aria-label={t("interestModel")} className="flex flex-wrap gap-2">
            {(["reducing", "flat"] as const).map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={draft.model === option}
                onClick={() => set({ model: option })}
                className={`rounded-full border px-4 py-2.5 text-[13.5px] font-bold transition-colors ${draft.model === option ? "border-primary/50 bg-primary/15 text-primary-dark" : "border-border bg-card text-foreground-soft hover:text-foreground"}`}
              >
                {option === "reducing" ? t("modelReducing") : t("modelFlat")}
              </button>
            ))}
          </div>
        </Field>

        <MoneyField label={t("principal")} value={draft.principal} onChange={(value) => set({ principal: value })} currency={draft.currency} error={touched && !validPrincipal ? te("required") : null} />

        <Field label={t("term")} error={termError} hint={t("termInfo", { max: MAX_LOAN_TERM_MONTHS })}>
          <input inputMode="numeric" value={draft.term} placeholder="60" onChange={(event) => set({ term: event.target.value })} className={`${INPUT} ${termError ? "border-error/60" : ""}`} />
        </Field>

        <Field label={t("rate")} hint={effectiveRateHint ?? (draft.model === "reducing" ? t("rateInfoReducing") : t("rateInfoFlat"))}>
          <span className="flex h-12 items-center gap-2 rounded-2xl border border-border bg-background-subtle/60 px-4 focus-within:border-primary focus-within:bg-card">
            <input
              inputMode="decimal"
              autoComplete="off"
              value={draft.driver === "rate" ? draft.rate : fields.rate == null ? "" : formatDecimal(fields.rate, f.locale)}
              placeholder={formatDecimal(4.2, f.locale, { minimumFractionDigits: 2 })}
              onChange={(event) => set({ driver: "rate", rate: event.target.value })}
              className="tabular h-full min-w-0 flex-1 bg-transparent text-[14.5px] text-foreground outline-none placeholder:text-foreground-muted"
            />
            <span className="shrink-0 text-[14.5px] font-bold text-foreground-muted">%</span>
          </span>
        </Field>

        <MoneyField
          label={t("totalRepayable")}
          value={draft.driver === "total" ? draft.total : total == null ? "" : formatAmountInput(Number(inputValue(total)), f.locale)}
          onChange={(value) => set({ driver: "total", total: value })}
          currency={draft.currency}
          error={totalError}
          hint={t("totalRepayableInfo")}
        />

        <div className="space-y-2">
          <Toggle
            checked={draft.manual}
            onChange={(manual) =>
              set({ manual, ...(manual && !draft.instalment.trim() && derivedInstalment != null ? { instalment: formatAmountInput(derivedInstalment, f.locale) } : {}) })
            }
            label={t("instalment")}
            hint={t("instalmentInfo")}
          />
          {draft.manual ? (
            <MoneyField value={draft.instalment} onChange={(value) => set({ instalment: value })} currency={draft.currency} />
          ) : (
            <p className={`rounded-2xl border border-border/60 bg-background-subtle/40 px-4 py-3 text-[14.5px] ${derivedInstalment == null ? "text-foreground-muted" : "tabular font-bold text-foreground"}`}>
              {derivedInstalment == null ? t("awaitingContract") : money(derivedInstalment)}
            </p>
          )}
        </div>

        {!account ? (
          <Field label={t("paidPeriods")} error={paidError} hint={t("paidPeriodsInfo")}>
            <input inputMode="numeric" value={draft.paidPeriods} placeholder="0" onChange={(event) => set({ paidPeriods: event.target.value })} className={`${INPUT} ${paidError ? "border-error/60" : ""}`} />
          </Field>
        ) : null}

        <Field label={t("collect")} hint={external ? t("collectExternal") : t("collectInfo")}>
          {external ? (
            <p className="rounded-2xl border border-border/60 bg-background-subtle/40 px-4 py-3 text-[14.5px] text-foreground-muted">{externalLabel}</p>
          ) : (
            <div className="flex items-center rounded-2xl border border-border bg-background-subtle/60">
              <button type="button" onClick={() => setPicker("collect")} className="flex min-h-12 min-w-0 flex-1 items-center gap-2 px-4 py-2.5 text-left">
                {collect ? <AccountLogo logoId={collect.logoId} name={collect.name} size={22} /> : null}
                <span className={`truncate text-[14.5px] ${collect ? "font-bold text-foreground" : "text-foreground-muted"}`}>{collect?.name ?? t("collectManual")}</span>
              </button>
              {collect ? (
                <button type="button" onClick={() => set({ collect: null })} aria-label={t("collectManual")} title={t("collectManual")} className="px-4 py-3 text-foreground-muted hover:text-foreground">
                  <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden="true">
                    <path d="M6 6l12 12M18 6 6 18" />
                  </svg>
                </button>
              ) : null}
            </div>
          )}
        </Field>

        <div className="space-y-2">
          <Toggle checked={draft.countAsExpense} onChange={(countAsExpense) => set({ countAsExpense })} label={t("countAsExpense")} hint={t("countAsExpenseInfo")} />
          {draft.countAsExpense ? (
            <PickerRow
              label={t("paymentCategory")}
              value={category ? categoryLabel(model, category.id) : null}
              icon={category ? <CategoryGlyph icon={category.icon} name={category.name} color={category.color} size={22} /> : undefined}
              placeholder={t("paymentCategoryPlaceholder")}
              onClick={() => setPicker("category")}
            />
          ) : null}
        </div>

        <Field label={t("startDate")} hint={t("startDateInfo")} error={show("start") ? te("required") : null}>
          <input type="date" required min={DAY_MIN} max={DAY_MAX} value={draft.startDate} onChange={(event) => set({ startDate: event.target.value })} className={INPUT} />
        </Field>

        {account ? (
          <MoneyField label={t("balanceOwed")} value={draft.balance} onChange={(value) => set({ balance: value })} currency={draft.currency} disabled={currencyChanged} hint={draft.model === "flat" && progress ? t("balanceOwedHint", { amount: f.foreign(progress.leftToPay, draft.currency) }) : t("balanceOwedInfo")} error={show("balance") ? te("required") : null} />
        ) : null}

        {quote ? (
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <button type="button" onClick={() => setDetails((open) => !open)} aria-expanded={details} className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left">
              <span>
                <span className="block text-[11px] font-extrabold uppercase tracking-[0.06em] text-primary">{t("totalInterest")}</span>
                <span className="tabular mt-1 block text-[15px] font-extrabold text-foreground">{money(quote.totalInterest)}</span>
              </span>
              <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden="true" className={`text-foreground-muted transition-transform ${details ? "rotate-180" : ""}`}>
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            {details ? (
              <dl className="divide-y divide-border/60 border-t border-border/60 text-[13px]">
                {[
                  [t("leftToPay"), money(quote.leftToPay)],
                  [t("firstInstalment"), f.day(quote.firstInstalmentDate)],
                  [t("payoffBy"), f.day(quote.payoffDate)],
                  [t("instalmentsLeft"), f.number(quote.remainingPeriods)],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <dt className="text-foreground-soft">{label}</dt>
                    <dd className="tabular text-right font-bold text-foreground">{value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </div>
        ) : null}

        <Toggle checked={draft.includeInTotals} onChange={(includeInTotals) => set({ includeInTotals })} label={t("includeInTotals")} hint={t("includeInTotalsHint")} />

        {account ? (
          <button type="button" onClick={() => void archive()} disabled={!ready || busy} className="w-full rounded-2xl border border-border bg-background-subtle/60 px-4 py-3 text-left hover:bg-background-subtle disabled:opacity-50">
            <span className="block text-[14px] font-bold text-foreground">{account.loan?.archived ? t("unarchive") : t("archive")}</span>
            <span className="mt-0.5 block text-[12px] leading-snug text-foreground-muted">{t("archiveHint")}</span>
          </button>
        ) : null}

        {prompt === "rate" && rateChange ? (
          <Confirm
            title={t("rateChangeTitle")}
            body={t("rateChangeMessage", { from: percent(rateChange.from), to: percent(rateChange.to) })}
            actions={[
              { label: te("cancel"), onClick: () => setPrompt(null) },
              { label: t("rateChangeFromStart"), tone: "plain", onClick: () => next("start"), disabled: !ready || busy },
              { label: t("rateChangeFromToday"), tone: "primary", onClick: () => next("today"), disabled: !ready || busy },
            ]}
          />
        ) : null}
        {prompt === "currency" && account ? (
          <Confirm
            title={t("currencyChangeTitle")}
            body={t("currencyChangeMessage", { from: account.currency, to: draft.currency })}
            actions={[
              { label: te("cancel"), onClick: () => setPrompt(null) },
              { label: t("currencyChangeAction"), tone: "danger", onClick: () => void send(), disabled: !ready || busy },
            ]}
          />
        ) : null}
        {prompt === "balance" && account && balance !== null ? (
          <Confirm
            title={t("balancePromptTitle")}
            body={t("balancePromptMessage", { amount: f.foreign(Math.abs(balance - openedBalance), account.currency) })}
            actions={[
              { label: te("cancel"), onClick: () => setPrompt(null) },
              { label: t("recordDifference"), tone: "plain", onClick: () => void send("difference"), disabled: !ready || busy },
              { label: flowIsIncome ? t("recordIncome") : t("recordExpense"), tone: "primary", onClick: () => void send("flow"), disabled: !ready || busy },
            ]}
          />
        ) : null}

        {touched && missing.contract && validPrincipal && !termError && !totalError && !paidError ? <p className="px-1 text-[12px] font-semibold text-error">{t("awaitingContract")}</p> : null}
        <EditError message={error} onReload={reload} />
        <EditBlocked />
      </form>

      {picker === "logo" ? <AccountLogoPickerSheet value={draft.logoId} onChange={(logoId) => set({ logoId })} onClose={() => setPicker(null)} /> : null}
      {picker === "collect" ? (
        <AccountPickerSheet
          value={collect?.id ?? null}
          title={t("collect")}
          filter={(item) => item.type === "debit" && item.currency === draft.currency}
          onChange={(id) => set({ collect: id })}
          onClose={() => setPicker(null)}
        />
      ) : null}
      {picker === "category" ? <CategoryPickerSheet type="expense" value={effectiveCategory} onChange={(categoryId) => set({ categoryId })} onClose={() => setPicker(null)} /> : null}
    </Sheet>
  );
}
