"use client";

import { useTranslations } from "next-intl";
import { useId, useMemo, useState, type FormEvent } from "react";

import { ACCOUNT_LOGOS } from "@/lib/backup/assets.generated";
import { CARD_DESIGN_GENRES, CARD_DESIGNS } from "@/lib/backup/card-designs.generated";
import { ACCOUNT_LOGO_COUNTRIES, ACCOUNT_LOGO_NAMES } from "@/lib/backup/logo-names.generated";
import type { Account, AccountGroup } from "@/lib/backup/model";
import type { AccountFields } from "@/lib/cloud/edits";

import { useDashboard, useFormat } from "../state";
import { AccountLogo, ClayImg, Select } from "../ui";
import {
  AccountPickerSheet,
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
  Toggle,
  convertAmount,
  evaluateAmount,
  formatAmountInput,
  movedBalance,
  phoneNow,
  phoneToday,
  settledAmount,
  useEditRun,
} from "./kit";
import { GoalEditor } from "./goal-editor";
import { LoanEditor } from "./loan-editor";
import { browserCountry, logoCatalog, logoCountries, searchLogos, titleOf } from "./logo-catalog";

/*
 * The app's account editor and group editor on the web. Saving goes through
 * the phone, which applies the same rules as the app: a type is fixed once
 * made, a loan's or goal's money is edited in the app, and a changed balance
 * or currency is confirmed the way the app's alerts ask.
 */

type AccountType = "debit" | "credit";
/** How a card's bill falls due: a day of the month, or days after each statement. */
type DueRule = "day" | "after";

type Draft = {
  type: AccountType;
  name: string;
  logoId: string | null;
  cardDesign: string | null;
  group: string | null;
  currency: string;
  statementDay: string;
  dueDay: string;
  dueRule: DueRule;
  daysAfter: string;
  balance: string;
  includeInTotals: boolean;
};

/** A day of the month as typed, 1 to 31; null when empty, NaN when not a day. */
function readDay(text: string): number | null {
  const clean = text.trim();
  if (!clean) return null;
  const day = Number(clean);
  return Number.isInteger(day) && day >= 1 && day <= 31 ? day : NaN;
}

/** The app's `MAX_DUE_DAYS_AFTER_STATEMENT` and `DEFAULT_DUE_DAYS_AFTER_STATEMENT`. */
const MAX_DAYS_AFTER = 45;
const DEFAULT_DAYS_AFTER = 20;

/** Days after the statement as typed, 1 to 45; NaN otherwise (the app's `isDueDaysAfterStatement`). */
function readDaysAfter(text: string): number {
  const clean = text.trim();
  const days = Number(clean);
  return clean && Number.isInteger(days) && days >= 1 && days <= MAX_DAYS_AFTER ? days : NaN;
}

/** Names as long as the app accepts. */
const MAX_NAME = 200;

function logoName(logoId: string | null): string | null {
  if (!logoId || logoId.startsWith("custom:")) return null;
  return ACCOUNT_LOGO_NAMES[logoId] ?? titleOf(logoId.split("/")[1] ?? logoId);
}

/** The stored card design of an account; the backup row carries it untyped. */
function cardDesignOf(account: Account): string | null {
  return (account.raw as { card_design?: string | null }).card_design || null;
}

const DESIGN_BY_ID = new Map(CARD_DESIGNS.map((design) => [design.id, design]));

/**
 * Adds, edits or deletes an account: the app's account editor on the web.
 * After a conflict it can start over on the phone's newer copy.
 */
export function AccountEditor({ account, presetGroup, onClose }: { account: Account | null; presetGroup?: string | null; onClose: () => void }) {
  const { fullModel: model } = useDashboard();
  return (
    <Reloadable row={account} fresh={(row) => (row ? model.accountById.get(row.id) : null)} at={(row) => row?.raw.updated_at}>
      {(row) => <AccountForm account={row} presetGroup={presetGroup} onClose={onClose} />}
    </Reloadable>
  );
}

function AccountForm({ account, presetGroup, onClose }: { account: Account | null; presetGroup?: string | null; onClose: () => void }) {
  const t = useTranslations("dashboard.edit.account");
  const te = useTranslations("dashboard.edit");
  const tc = useTranslations("dashboard.common");
  const tl = useTranslations("dashboard.edit.loan");
  const tg = useTranslations("dashboard.edit.goal");
  const { fullModel: model, link } = useDashboard();
  const f = useFormat();
  const { run, busy, error, ready, clear, fail, reload } = useEditRun();
  const formId = useId();
  // The balance the editor opened on; a correction is worked out from it.
  const [openedBalance, setOpenedBalance] = useState(() => account?.balance ?? 0);

  const special = account?.type === "loan" || account?.type === "goal";
  const groupNames = useMemo(() => model.groups.map((group) => group.name), [model.groups]);

  const initial = useMemo<Draft>(() => {
    if (account) {
      return {
        type: account.type === "credit" ? "credit" : "debit",
        name: account.name,
        logoId: account.logoId,
        cardDesign: cardDesignOf(account),
        group: account.group || null,
        currency: account.currency,
        statementDay: account.creditLimitDays?.statementDay != null ? String(account.creditLimitDays.statementDay) : "",
        dueDay: account.creditLimitDays?.dueDay != null ? String(account.creditLimitDays.dueDay) : "",
        dueRule: account.creditLimitDays?.dueDaysAfter != null ? "after" : "day",
        daysAfter: String(account.creditLimitDays?.dueDaysAfter ?? DEFAULT_DAYS_AFTER),
        balance: formatAmountInput(account.balance, f.locale),
        includeInTotals: account.includeInTotals,
      };
    }
    return {
      type: "debit",
      name: "",
      logoId: null,
      cardDesign: null,
      group: presetGroup && groupNames.includes(presetGroup) ? presetGroup : null,
      currency: model.currency,
      statementDay: "25",
      dueDay: "1",
      dueRule: "day",
      daysAfter: String(DEFAULT_DAYS_AFTER),
      balance: "",
      includeInTotals: true,
    };
  }, [account, presetGroup, groupNames, model.currency, f.locale]);

  const [draft, setDraft] = useState<Draft>(initial);
  // The app's alerts before a save: a currency change, then a balance change.
  const [prompt, setPrompt] = useState<{ kind: "currency" } | { kind: "balance"; delta: number } | null>(null);
  const set = (patch: Partial<Draft>) => {
    clear();
    setPrompt(null);
    setDraft((current) => ({ ...current, ...patch }));
  };
  const [touched, setTouched] = useState(false);
  const [logoPicker, setLogoPicker] = useState(false);
  const [designPicker, setDesignPicker] = useState(false);
  // A loan's or a goal's own editor, opened from the note below.
  const [ownEditor, setOwnEditor] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const credit = draft.type === "credit";
  const name = draft.name.trim();
  const balance = draft.balance.trim() ? evaluateAmount(draft.balance, f.locale) : account ? null : 0;
  const statementDay = readDay(draft.statementDay);
  const dueDay = readDay(draft.dueDay);
  // Only a phone that takes the days-after rule is offered it: an older app
  // refuses an edit with a field it does not know.
  const offersDaysAfter = link.creditDueDaysAfter;
  const after = offersDaysAfter && draft.dueRule === "after";
  const daysAfter = readDaysAfter(draft.daysAfter);
  const currencyChanged = Boolean(account && !special && draft.currency !== account.currency);
  const balanceChanged = Boolean(account && !special && balance !== null && Math.abs(balance - openedBalance) > 0.000001);
  const currencies = model.currencies.includes(draft.currency) ? model.currencies : [draft.currency, ...model.currencies];

  const missing = {
    name: !name,
    balance: !special && (balance === null || Math.abs(balance) > MAX_AMOUNT),
    // Days after a statement need a statement day to count from (the app's
    // `dueDaysAfterNeedsStatement` in its account editor).
    statementDay: credit && !special && (Number.isNaN(statementDay) || (after && statementDay === null)),
    dueDay: credit && !special && !after && Number.isNaN(dueDay),
    daysAfter: credit && !special && after && Number.isNaN(daysAfter),
  };
  const invalid = Object.values(missing).some(Boolean);

  /** The fields as the phone takes them; on edit, only what changed. */
  const fields = (record?: "difference" | "flow"): AccountFields => {
    if (!account) {
      const out: AccountFields = {
        name,
        type: draft.type,
        group: draft.group,
        logoId: draft.logoId,
        cardDesign: draft.cardDesign,
        currency: draft.currency,
        balance: balance ?? 0,
        includeInTotals: draft.includeInTotals,
      };
      if (credit) {
        out.creditStatementDay = statementDay ?? 25;
        // A days-after card's day of the month is worked out by the phone.
        if (after) out.creditDueDaysAfterStatement = daysAfter;
        else out.creditDueDay = dueDay ?? 1;
      }
      return out;
    }
    const out: AccountFields = {};
    if (name !== account.name) out.name = name;
    if ((draft.group ?? null) !== (account.group || null)) out.group = draft.group;
    if ((draft.logoId ?? null) !== (account.logoId ?? null)) out.logoId = draft.logoId;
    if (draft.cardDesign !== cardDesignOf(account)) out.cardDesign = draft.cardDesign;
    if (draft.includeInTotals !== account.includeInTotals) out.includeInTotals = draft.includeInTotals;
    if (special) return out;
    if (credit) {
      if (statementDay !== (account.creditLimitDays?.statementDay ?? null)) out.creditStatementDay = Number.isNaN(statementDay) ? null : statementDay;
      const wasAfter = account.creditLimitDays?.dueDaysAfter ?? null;
      if (after) {
        if (daysAfter !== wasAfter) out.creditDueDaysAfterStatement = daysAfter;
      } else {
        // Back to a fixed day: the one the field shows, which the phone kept near the old rule's.
        if (offersDaysAfter && wasAfter != null) out.creditDueDaysAfterStatement = null;
        if (dueDay !== (account.creditLimitDays?.dueDay ?? null)) out.creditDueDay = Number.isNaN(dueDay) ? null : dueDay;
      }
    }
    // A currency change converts the balance on the phone; a balance is not set with it.
    if (currencyChanged) out.currency = draft.currency;
    else if (balanceChanged && balance !== null && record) {
      out.balance = balance;
      out.balanceRecord = record;
    }
    return out;
  };

  const send = async (record?: "difference" | "flow") => {
    if (!ready || busy) return;
    const set_ = fields(record);
    if (account && !Object.keys(set_).length) {
      onClose();
      return;
    }
    const ok = account
      ? await run([{ entity: "account", op: "update", id: account.id, at: account.raw.updated_at ?? null, set: set_ }], "account_update")
      : await run([{ entity: "account", op: "create", account: set_ }], "account_create");
    if (ok) onClose();
    else setPrompt(null);
  };

  const save = () => {
    setTouched(true);
    if (invalid || !ready || busy) return;
    if (account && currencyChanged) {
      setPrompt({ kind: "currency" });
      return;
    }
    if (account && balanceChanged && balance !== null) {
      // The phone records the difference from its balance now: if an entry
      // moved it since the editor opened, start the balance over from it.
      const live = movedBalance(model, account, openedBalance);
      if (live !== null) {
        setOpenedBalance(live);
        setDraft((current) => ({ ...current, balance: formatAmountInput(live, f.locale) }));
        fail("conflict");
        return;
      }
      setPrompt({ kind: "balance", delta: balance - openedBalance });
      return;
    }
    void send();
  };

  const remove = async () => {
    if (!account || !ready || busy) return;
    if (await run([{ entity: "account", op: "delete", id: account.id, at: account.raw.updated_at ?? null }], "account_delete")) onClose();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save();
  };

  // As in the app, the balance shown follows the currency, converted at the latest rate.
  const changeCurrency = (next: string) => {
    if (next === draft.currency) return;
    if (account && next === account.currency) {
      set({ currency: next, balance: initial.balance });
      return;
    }
    const from = account ? openedBalance : balance;
    const converted = from ? convertAmount(model, from, account ? account.currency : draft.currency, next) : null;
    set({ currency: next, balance: converted !== null ? formatAmountInput(Math.round(converted * 100) / 100, f.locale) : draft.balance });
  };

  // On a liability a rising balance is more debt, so it records as spending.
  const flowIsIncome = prompt?.kind === "balance" ? (account?.liability ? prompt.delta < 0 : prompt.delta >= 0) : true;
  const logoLabel = logoName(draft.logoId);
  const design = draft.cardDesign ? DESIGN_BY_ID.get(draft.cardDesign) : undefined;
  const designLabel = !draft.cardDesign ? t("cardDesignPlain") : design ? t(`genre_${design.genre}`) : draft.cardDesign.startsWith("custom:") ? t("cardDesignUploads") : t("cardDesignPlain");
  const typeLabel = (type: string) => (type === "debit" ? t("typeDebit") : type === "credit" ? t("typeCredit") : tc.has(`accountTypes.${type}`) ? tc(`accountTypes.${type}`) : type);

  if (ownEditor && account?.type === "loan") return <LoanEditor account={account} onClose={onClose} />;
  if (ownEditor && account?.type === "goal") return <GoalEditor account={account} onClose={onClose} />;

  return (
    <Sheet
      busy={busy}
      onClose={onClose}
      title={account ? t("editAccount") : t("newAccount")}
      headerAction={account ? <DeleteButton label={t("deleteAccount")} onClick={() => setConfirmDelete(true)} disabled={busy} /> : null}
      footer={
        <div className="flex flex-wrap gap-2">
          <CancelButton onClick={onClose} disabled={busy} />
          <SaveButton label={t("save")} busy={busy} disabled={!ready || Boolean(prompt)} form={formId} />
        </div>
      }
    >
      <form id={formId} onSubmit={submit} className="space-y-4">
        {confirmDelete ? (
          <Confirm
            title={t("deleteAccount")}
            body={t("deleteAccountBody")}
            actions={[
              { label: te("cancel"), onClick: () => setConfirmDelete(false) },
              { label: te("delete"), tone: "danger", onClick: () => void remove(), disabled: !ready || busy },
            ]}
          />
        ) : null}

        <Field label={t("type")}>
          {account ? (
            <Pills value={account.type} onChange={() => undefined} label={t("type")} options={[{ value: account.type, label: typeLabel(account.type), icon: <TypeIcon type={account.type} /> }]} />
          ) : (
            <Pills<AccountType>
              value={draft.type}
              onChange={(type) => set({ type })}
              label={t("type")}
              options={[
                { value: "debit", label: t("typeDebit"), icon: <TypeIcon type="debit" /> },
                { value: "credit", label: t("typeCredit"), icon: <TypeIcon type="credit" /> },
              ]}
            />
          )}
        </Field>

        {special ? (
          <p role="note" className="rounded-2xl bg-background-subtle px-3.5 py-2.5 text-[12.5px] leading-snug text-foreground-soft">
            {t("specialNote")}
            <button type="button" onClick={() => setOwnEditor(true)} disabled={busy} className="mt-2 flex h-9 items-center rounded-full border border-border bg-card px-3.5 text-[13px] font-bold text-foreground hover:bg-background-subtle disabled:opacity-50">
              {account?.type === "loan" ? tl("editInLoans") : tg("editInGoals")}
            </button>
          </p>
        ) : null}

        <Field label={t("name")} error={touched && missing.name ? te("required") : null}>
          <input
            data-autofocus
            value={draft.name}
            maxLength={MAX_NAME}
            placeholder={t("namePlaceholder")}
            aria-invalid={touched && missing.name}
            onChange={(event) => set({ name: event.target.value })}
            className={`${INPUT} ${touched && missing.name ? "border-error/60" : ""}`}
          />
        </Field>

        <Field label={t("logo")}>
          <div className="flex min-h-12 w-full items-center gap-3 rounded-2xl border border-border bg-background-subtle/60 px-4 py-2.5">
            <button type="button" onClick={() => setLogoPicker(true)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={t("logo")}>
              {draft.logoId ? <AccountLogo logoId={draft.logoId} name={name || "?"} size={36} /> : <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[28%] bg-card"><ClayImg name="ui/plus" size={18} /></span>}
              <span className={`min-w-0 flex-1 truncate text-[14.5px] ${draft.logoId ? "font-bold text-foreground" : "text-foreground-muted"}`}>{draft.logoId ? (logoLabel ?? t("logo")) : t("logoAdd")}</span>
            </button>
            {draft.logoId ? (
              <button
                type="button"
                onClick={() => set({ logoId: null })}
                aria-label={t("logoClear")}
                title={t("logoClear")}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-background-subtle text-foreground-muted hover:text-foreground"
              >
                <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            ) : (
              <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true" className="shrink-0 text-foreground-muted">
                <path d="m9 6 6 6-6 6" />
              </svg>
            )}
          </div>
        </Field>

        <Field label={t("cardDesign")}>
          <div className="flex min-h-12 w-full items-center gap-3 rounded-2xl border border-border bg-background-subtle/60 px-4 py-2.5">
            <button type="button" onClick={() => setDesignPicker(true)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={t("cardDesign")}>
              <CardThumb id={draft.cardDesign} width={56} />
              <span className={`min-w-0 flex-1 truncate text-[14.5px] ${draft.cardDesign ? "font-bold text-foreground" : "text-foreground-muted"}`}>{designLabel}</span>
            </button>
            {draft.cardDesign ? (
              <button
                type="button"
                onClick={() => set({ cardDesign: null })}
                aria-label={t("cardDesignClear")}
                title={t("cardDesignClear")}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-background-subtle text-foreground-muted hover:text-foreground"
              >
                <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            ) : (
              <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true" className="shrink-0 text-foreground-muted">
                <path d="m9 6 6 6-6 6" />
              </svg>
            )}
          </div>
        </Field>

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

        {!special ? (
          <Field label={t("currency")}>
            <Select value={draft.currency} onChange={(event) => changeCurrency(event.target.value)} className="w-full">
              {currencies.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        {credit && !special && offersDaysAfter ? (
          <Field label={t("dueRule")}>
            <Pills
              label={t("dueRule")}
              value={draft.dueRule}
              onChange={(dueRule) => set({ dueRule })}
              options={[
                { value: "day", label: t("dueRuleDay") },
                { value: "after", label: t("dueRuleAfter") },
              ]}
            />
          </Field>
        ) : null}

        {credit && !special ? (
          <div className="grid grid-cols-2 gap-2">
            <Field label={t("statementDay")} error={touched && missing.statementDay ? t("dayRange") : null}>
              <input inputMode="numeric" value={draft.statementDay} placeholder="25" onChange={(event) => set({ statementDay: event.target.value })} className={INPUT} />
            </Field>
            {after ? (
              <Field label={t("dueRuleAfter")} error={touched && missing.daysAfter ? t("daysAfterRange", { max: MAX_DAYS_AFTER }) : null}>
                <input inputMode="numeric" value={draft.daysAfter} placeholder={String(DEFAULT_DAYS_AFTER)} onChange={(event) => set({ daysAfter: event.target.value })} className={INPUT} />
              </Field>
            ) : (
              <Field label={t("dueDay")} error={touched && missing.dueDay ? t("dayRange") : null}>
                <input inputMode="numeric" value={draft.dueDay} placeholder="1" onChange={(event) => set({ dueDay: event.target.value })} className={INPUT} />
              </Field>
            )}
          </div>
        ) : null}

        {!special ? (
          <Field label={account ? t("currentBalance") : t("startingBalance")} error={touched && missing.balance ? te("required") : null}>
            <span className={`flex h-12 items-center gap-2 rounded-2xl border bg-background-subtle/60 px-4 focus-within:border-primary focus-within:bg-card ${touched && missing.balance ? "border-error/60" : "border-border"}`}>
              <span className="shrink-0 text-[14.5px] font-bold text-foreground-muted">{draft.currency === model.currency ? model.symbol : draft.currency}</span>
              <input
                inputMode="decimal"
                autoComplete="off"
                value={draft.balance}
                placeholder="0"
                disabled={currencyChanged}
                onChange={(event) => set({ balance: event.target.value })}
                onBlur={() => {
                  const settled = settledAmount(draft.balance, f.locale);
                  if (settled !== null) set({ balance: settled });
                }}
                className="tabular h-full min-w-0 flex-1 bg-transparent text-[14.5px] text-foreground outline-none placeholder:text-foreground-muted disabled:text-foreground-muted"
              />
            </span>
          </Field>
        ) : null}

        <Toggle checked={draft.includeInTotals} onChange={(includeInTotals) => set({ includeInTotals })} label={t("includeInTotals")} hint={t("includeInTotalsHint")} />

        {prompt?.kind === "currency" && account ? (
          <Confirm
            title={t("currencyChangeTitle")}
            body={t("currencyChangeMessage", { from: account.currency, to: draft.currency })}
            actions={[
              { label: te("cancel"), onClick: () => setPrompt(null) },
              { label: t("currencyChangeAction"), tone: "danger", onClick: () => void send(), disabled: !ready || busy },
            ]}
          />
        ) : null}
        {prompt?.kind === "balance" && account ? (
          <Confirm
            title={t("balancePromptTitle")}
            body={t("balancePromptMessage", { amount: f.foreign(Math.abs(prompt.delta), account.currency) })}
            actions={[
              { label: te("cancel"), onClick: () => setPrompt(null) },
              { label: t("recordDifference"), tone: "plain", onClick: () => void send("difference"), disabled: !ready || busy },
              { label: flowIsIncome ? t("recordIncome") : t("recordExpense"), tone: "primary", onClick: () => void send("flow"), disabled: !ready || busy },
            ]}
          />
        ) : null}

        <EditError message={error} onReload={reload} />
        <EditBlocked />
      </form>

      {logoPicker ? <AccountLogoPickerSheet value={draft.logoId} onChange={(logoId) => set({ logoId })} onClose={() => setLogoPicker(false)} /> : null}
      {designPicker ? <CardDesignPickerSheet value={draft.cardDesign} onChange={(cardDesign) => set({ cardDesign })} onClose={() => setDesignPicker(false)} /> : null}
    </Sheet>
  );
}

function TypeIcon({ type }: { type: string }) {
  const icon = type === "credit" ? "money-time/card" : type === "debit" ? "money-time/bank" : null;
  return icon ? <ClayImg name={icon} size={16} /> : null;
}

// --------------------------------------------------------------- logo picker --

const ACCOUNT_CATALOG = logoCatalog(ACCOUNT_LOGOS, ACCOUNT_LOGO_NAMES);
const DEFAULT_COUNTRY = "united-states";

/** The app's logo library: browse by country, or search every bank and wallet. */
export function AccountLogoPickerSheet({ value, onChange, onClose }: { value: string | null; onChange: (logoId: string | null) => void; onClose: () => void }) {
  const t = useTranslations("dashboard.edit.account");
  const tr = useTranslations("dashboard.edit.rule");
  const f = useFormat();
  const countries = useMemo(() => logoCountries(ACCOUNT_CATALOG, ACCOUNT_LOGO_COUNTRIES, f.locale, tr("global")), [f.locale, tr]);
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState(() => {
    const slugs = countries.map((item) => item.slug);
    const current = value?.split("/")[0];
    return current && slugs.includes(current) ? current : browserCountry(slugs, DEFAULT_COUNTRY);
  });
  const logos = useMemo(
    () =>
      query.trim()
        ? searchLogos(ACCOUNT_CATALOG, query, ACCOUNT_LOGO_COUNTRIES)
        : ACCOUNT_CATALOG.filter((entry) => entry.country === country).sort((a, b) => a.name.localeCompare(b.name, f.locale)),
    [query, country, f.locale],
  );
  const pick = (logoId: string | null) => {
    onChange(logoId);
    onClose();
  };

  return (
    <Sheet
      wide
      title={t("logoChooseTitle")}
      onClose={onClose}
      headerAction={
        value ? (
          <button type="button" onClick={() => pick(null)} className="rounded-full px-3 py-1.5 text-[12.5px] font-bold text-foreground-soft hover:bg-background-subtle">
            {t("logoClear")}
          </button>
        ) : null
      }
    >
      <p className="-mt-2 mb-3 text-[13px] text-foreground-soft">{t("logoChooseSubtitle")}</p>
      <div className="mb-4 flex flex-wrap gap-2">
        <label className="flex h-11 min-w-[200px] flex-1 items-center gap-2 rounded-2xl border border-border bg-background-subtle/60 px-3.5 focus-within:border-primary focus-within:bg-card">
          <ClayImg name="ui/search" size={18} />
          <span className="sr-only">{t("logoSearch")}</span>
          <input
            data-autofocus
            type="search"
            value={query}
            placeholder={t("logoSearch")}
            onChange={(event) => setQuery(event.target.value)}
            className="min-w-0 flex-1 bg-transparent text-[14px] text-foreground outline-none placeholder:text-foreground-muted"
          />
        </label>
        <Select aria-label={t("logoCountry")} value={country} disabled={Boolean(query.trim())} onChange={(event) => setCountry(event.target.value)} className="w-[200px]">
          {countries.map((item) => (
            <option key={item.slug} value={item.slug}>
              {item.label}
            </option>
          ))}
        </Select>
      </div>
      {logos.length ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {logos.map(({ id, name }) => {
            const active = id === value;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={active}
                title={name}
                onClick={() => pick(id)}
                className={`flex min-w-0 flex-col items-center gap-1.5 rounded-2xl border px-2 py-3 text-center transition-colors ${
                  active ? "border-primary/30 bg-primary/15" : "border-transparent bg-background-subtle/70 hover:bg-background-subtle"
                }`}
              >
                <AccountLogo logoId={id} name={name} size={40} />
                <span className={`line-clamp-2 w-full text-[12px] font-bold leading-tight ${active ? "text-primary-dark" : "text-foreground"}`}>{name}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="py-6 text-center text-[13px] text-foreground-muted">{t("logoNoResults")}</p>
      )}
    </Sheet>
  );
}

// -------------------------------------------------------------------- groups --

/**
 * Creates, renames or deletes an account group, as the app's group sheet.
 * After a conflict it can start over on the phone's newer copy.
 */
export function GroupEditor({ group, onClose }: { group: AccountGroup | null; onClose: () => void }) {
  const { fullModel: model } = useDashboard();
  return (
    <Reloadable row={group} fresh={(row) => (row ? model.groups.find((item) => item.id === row.id) : null)} at={(row) => row?.updatedAt}>
      {(row) => <GroupForm group={row} onClose={onClose} />}
    </Reloadable>
  );
}

function GroupForm({ group, onClose }: { group: AccountGroup | null; onClose: () => void }) {
  const t = useTranslations("dashboard.edit.account");
  const te = useTranslations("dashboard.edit");
  const { fullModel: model } = useDashboard();
  const { run, busy, error, ready, clear, reload } = useEditRun();
  const formId = useId();
  const [name, setName] = useState(group?.name ?? "");
  const [touched, setTouched] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const clean = name.trim();
  // The phone compares names ignoring case.
  const taken = model.groups.some((item) => item.name.toLowerCase() === clean.toLowerCase() && item.id !== group?.id);
  const problem = !clean ? te("required") : taken ? t("groupTaken") : null;

  const save = async () => {
    setTouched(true);
    if (problem || !ready || busy) return;
    if (group && clean === group.name) {
      onClose();
      return;
    }
    const ok = group ? await run([{ entity: "group", op: "update", id: group.id, name: clean, at: group.updatedAt }], "group_update") : await run([{ entity: "group", op: "create", name: clean }], "group_create");
    if (ok) onClose();
  };

  const remove = async () => {
    if (!group || !ready || busy) return;
    if (await run([{ entity: "group", op: "delete", id: group.id, at: group.updatedAt }], "group_delete")) onClose();
  };

  return (
    <Sheet
      busy={busy}
      onClose={onClose}
      title={group ? t("editGroup") : t("createGroup")}
      headerAction={group ? <DeleteButton label={t("deleteGroup")} onClick={() => setConfirmDelete(true)} disabled={busy} /> : null}
      footer={
        <div className="flex flex-wrap gap-2">
          <CancelButton onClick={onClose} disabled={busy} />
          <SaveButton label={t("save")} busy={busy} disabled={!ready} form={formId} />
        </div>
      }
    >
      <form
        id={formId}
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
        className="space-y-4"
      >
        {confirmDelete ? (
          <Confirm
            title={t("deleteGroup")}
            body={t("deleteGroupBody")}
            actions={[
              { label: te("cancel"), onClick: () => setConfirmDelete(false) },
              { label: te("delete"), tone: "danger", onClick: () => void remove(), disabled: !ready || busy },
            ]}
          />
        ) : null}
        <Field label={t("groupName")} error={touched ? problem : null}>
          <input
            data-autofocus
            value={name}
            maxLength={MAX_NAME}
            placeholder={t("groupPlaceholder")}
            aria-invalid={touched && Boolean(problem)}
            onChange={(event) => {
              clear();
              setName(event.target.value);
            }}
            className={`${INPUT} ${touched && problem ? "border-error/60" : ""}`}
          />
        </Field>
        <EditError message={error} onReload={reload} />
        <EditBlocked />
      </form>
    </Sheet>
  );
}

// -------------------------------------------------------------- card designs --

/** A card's artwork at a given width, or the plain card. */
function CardThumb({ id, width }: { id: string | null; width: number }) {
  const design = id ? DESIGN_BY_ID.get(id) : undefined;
  const height = Math.round(width / 1.6);
  return design ? (
    // eslint-disable-next-line @next/next/no-img-element -- small static artwork
    <img src={`/dashboard-assets/card-designs/${design.id}.webp`} alt="" width={width} height={height} draggable={false} className="shrink-0 rounded-[6px] object-cover" style={{ width, height }} />
  ) : (
    <span aria-hidden="true" className="block shrink-0 rounded-[6px] border border-primary/30 bg-gradient-to-br from-primary/35 to-primary/10" style={{ width, height }} />
  );
}

/** The app's card design library: the plain card, then every built-in design by genre. */
function CardDesignPickerSheet({ value, onChange, onClose }: { value: string | null; onChange: (id: string | null) => void; onClose: () => void }) {
  const t = useTranslations("dashboard.edit.account");
  const [genre, setGenre] = useState<string>("all");
  const designs = genre === "all" ? CARD_DESIGNS : CARD_DESIGNS.filter((design) => design.genre === genre);
  const pick = (id: string | null) => {
    onChange(id);
    onClose();
  };
  const tile = (active: boolean) =>
    `flex min-w-0 flex-col items-center gap-1.5 rounded-2xl border p-2 text-center transition-colors ${active ? "border-primary/40 bg-primary/15" : "border-transparent bg-background-subtle/70 hover:bg-background-subtle"}`;
  return (
    <Sheet
      wide
      title={t("cardDesignTitle")}
      onClose={onClose}
      headerAction={
        value ? (
          <button type="button" onClick={() => pick(null)} className="rounded-full px-3 py-1.5 text-[12.5px] font-bold text-foreground-soft hover:bg-background-subtle">
            {t("cardDesignClear")}
          </button>
        ) : null
      }
    >
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {["all", ...CARD_DESIGN_GENRES].map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={genre === item}
            onClick={() => setGenre(item)}
            className={`shrink-0 rounded-full border px-3.5 py-2 text-[13px] font-bold transition-colors ${
              genre === item ? "border-primary/50 bg-primary/15 text-primary-dark" : "border-border bg-card text-foreground-soft hover:text-foreground"
            }`}
          >
            {item === "all" ? t("cardDesignAll") : t(`genre_${item}`)}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {genre === "all" ? (
          <button type="button" aria-pressed={!value} onClick={() => pick(null)} className={tile(!value)}>
            <CardThumb id={null} width={140} />
            <span className="text-[12px] font-bold text-foreground">{t("cardDesignPlain")}</span>
          </button>
        ) : null}
        {designs.map((design, index) => {
          const active = design.id === value;
          const number = designs.slice(0, index + 1).filter((item) => item.genre === design.genre).length;
          const label = t("cardDesignTemplate", { genre: t(`genre_${design.genre}`), number });
          return (
            <button key={design.id} type="button" aria-pressed={active} aria-label={label} title={label} onClick={() => pick(design.id)} className={tile(active)}>
              <CardThumb id={design.id} width={140} />
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------------ payments --

/** What a credit card's last statement still bills, in the card's currency, as the app reckons it. */
function creditPayable(account: Account, txs: { type: string; date: Date; accountId: string | null; fromAccountId: string | null; toAccountId: string | null; originalAmount: number; currency: string; toAmount: number | null }[], convert: (amount: number, from: string) => number): number {
  const statementDay = account.creditLimitDays?.statementDay;
  const balance = Math.max(0, account.balance);
  if (!statementDay) return 0;
  const now = phoneNow();
  const clamp = (year: number, month: number) => new Date(year, month, Math.min(statementDay, new Date(year, month + 1, 0).getDate()));
  const thisMonth = clamp(now.getFullYear(), now.getMonth());
  const cycleStart = thisMonth.getTime() <= now.getTime() ? thisMonth : clamp(now.getFullYear(), now.getMonth() - 1);
  let delta = 0;
  for (const tx of txs) {
    if (tx.date < cycleStart) continue;
    // Payments settle the statement first.
    if (tx.type === "transfer" && tx.toAccountId === account.id) continue;
    const own = convert(Math.abs(tx.originalAmount), tx.currency);
    if (tx.type === "expense" && tx.accountId === account.id) delta += own;
    else if (tx.type === "income" && tx.accountId === account.id) delta -= own;
    else if (tx.type === "transfer" && tx.fromAccountId === account.id) delta += Math.abs(tx.originalAmount);
    else if (tx.type === "balance_adjustment" && tx.accountId === account.id) delta += convert(tx.originalAmount, tx.currency);
  }
  const outstanding = Math.min(Math.max(0, delta), balance);
  return Math.max(0, balance - outstanding);
}

/**
 * The app's "Pay credit card" and loan "Make a payment" sheet: a transfer from
 * an everyday account into the liability, reported as the loan's own
 * repayments are.
 */
export function PaySheet({ account, onClose }: { account: Account; onClose: () => void }) {
  const t = useTranslations("dashboard.edit.account");
  const te = useTranslations("dashboard.edit");
  const { fullModel: model } = useDashboard();
  const f = useFormat();
  const { run, busy, error, ready, clear } = useEditRun();
  const formId = useId();
  const isLoan = account.type === "loan";

  // Never from another debt, a goal, or anything archived.
  const fromOk = (other: Account) => other.id !== account.id && !other.liability && other.type !== "goal" && !other.goal?.archived && !other.loan?.archived;
  const payable = useMemo(() => {
    if (isLoan) {
      const remaining = Math.max(0, account.balance);
      const monthly = account.loan?.monthlyPayment ?? 0;
      return monthly > 0 ? Math.min(monthly, remaining) : remaining;
    }
    return creditPayable(
      account,
      model.txs,
      (amount, from) => convertAmount(model, amount, from, account.currency) ?? amount,
    );
  }, [account, isLoan, model]);
  // The account it was last paid from, as the app remembers it.
  const lastFrom = useMemo(() => {
    // The model's entries run newest first.
    const last = model.txs.find((tx) => tx.type === "transfer" && tx.toAccountId === account.id && tx.fromAccountId);
    const from = last?.fromAccountId ? model.accountById.get(last.fromAccountId) : undefined;
    return from && fromOk(from) ? from.id : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, account.id]);

  const suggest = (fromId: string | null) => {
    const from = fromId ? model.accountById.get(fromId) : null;
    if (payable <= 0) return "";
    const value = from && from.currency !== account.currency ? convertAmount(model, payable, account.currency, from.currency) : payable;
    return value !== null ? formatAmountInput(Math.round(value * 100) / 100, f.locale) : "";
  };
  const firstFrom = lastFrom ?? model.accounts.find(fromOk)?.id ?? null;
  const [fromId, setFromId] = useState<string | null>(firstFrom);
  const [amount, setAmount] = useState(() => suggest(firstFrom));
  const [note, setNote] = useState(() => t("paidNote", { name: account.name }));
  const [picker, setPicker] = useState(false);
  const [touched, setTouched] = useState(false);

  const from = fromId ? (model.accountById.get(fromId) ?? null) : null;
  const value = evaluateAmount(amount, f.locale);
  const fromCurrency = from?.currency ?? account.currency;
  const cross = fromCurrency !== account.currency;
  const invalid = !from || value === null || value <= 0 || value > MAX_AMOUNT;
  const raw = account.raw as { loan_count_as_expense?: number | boolean | null; loan_payment_category_id?: string | null };
  // A hand-recorded repayment is reported exactly like the loan's automatic ones.
  const countsAsExpense = isLoan && Boolean(raw.loan_count_as_expense);

  const save = async () => {
    setTouched(true);
    if (invalid || !ready || busy || !from || value === null) return;
    const ok = await run(
      [
        {
          entity: "transaction",
          op: "create",
          tx: {
            type: "transfer",
            amount: value,
            date: phoneToday(),
            fromAccountId: from.id,
            toAccountId: account.id,
            // Left to the phone to convert at the latest rate, as the app does.
            toAmount: null,
            note: note.trim(),
            countsAsExpense,
            categoryId: countsAsExpense ? (raw.loan_payment_category_id ?? null) : null,
          },
        },
      ],
      "transaction_create",
    );
    if (ok) onClose();
  };

  return (
    <Sheet
      busy={busy}
      onClose={onClose}
      title={isLoan ? t("loanPayTitle") : t("payTitle")}
      footer={
        <div className="flex flex-wrap gap-2">
          <CancelButton onClick={onClose} disabled={busy} />
          <SaveButton label={t("save")} busy={busy} disabled={!ready} form={formId} />
        </div>
      }
    >
      <form
        id={formId}
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
        className="space-y-4"
      >
        <Field label={t("payFrom")} error={touched && !from ? te("required") : null}>
          <button
            type="button"
            onClick={() => setPicker(true)}
            className={`flex min-h-12 w-full items-center gap-3 rounded-2xl border bg-background-subtle/60 px-4 py-2.5 text-left hover:bg-background-subtle ${touched && !from ? "border-error/60" : "border-border"}`}
          >
            {from ? <AccountLogo logoId={from.logoId} name={from.name} size={28} /> : null}
            <span className={`min-w-0 flex-1 truncate text-[14.5px] ${from ? "font-bold text-foreground" : "text-foreground-muted"}`}>{from?.name ?? t("none")}</span>
            <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true" className="shrink-0 text-foreground-muted">
              <path d="m9 6 6 6-6 6" />
            </svg>
          </button>
        </Field>
        <Field label={te("amount")} error={touched && (value === null || value <= 0 || value > MAX_AMOUNT) ? te("required") : null}>
          <span className="flex h-12 items-center gap-2 rounded-2xl border border-border bg-background-subtle/60 px-4 focus-within:border-primary focus-within:bg-card">
            <span className="shrink-0 text-[14.5px] font-bold text-foreground-muted">{fromCurrency === model.currency ? model.symbol : fromCurrency}</span>
            <input
              data-autofocus
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              placeholder={formatAmountInput(0, f.locale)}
              onChange={(event) => {
                clear();
                setAmount(event.target.value);
              }}
              className="tabular h-full min-w-0 flex-1 bg-transparent text-[14.5px] text-foreground outline-none placeholder:text-foreground-muted"
            />
          </span>
        </Field>
        {cross && payable > 0 ? (
          <p className="-mt-2 flex items-center justify-between rounded-2xl border border-border/60 bg-background-subtle/40 px-4 py-2.5 text-[12.5px]">
            <span className="text-foreground-muted">{isLoan ? t("loanDue") : t("payable")}</span>
            <span className="tabular font-bold text-foreground">{f.foreign(payable, account.currency)}</span>
          </p>
        ) : null}
        <Field label={te("note")}>
          <input value={note} maxLength={500} placeholder={t("paymentNotePlaceholder")} onChange={(event) => setNote(event.target.value)} className={INPUT} />
        </Field>
        <EditError message={error} />
        <EditBlocked />
      </form>
      {picker ? (
        <AccountPickerSheet
          value={fromId}
          filter={fromOk}
          title={t("payFrom")}
          onClose={() => setPicker(false)}
          onChange={(id) => {
            clear();
            setFromId(id);
            setAmount(suggest(id));
          }}
        />
      ) : null}
    </Sheet>
  );
}
