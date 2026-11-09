"use client";

/* eslint-disable @next/next/no-img-element -- goal covers are in-memory object URLs */

import { useTranslations } from "next-intl";
import { useId, useMemo, useState, type FormEvent } from "react";

import { dayKeyOf } from "@/lib/backup/dates";
import type { Account, Model } from "@/lib/backup/model";

import { usePaywall } from "../paywall";
import { useDashboard, useFormat } from "../state";
import { CategoryGlyph, ClayImg } from "../ui";
import { CategoryIconPickerSheet } from "./icon-picker";
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
  convertAmount,
  evaluateAmount,
  formatAmountInput,
  isDayKey,
  movedBalance,
  newGoalOrLoanLimit,
  phoneToday,
  transfersInto,
  useEditRun,
} from "./kit";

/*
 * The app's savings goal editor (GoalEditorScreen) on the web, and the
 * archive and delete it offers from the goal's own screen. Saving goes through
 * the phone, which checks the form the way the app's editor does
 * (services/webDashboardEditModules/goal.ts there). A cover photo stays in the
 * app: one the goal has is kept, and none is added from here.
 */

type Cadence = "monthly" | "weekly";
type AutoSave = { amount: number; cadence: Cadence; fromAccountId: string };

type GoalFields = {
  name?: string;
  emoji?: string;
  target?: number;
  currency?: string;
  targetDate?: string | null;
  includeInTotals?: boolean;
  startingBalance?: number;
  autoSave?: AutoSave | null;
  balance?: number;
  balanceRecord?: "difference" | "flow";
};

/** The goal ops the phone's `module:goal` reads. */
type GoalOp =
  | { entity: "module:goal"; op: "create"; goal: GoalFields }
  | { entity: "module:goal"; op: "update"; id: string; at: string | null; set: GoalFields; rule?: { id: string; at: string | null } | null }
  | { entity: "module:goal"; op: "archive"; id: string; at: string | null; archived: boolean }
  | { entity: "module:goal"; op: "delete"; id: string; at: string | null };

type RuleRow = ReturnType<typeof transfersInto>[number];

/** The app's `findGoalAutoSaveRule`: the goal's auto-save, and whether the editor can show it. */
function goalAutoSave(model: Model, account: Account): { rule: RuleRow; inline: boolean } | null {
  const matches = transfersInto(model, account.id);
  const rule = matches[0];
  if (!rule) return null;
  const inline =
    matches.length === 1 &&
    (rule.recurrence_pattern === "monthly" || rule.recurrence_pattern === "weekly") &&
    Math.max(1, rule.recurrence_interval ?? 1) === 1 &&
    rule.to_amount == null &&
    (rule.currency || model.currency) === account.currency;
  return { rule, inline };
}

type Draft = {
  name: string;
  /** Undefined while a new goal's icon is untouched: the phone suggests one from the name. */
  emoji: string | undefined;
  target: string;
  currency: string;
  hasTargetDate: boolean;
  targetDate: string;
  starting: string;
  balance: string;
  includeInTotals: boolean;
  autoSave: boolean;
  autoSaveAmount: string;
  cadence: Cadence;
  sourceId: string | null;
};

/** Today on the phone's clock moved by whole months and days, `YYYY-MM-DD`. */
function shiftToday(months: number, days: number): string {
  const [y, m, d] = phoneToday().split("-").map(Number);
  return dayKeyOf(new Date(y, m - 1 + months, d + days));
}

/** What a goal edit is saved against: the goal and the auto-save rule paying into it. */
function goalAt(model: Model, account: Account | null): string | null {
  if (!account) return null;
  return [account.raw.updated_at ?? "", ...transfersInto(model, account.id).map((rule) => `${rule.id}:${rule.updated_at ?? ""}`)].join("|");
}

/**
 * Creates or edits a savings goal: the app's goal editor on the web. After a
 * conflict it can start over on the phone's newer copy of the goal.
 */
export function GoalEditor({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const { fullModel: model } = useDashboard();
  return (
    <Reloadable row={account} fresh={(row) => (row ? model.accountById.get(row.id) : null)} at={(row) => goalAt(model, row)}>
      {(row) => <GoalForm account={row} onClose={onClose} />}
    </Reloadable>
  );
}

function GoalForm({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const t = useTranslations("dashboard.edit.goal");
  const te = useTranslations("dashboard.edit");
  const { fullModel: model, asset } = useDashboard();
  const f = useFormat();
  const { run, busy, error, ready, clear, fail, reload } = useEditRun();
  const formId = useId();
  const goal = account?.goal ?? null;

  // The auto-save as it was when the editor opened, like the rest of the
  // draft: the rule a save replaces, and the one it names to the phone.
  const [existing] = useState(() => (account ? goalAutoSave(model, account) : null));
  const inlineRule = existing?.inline ? existing.rule : null;
  // The balance the editor opened on; a correction is worked out from it.
  const [openedBalance, setOpenedBalance] = useState(() => account?.balance ?? 0);
  // An archived goal's auto-saves were paused on purpose; one the form cannot show is left to Recurring.
  const showAutoSave = !account || (!goal?.archived && existing?.inline !== false);

  const initial = useMemo<Draft>(
    () => ({
      name: account?.name ?? "",
      emoji: account ? (goal?.emoji ?? "") : undefined,
      target: goal ? formatAmountInput(goal.target, f.locale) : "",
      currency: account?.currency ?? model.currency,
      hasTargetDate: Boolean(goal?.targetDate),
      // Three months out, the app's default deadline for a new goal.
      targetDate: goal?.targetDate ?? shiftToday(3, 0),
      starting: "",
      balance: account ? formatAmountInput(account.balance, f.locale) : "",
      includeInTotals: account?.includeInTotals ?? true,
      autoSave: Boolean(inlineRule),
      autoSaveAmount: inlineRule ? formatAmountInput(inlineRule.amount, f.locale) : "",
      cadence: inlineRule?.recurrence_pattern === "weekly" ? "weekly" : "monthly",
      sourceId: inlineRule?.from_account_id ?? null,
    }),
    [account, goal, inlineRule, model.currency, f.locale],
  );
  const [draft, setDraft] = useState<Draft>(initial);
  const [prompt, setPrompt] = useState<null | "currency" | { delta: number } | "delete">(null);
  const [picker, setPicker] = useState<null | "icon" | "source">(null);
  const [touched, setTouched] = useState(false);
  const set = (patch: Partial<Draft>) => {
    clear();
    if (prompt !== "delete") setPrompt(null);
    setDraft((current) => ({ ...current, ...patch }));
  };

  const name = draft.name.trim();
  const target = evaluateAmount(draft.target, f.locale);
  const starting = draft.starting.trim() ? evaluateAmount(draft.starting, f.locale) : 0;
  const balance = evaluateAmount(draft.balance, f.locale);
  const autoSaveAmount = evaluateAmount(draft.autoSaveAmount, f.locale);
  const sources = useMemo(() => model.accounts.filter((item) => item.type !== "goal" && item.currency === draft.currency), [model.accounts, draft.currency]);
  const source = sources.find((item) => item.id === draft.sourceId) ?? null;
  const currencies = [...new Set([...model.currencies, draft.currency])];
  const currencyChanged = Boolean(account && draft.currency !== account.currency);

  // The phone takes a deadline after today.
  const tomorrow = shiftToday(0, 1);
  const missing = {
    name: !name,
    target: target === null || !(target > 0) || target > MAX_AMOUNT,
    targetDate: draft.hasTargetDate && !(isDayKey(draft.targetDate) && draft.targetDate >= tomorrow),
    starting: !account && (starting === null || Math.abs(starting) > MAX_AMOUNT),
    balance: Boolean(account) && (balance === null || Math.abs(balance) > MAX_AMOUNT),
    autoSaveAmount: showAutoSave && draft.autoSave && !(autoSaveAmount !== null && autoSaveAmount > 0 && autoSaveAmount <= MAX_AMOUNT),
    source: showAutoSave && draft.autoSave && !source,
  };
  const invalid = Object.values(missing).some(Boolean);

  const changeCurrency = (code: string) => {
    if (code === draft.currency) return;
    // Converted in place, as the app does, so what shows by the new code is what is saved.
    const convert = (text: string) => {
      const value = evaluateAmount(text, f.locale);
      const next = value !== null && value > 0 ? convertAmount(model, value, draft.currency, code) : null;
      return next === null ? text : formatAmountInput(Math.round(next * 100) / 100, f.locale);
    };
    set({
      currency: code,
      target: convert(draft.target),
      autoSaveAmount: convert(draft.autoSaveAmount),
      ...(account ? { balance: convert(draft.balance) } : { starting: convert(draft.starting) }),
      // The source shares the goal's currency, so a new one is picked.
      sourceId: null,
    });
  };

  const autoSaveValue = (): AutoSave | null =>
    draft.autoSave && autoSaveAmount !== null && source ? { amount: autoSaveAmount, cadence: draft.cadence, fromAccountId: source.id } : null;

  const send = async (record?: "difference" | "flow") => {
    if (!ready || busy || target === null) return;
    let op: GoalOp;
    if (!account) {
      const fields: GoalFields = {
        name,
        target,
        currency: draft.currency,
        targetDate: draft.hasTargetDate ? draft.targetDate : null,
        includeInTotals: draft.includeInTotals,
        startingBalance: starting ?? 0,
        autoSave: autoSaveValue(),
      };
      if (draft.emoji !== undefined) fields.emoji = draft.emoji;
      op = { entity: "module:goal", op: "create", goal: fields };
    } else {
      const fields: GoalFields = {};
      if (name !== account.name) fields.name = name;
      if ((draft.emoji ?? "") !== (goal?.emoji ?? "")) fields.emoji = draft.emoji ?? "";
      if (target !== goal?.target) fields.target = target;
      const targetDate = draft.hasTargetDate ? draft.targetDate : null;
      if (targetDate !== (goal?.targetDate ?? null)) fields.targetDate = targetDate;
      if (draft.includeInTotals !== account.includeInTotals) fields.includeInTotals = draft.includeInTotals;
      if (currencyChanged) fields.currency = draft.currency;
      else if (record && balance !== null) {
        fields.balance = balance;
        fields.balanceRecord = record;
      }
      let rule: { id: string; at: string | null } | null | undefined;
      if (showAutoSave) {
        const next = autoSaveValue();
        const same =
          (!next && !inlineRule) ||
          (next && inlineRule && next.amount === inlineRule.amount && next.cadence === inlineRule.recurrence_pattern && next.fromAccountId === inlineRule.from_account_id);
        if (!same || currencyChanged) {
          fields.autoSave = next;
          rule = inlineRule ? { id: inlineRule.id, at: inlineRule.updated_at ?? null } : null;
        }
      }
      if (!Object.keys(fields).length) {
        onClose();
        return;
      }
      op = { entity: "module:goal", op: "update", id: account.id, at: account.raw.updated_at ?? null, set: fields, ...(rule !== undefined ? { rule } : {}) };
    }
    const ok = await run([op], account ? "goal_update" : "goal_create");
    if (ok) onClose();
    else setPrompt(null);
  };

  const save = () => {
    setTouched(true);
    if (invalid || !ready || busy) return;
    if (account && currencyChanged) {
      setPrompt("currency");
      return;
    }
    if (account && balance !== null && Math.abs(balance - openedBalance) > 0.000001) {
      // The phone records the difference from its balance now: if an entry
      // moved it since the editor opened, start the balance over from it.
      const live = movedBalance(model, account, openedBalance);
      if (live !== null) {
        setOpenedBalance(live);
        setDraft((current) => ({ ...current, balance: formatAmountInput(live, f.locale) }));
        fail("conflict");
        return;
      }
      setPrompt({ delta: balance - openedBalance });
      return;
    }
    void send();
  };

  const remove = async () => {
    if (!account || !ready || busy) return;
    if (await run([{ entity: "module:goal", op: "delete", id: account.id, at: account.raw.updated_at ?? null }], "goal_delete")) onClose();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save();
  };
  const cover = goal?.coverUri ? asset(goal.coverUri) : null;
  const show = (key: keyof typeof missing) => touched && missing[key];

  return (
    <Sheet
      busy={busy}
      onClose={onClose}
      title={account ? t("editTitle") : t("newGoal")}
      headerAction={account ? <DeleteButton label={te("delete")} onClick={() => setPrompt("delete")} disabled={busy} /> : null}
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
            title={t("deleteTitle")}
            body={t("deleteMessage")}
            actions={[
              { label: te("cancel"), onClick: () => setPrompt(null) },
              { label: te("delete"), tone: "danger", onClick: () => void remove(), disabled: !ready || busy },
            ]}
          />
        ) : null}

        {cover ? (
          <figure className="overflow-hidden rounded-[22px] border border-border">
            <img src={cover} alt="" className="aspect-[2/1] w-full object-cover" />
            <figcaption className="px-3.5 py-2 text-[12px] text-foreground-muted">{t("coverInApp")}</figcaption>
          </figure>
        ) : null}

        {/* Icon and name share a row, as in the app. */}
        <div className="flex items-end gap-3">
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setPicker("icon")}
              aria-label={t("chooseIcon")}
              title={t("chooseIcon")}
              className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-card transition hover:bg-background-subtle"
            >
              {draft.emoji ? <CategoryGlyph icon={draft.emoji} name={name || "?"} size={30} /> : <ClayImg name="status/goal-target" size={28} />}
            </button>
            {draft.emoji ? (
              <button
                type="button"
                onClick={() => set({ emoji: "" })}
                aria-label={t("removeIcon")}
                title={t("removeIcon")}
                className="absolute -right-1.5 -top-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card text-foreground-muted hover:text-foreground"
              >
                <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <Field label={t("name")}>
              <input
                data-autofocus
                value={draft.name}
                maxLength={200}
                placeholder={t("namePlaceholder")}
                aria-invalid={show("name")}
                onChange={(event) => set({ name: event.target.value })}
                className={`h-12 w-full rounded-2xl border bg-background-subtle/60 px-4 text-[14.5px] text-foreground outline-none transition-colors placeholder:text-foreground-muted focus:border-primary focus:bg-card ${show("name") ? "border-error/60" : "border-border"}`}
              />
            </Field>
          </div>
        </div>
        {show("name") ? <p className="-mt-2 px-1 text-[12px] font-semibold text-error">{te("required")}</p> : null}

        <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-3">
          <MoneyField label={t("target")} value={draft.target} onChange={(target) => set({ target })} currency={draft.currency} error={show("target") ? te("required") : null} />
          <Field label={t("currency")}>
            <select
              value={draft.currency}
              onChange={(event) => changeCurrency(event.target.value)}
              className="h-12 w-full rounded-2xl border border-border bg-background-subtle/60 px-3 text-[14.5px] font-bold text-foreground outline-none focus:border-primary"
            >
              {currencies.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {account ? (
          <MoneyField label={t("currentBalance")} value={draft.balance} onChange={(value) => set({ balance: value })} currency={draft.currency} disabled={currencyChanged} error={show("balance") ? te("required") : null} />
        ) : null}

        <Toggle checked={draft.hasTargetDate} onChange={(hasTargetDate) => set({ hasTargetDate })} label={t("targetDate")} hint={t("targetDateHint")} />
        {draft.hasTargetDate ? (
          <Field label={t("targetDate")} error={show("targetDate") ? t("targetDatePast") : null}>
            <input
              type="date"
              value={draft.targetDate}
              min={tomorrow}
              max={DAY_MAX}
              aria-invalid={show("targetDate")}
              onChange={(event) => set({ targetDate: event.target.value })}
              className={`h-12 w-full rounded-2xl border bg-background-subtle/60 px-4 text-[14.5px] text-foreground outline-none focus:border-primary focus:bg-card ${show("targetDate") ? "border-error/60" : "border-border"}`}
            />
          </Field>
        ) : null}

        <Toggle checked={draft.includeInTotals} onChange={(includeInTotals) => set({ includeInTotals })} label={t("includeInTotals")} hint={t("includeInTotalsHint")} />

        {!account ? <MoneyField label={t("startingAmount")} value={draft.starting} onChange={(starting) => set({ starting })} currency={draft.currency} error={show("starting") ? te("required") : null} /> : null}

        {showAutoSave ? (
          <>
            <Toggle checked={draft.autoSave} onChange={(autoSave) => set({ autoSave })} label={t("autoSave")} hint={t("autoSaveHint")} />
            {draft.autoSave ? (
              <div className="space-y-4">
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,170px)] gap-3">
                  <MoneyField label={t("autoSaveAmount")} value={draft.autoSaveAmount} onChange={(autoSaveAmount) => set({ autoSaveAmount })} currency={draft.currency} error={show("autoSaveAmount") ? te("required") : null} />
                  <Field label={t("cadence")}>
                    <div role="radiogroup" aria-label={t("cadence")} className="flex h-12 overflow-hidden rounded-2xl border border-border">
                      {(["monthly", "weekly"] as const).map((cadence) => (
                        <button
                          key={cadence}
                          type="button"
                          role="radio"
                          aria-checked={draft.cadence === cadence}
                          onClick={() => set({ cadence })}
                          className={`flex-1 text-[13px] font-bold ${draft.cadence === cadence ? "bg-primary/15 text-primary-dark" : "bg-background-subtle/60 text-foreground-soft hover:text-foreground"}`}
                        >
                          {cadence === "monthly" ? t("cadenceMonthly") : t("cadenceWeekly")}
                        </button>
                      ))}
                    </div>
                  </Field>
                </div>
                <Field label={t("source")} error={show("source") ? te("required") : null} hint={sources.length ? null : t("noSource", { currency: draft.currency })}>
                  <PickerRow value={source?.name ?? null} placeholder={t("sourcePlaceholder")} onClick={() => setPicker("source")} error={show("source")} />
                </Field>
              </div>
            ) : null}
          </>
        ) : existing && !goal?.archived ? (
          <div className="rounded-2xl border border-border bg-background-subtle/60 px-4 py-3">
            <p className="text-[14px] font-bold text-foreground">{t("autoSave")}</p>
            <p className="mt-0.5 text-[12px] leading-snug text-foreground-muted">{t("autoSaveInRecurring")}</p>
          </div>
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
        {prompt && typeof prompt === "object" && account ? (
          <Confirm
            title={t("balancePromptTitle")}
            body={t("balancePromptMessage", { amount: f.foreign(Math.abs(prompt.delta), account.currency) })}
            actions={[
              { label: te("cancel"), onClick: () => setPrompt(null) },
              { label: t("recordDifference"), tone: "plain", onClick: () => void send("difference"), disabled: !ready || busy },
              { label: prompt.delta > 0 ? t("recordIncome") : t("recordExpense"), tone: "primary", onClick: () => void send("flow"), disabled: !ready || busy },
            ]}
          />
        ) : null}

        <EditError message={error} onReload={reload} />
        <EditBlocked />
      </form>

      {picker === "icon" ? <CategoryIconPickerSheet value={draft.emoji ?? ""} onChange={(emoji) => set({ emoji })} onClose={() => setPicker(null)} /> : null}
      {picker === "source" ? (
        <AccountPickerSheet
          value={draft.sourceId}
          title={t("source")}
          filter={(item) => item.type !== "goal" && item.currency === draft.currency}
          onChange={(sourceId) => set({ sourceId })}
          onClose={() => setPicker(null)}
        />
      ) : null}
    </Sheet>
  );
}

/**
 * A goal card's edit and archive buttons, with the app's archive question
 * (GoalDetailScreen). Restoring one re-runs the free plan's goal limit on the
 * phone.
 */
export function GoalCardActions({ account, onEdit }: { account: Account; onEdit: () => void }) {
  const t = useTranslations("dashboard.edit.goal");
  const te = useTranslations("dashboard.edit");
  const { fullModel: model, link } = useDashboard();
  const paywall = usePaywall();
  const { run, busy, error, ready, clear } = useEditRun();
  const [asking, setAsking] = useState(false);
  const [money, setMoney] = useState<"deposit" | "withdraw" | null>(null);
  const archived = account.goal?.archived ?? false;
  const archive = async (next: boolean) => {
    if (!ready || busy) return;
    clear();
    // Restoring re-enters the active pool, so the free plan's goal limit is
    // checked first, as the app's goal screen does, before the round trip.
    if (!next && !link.pro && newGoalOrLoanLimit(model, "goal")) {
      paywall("goals");
      return;
    }
    if (await run([{ entity: "module:goal", op: "archive", id: account.id, at: account.raw.updated_at ?? null, archived: next }], next ? "goal_archive" : "goal_unarchive")) setAsking(false);
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {/* An archived goal takes no money until it is restored, as in the app. */}
        {!archived
          ? (["deposit", "withdraw"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setMoney(mode)}
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary/15 px-3.5 text-[13px] font-bold text-primary-dark hover:bg-primary/20"
              >
                {mode === "deposit" ? t("deposit") : t("withdraw")}
              </button>
            ))
          : null}
        <button type="button" onClick={onEdit} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-3.5 text-[13px] font-bold text-foreground-soft hover:bg-background-subtle hover:text-foreground">
          <ClayImg name="ui/pencil" size={15} />
          {t("edit")}
        </button>
        <button
          type="button"
          onClick={() => {
            if (archived) void archive(false);
            else {
              clear();
              setAsking(true);
            }
          }}
          disabled={!ready || busy}
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-3.5 text-[13px] font-bold text-foreground-soft hover:bg-background-subtle hover:text-foreground disabled:opacity-50"
        >
          {archived ? t("unarchive") : t("archive")}
        </button>
      </div>
      {asking ? (
        <Confirm
          title={t("archiveTitle")}
          body={account.balance > 0 ? [t("archiveMessage"), t("archiveBalanceHint")] : t("archiveMessage")}
          actions={[
            {
              label: te("cancel"),
              onClick: () => {
                clear();
                setAsking(false);
              },
            },
            { label: t("archiveConfirm"), tone: "danger", onClick: () => void archive(true), disabled: !ready || busy },
          ]}
        />
      ) : null}
      <EditError message={error} />
      {money ? <GoalMoneySheet account={account} mode={money} onClose={() => setMoney(null)} /> : null}
    </div>
  );
}

type MoneyWay = "account" | "outside" | "toAccount" | "spend";

/**
 * The goal screen's Deposit and Withdraw: the app's two-way choice, then the
 * entry it opens the transaction editor with. From or to an account is a
 * transfer; outside money is income into the goal, and spending from it an
 * expense on it. Saved as an ordinary new transaction.
 */
function GoalMoneySheet({ account, mode, onClose }: { account: Account; mode: "deposit" | "withdraw"; onClose: () => void }) {
  const t = useTranslations("dashboard.edit.goal");
  const te = useTranslations("dashboard.edit");
  const { fullModel: model } = useDashboard();
  const f = useFormat();
  const { run, busy, error, ready, clear } = useEditRun();
  const formId = useId();
  const [way, setWay] = useState<MoneyWay | null>(null);
  const [amount, setAmount] = useState("");
  const [other, setOther] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [date, setDate] = useState(phoneToday());
  const [note, setNote] = useState("");
  const [picker, setPicker] = useState<"account" | "category" | null>(null);
  const [touched, setTouched] = useState(false);

  const transfer = way === "account" || way === "toAccount";
  const otherAccount = other ? (model.accountById.get(other) ?? null) : null;
  // A transfer is in its from account's currency; income or spending is in the goal's.
  const currency = transfer && mode === "deposit" ? (otherAccount?.currency ?? account.currency) : account.currency;
  const value = evaluateAmount(amount, f.locale);
  const missing = {
    amount: value === null || !(value > 0) || value > MAX_AMOUNT,
    other: transfer && !otherAccount,
    category: !transfer && !category,
    date: !isDayKey(date),
  };

  const save = async () => {
    setTouched(true);
    if (Object.values(missing).some(Boolean) || !ready || busy || value === null) return;
    const tx = transfer
      ? {
          type: "transfer" as const,
          amount: value,
          date,
          note: note.trim(),
          fromAccountId: mode === "deposit" ? other : account.id,
          toAccountId: mode === "deposit" ? account.id : other,
        }
      : { type: way === "outside" ? ("income" as const) : ("expense" as const), amount: value, currency: account.currency, date, note: note.trim(), accountId: account.id, categoryId: category };
    if (await run([{ entity: "transaction", op: "create", tx }], "transaction_create")) onClose();
  };

  const options: { way: MoneyWay; label: string; hint: string }[] =
    mode === "deposit"
      ? [
          { way: "account", label: t("depositFromAccount"), hint: t("depositFromAccountHint") },
          { way: "outside", label: t("depositOutside"), hint: t("depositOutsideHint") },
        ]
      : [
          { way: "toAccount", label: t("withdrawToAccount"), hint: t("withdrawToAccountHint") },
          { way: "spend", label: t("withdrawSpend"), hint: t("withdrawSpendHint") },
        ];
  const title = mode === "deposit" ? t("deposit") : t("withdraw");

  if (!way) {
    return (
      <Sheet title={title} onClose={onClose}>
        <div className="space-y-2">
          {options.map((option) => (
            <button
              key={option.way}
              type="button"
              onClick={() => setWay(option.way)}
              className="block w-full rounded-2xl border border-border bg-background-subtle/60 px-4 py-3 text-left hover:bg-background-subtle"
            >
              <span className="block text-[14px] font-bold text-foreground">{option.label}</span>
              <span className="mt-0.5 block text-[12px] leading-snug text-foreground-muted">{option.hint}</span>
            </button>
          ))}
        </div>
      </Sheet>
    );
  }

  const show = (key: keyof typeof missing) => touched && missing[key];
  return (
    <Sheet
      busy={busy}
      title={title}
      onClose={onClose}
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
        <p className="text-[13px] font-bold text-foreground-soft">{options.find((option) => option.way === way)?.label}</p>
        <MoneyField
          autoFocus
          label={te("amount")}
          value={amount}
          onChange={(next) => {
            clear();
            setAmount(next);
          }}
          currency={currency}
          error={show("amount") ? te("required") : null}
        />
        {transfer ? (
          <Field label={mode === "deposit" ? te("from") : te("to")} error={show("other") ? te("required") : null}>
            <PickerRow value={otherAccount?.name ?? null} placeholder={te("chooseAccount")} onClick={() => setPicker("account")} error={show("other")} />
          </Field>
        ) : (
          <Field label={te("categoryLabel")} error={show("category") ? te("required") : null}>
            <PickerRow value={categoryLabel(model, category)} placeholder={te("choose")} onClick={() => setPicker("category")} error={show("category")} />
          </Field>
        )}
        <Field label={te("date")} error={show("date") ? te("required") : null}>
          <input type="date" required min={DAY_MIN} max={DAY_MAX} value={date} onChange={(event) => setDate(event.target.value)} className={INPUT} />
        </Field>
        <Field label={te("note")}>
          <input value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} className={INPUT} />
        </Field>
        <EditError message={error} />
        <EditBlocked />
      </form>
      {picker === "account" ? (
        <AccountPickerSheet
          value={other}
          disabledId={account.id}
          onChange={(id) => {
            clear();
            setOther(id);
          }}
          onClose={() => setPicker(null)}
        />
      ) : null}
      {picker === "category" ? (
        <CategoryPickerSheet
          type={way === "outside" ? "income" : "expense"}
          value={category}
          onChange={(id) => {
            clear();
            setCategory(id);
          }}
          onClose={() => setPicker(null)}
        />
      ) : null}
    </Sheet>
  );
}
