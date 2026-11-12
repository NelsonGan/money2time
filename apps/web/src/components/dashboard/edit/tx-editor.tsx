"use client";

import { useTranslations } from "next-intl";
import { useId, useMemo, useState, type FormEvent } from "react";

import type { Account, Model, Tx } from "@/lib/backup/model";
import type { Sentiment, TxFields, TxType } from "@/lib/cloud/edits";

import { usePaywall } from "../paywall";
import { FREE_MAX_UNSETTLED_SPLIT_BILLS } from "../pro-limits";
import { useDashboard, useFormat } from "../state";
import { AccountLogo, ClayImg, Select } from "../ui";
import {
  AccountChip,
  AccountPickerSheet,
  CategoryGrid,
  CategoryPickerSheet,
  CheckRow,
  Confirm,
  DAY_MAX,
  DAY_MIN,
  DeleteButton,
  EditBlocked,
  EditError,
  INPUT,
  MAX_AMOUNT,
  Reloadable,
  SaveButton,
  SentimentButton,
  Sheet,
  categoryLabel,
  currencyAmount,
  evaluateAmount,
  formatAmountInput,
  isDayKey,
  phoneToday,
  useEditRun,
  firstAccount,
  settledAmount,
} from "./kit";
import { ClaimBack } from "./claim-back";
import { SplitBillSheet } from "./split-bill";
import {
  balanceSelf,
  defaultPaybackId,
  distributeEvenly,
  draftRows,
  evenAcrossUnpaid,
  hasFriend,
  newRowKey,
  num,
  rowsForOp,
  payerOf,
  splitsOf,
  unpaidSplitBills,
  unpaidSum,
  type SplitDraftRow,
  type SplitOp,
} from "./split-ops";

type Flow = "expense" | "income";

/** What the editor holds, as the app's editor does; compared field by field on save. */
type Draft = {
  type: TxType;
  amount: string;
  currency: string;
  toAmount: string;
  date: string;
  accountId: string | null;
  fromAccountId: string | null;
  toAccountId: string | null;
  categoryId: string | null;
  note: string;
  details: string;
  sentiment: Sentiment;
  reimbursable: boolean;
  countsAsExpense: boolean;
};

const TYPE_TINT: Record<TxType, string> = {
  expense: "text-error",
  income: "text-success",
  transfer: "text-foreground",
  balance_adjustment: "text-foreground",
};

/** A new entry's account, as the app's editor picks it: Quick Entry's default (even with Quick Entry off), else the first. */
function entryAccount(model: Model): Account | null {
  try {
    const json = (model.raw.settings?.[0] as { quick_entry_prefs_json?: string | null } | undefined)?.quick_entry_prefs_json;
    const id = json ? (JSON.parse(json) as { defaultAccountId?: unknown }).defaultAccountId : null;
    const picked = typeof id === "string" ? model.accountById.get(id) : undefined;
    if (picked) return picked;
  } catch {
    // Unreadable prefs: the app falls back the same way.
  }
  return firstAccount(model.accounts);
}

/**
 * Adds an entry, or edits or deletes one: the app's transaction editor on the
 * web. `tx` null means a new expense, as the app's add button opens. After a
 * conflict it can start over on the phone's newer copy.
 */
export function TxEditor({ tx, onClose }: { tx: Tx | null; onClose: () => void }) {
  const { fullModel: model } = useDashboard();
  return (
    <Reloadable row={tx} fresh={(row) => (row ? model.txById.get(row.id) : null)} at={(row) => row?.updatedAt}>
      {(row) => <TxForm tx={row} onClose={onClose} />}
    </Reloadable>
  );
}

function TxForm({ tx, onClose }: { tx: Tx | null; onClose: () => void }) {
  const t = useTranslations("dashboard.edit");
  const { fullModel: model, link } = useDashboard();
  const f = useFormat();
  const { run, busy, error, ready, clear, reload } = useEditRun();
  const formId = useId();
  const ts = useTranslations("dashboard.edit.split");
  const paywall = usePaywall();

  const initial = useMemo<Draft>(() => {
    if (tx) {
      return {
        type: tx.type,
        amount: formatAmountInput(tx.type === "balance_adjustment" ? tx.originalAmount : Math.abs(tx.originalAmount), f.locale),
        currency: tx.currency,
        toAmount: tx.toAmount != null ? formatAmountInput(tx.toAmount, f.locale) : "",
        date: tx.dayKey,
        accountId: tx.type === "transfer" ? null : tx.accountId,
        fromAccountId: tx.fromAccountId,
        toAccountId: tx.toAccountId,
        categoryId: tx.categoryId,
        note: tx.note,
        details: tx.details,
        sentiment: tx.sentiment,
        reimbursable: tx.reimbursable,
        countsAsExpense: tx.countsAsExpense,
      };
    }
    const account = entryAccount(model);
    return {
      type: "expense",
      amount: "",
      currency: account?.currency ?? model.currency,
      toAmount: "",
      date: phoneToday(),
      accountId: account?.id ?? null,
      fromAccountId: null,
      toAccountId: null,
      categoryId: null,
      note: "",
      details: "",
      sentiment: "neutral",
      reimbursable: false,
      countsAsExpense: false,
    };
  }, [tx, model, f.locale]);

  const [draft, setDraft] = useState<Draft>(initial);
  const set = (patch: Partial<Draft>) => {
    clear();
    setDraft((current) => ({ ...current, ...patch }));
  };
  const [picker, setPicker] = useState<"account" | "from" | "to" | "transferCategory" | null>(null);
  const [options, setOptions] = useState(() => Boolean(tx && (tx.details || tx.reimbursable || tx.countsAsExpense)));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [touched, setTouched] = useState(false);

  // Split Bill, as the app's editor keeps it: the rows saved with the expense,
  // staged here until Save; the sheet opens with `splitSeed`.
  const savedSplits = useMemo(() => (tx ? draftRows(splitsOf(model, tx.id)) : []), [tx, model]);
  // A bill a friend paid is changed in the app: its rows mean something else
  // there, and the phone refuses a split edit of one. It can still be deleted here.
  const friendPayer = useMemo(() => (tx ? payerOf(model, tx.id) : null), [tx, model]);
  const [splitRows, setSplitRows] = useState<SplitDraftRow[]>(savedSplits);
  const [splitEvenly, setSplitEvenly] = useState(!savedSplits.length);
  const [splitSeed, setSplitSeed] = useState<SplitDraftRow[] | null>(null);
  const [splitNote, setSplitNote] = useState<string | null>(null);
  const [splitItemized, setSplitItemized] = useState(false);
  // Shares marked paid in this editor visit, which alone offer Undo, as the
  // app keeps them for as long as its editor is open.
  const [newlyPaid, setNewlyPaid] = useState<ReadonlySet<string>>(() => new Set());

  const { type } = draft;
  const flow = type === "expense" || type === "income";
  // A split bill's amount moves with its rows here; a refund pair's stays put.
  const locked = Boolean(tx?.amountLocked) && !(savedSplits.length > 0 && !tx?.reimbursed);
  const account = draft.accountId ? (model.accountById.get(draft.accountId) ?? null) : null;
  const from = draft.fromAccountId ? (model.accountById.get(draft.fromAccountId) ?? null) : null;
  const to = draft.toAccountId ? (model.accountById.get(draft.toAccountId) ?? null) : null;
  const amount = evaluateAmount(draft.amount, f.locale);
  const amountOk = amount !== null && (type === "balance_adjustment" || amount >= 0) && Math.abs(amount) <= MAX_AMOUNT;
  const entryCurrency = type === "transfer" ? (from?.currency ?? model.currency) : type === "balance_adjustment" ? (account?.currency ?? draft.currency) : draft.currency;
  const symbolOf = (code: string) => (code === model.currency ? model.symbol : code);
  const cross = type === "transfer" && from && to && from.currency !== to.currency;

  // What the app's editor checks before a save.
  const missing = {
    amount: !amountOk,
    account: flow && !account,
    category: flow && !draft.categoryId,
    from: type === "transfer" && !from,
    to: type === "transfer" && !to,
    same: type === "transfer" && !!from && from.id === to?.id,
    date: !isDayKey(draft.date),
  };
  const invalid = Object.values(missing).some(Boolean);

  // Split rows follow the amount, as the app's editor keeps them in step.
  const splitting = type === "expense" && hasFriend(splitRows);
  const syncedRows = (rows: SplitDraftRow[]) => (splitEvenly ? evenAcrossUnpaid(rows, amount ?? 0) : balanceSelf(rows, amount ?? 0));
  const defaultPayback = useMemo(() => defaultPaybackId(model), [model]);

  const openSplit = () => {
    if (friendPayer) return;
    // Starting a split bill is the free plan's limit; managing one never is.
    const startsUnsettled = savedSplits.some((row) => !row.isSelf && !row.paid && num(row.amount) > 0);
    if (!startsUnsettled && !splitRows.length && !link.pro && unpaidSplitBills(model) >= FREE_MAX_UNSETTLED_SPLIT_BILLS) {
      paywall("split_bills");
      return;
    }
    setSplitNote(null);
    // No amount yet: the app's "split before amount", where the rows make the total.
    const itemized = !((amount ?? 0) > 0);
    setSplitItemized(itemized);
    if (splitRows.length) {
      setSplitSeed(itemized ? splitRows : syncedRows(splitRows));
      return;
    }
    setSplitEvenly(!itemized);
    const [mine, theirs] = distributeEvenly(amount ?? 0, 2);
    setSplitSeed([
      { key: newRowKey(), name: "", amount: (mine ?? 0).toFixed(2), isSelf: true, paybackAccountId: null, paid: false, paidAt: null },
      { key: newRowKey(), name: "", amount: (theirs ?? 0).toFixed(2), isSelf: false, paybackAccountId: defaultPayback, paid: false, paidAt: null },
    ]);
  };

  const switchType = (next: TxType) => {
    if (next === type) return;
    const keepCategory = draft.categoryId ? model.categories.get(draft.categoryId)?.type === next : false;
    const base = account ?? from ?? firstAccount(model.accounts);
    set({
      type: next,
      categoryId: keepCategory ? draft.categoryId : null,
      accountId: next === "transfer" ? null : (account?.id ?? from?.id ?? base?.id ?? null),
      fromAccountId: next === "transfer" ? (from?.id ?? account?.id ?? base?.id ?? null) : null,
      toAccountId: next === "transfer" ? draft.toAccountId : null,
      currency: next === "transfer" ? draft.currency : (account ?? from ?? base)?.currency ?? model.currency,
      sentiment: next === "expense" ? draft.sentiment : "neutral",
      reimbursable: next === "expense" ? draft.reimbursable : false,
      countsAsExpense: next === "transfer" ? draft.countsAsExpense : false,
    });
  };

  /** The fields as the phone takes them; on edit, only what differs from the row. */
  const fields = (): TxFields => {
    const out: TxFields = {
      type,
      amount: amount ?? 0,
      date: draft.date,
      note: draft.note.trim(),
      details: draft.details.trim(),
    };
    if (flow) {
      out.accountId = draft.accountId;
      out.categoryId = draft.categoryId;
      out.currency = draft.currency;
      if (type === "expense") {
        out.sentiment = draft.sentiment;
        out.reimbursable = draft.reimbursable;
      }
    } else if (type === "transfer") {
      out.fromAccountId = draft.fromAccountId;
      out.toAccountId = draft.toAccountId;
      out.countsAsExpense = draft.countsAsExpense;
      out.categoryId = draft.countsAsExpense ? draft.categoryId : null;
      const received = cross ? evaluateAmount(draft.toAmount, f.locale) : null;
      // Empty or 0 means "convert at the rate", as the app reads it: never a real 0.
      out.toAmount = received !== null && received > 0 ? received : null;
    }
    if (!tx) return out;
    const before: Record<string, unknown> = {
      type: initial.type,
      amount: evaluateAmount(initial.amount, f.locale),
      date: initial.date,
      note: initial.note,
      details: initial.details,
      accountId: initial.accountId,
      categoryId: initial.categoryId,
      currency: initial.currency,
      sentiment: initial.sentiment,
      reimbursable: initial.reimbursable,
      fromAccountId: initial.fromAccountId,
      toAccountId: initial.toAccountId,
      countsAsExpense: initial.countsAsExpense,
      toAmount: evaluateAmount(initial.toAmount, f.locale),
    };
    const changed: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(out)) {
      if ((value ?? null) !== (before[key] ?? null)) changed[key] = value;
    }
    // A new account carries the currency shown with it (picking one sets its currency).
    if (flow && "accountId" in changed) changed.currency = out.currency;
    // A type change carries everything that type needs.
    return (changed.type ? out : changed) as TxFields;
  };

  const save = async (again: boolean) => {
    if (friendPayer) return;
    setTouched(true);
    if (invalid || !ready || busy) return;
    const tx_ = fields();
    // The app's save route: rows with a friend save through Split Bill, and an
    // expense that had splits and has none left clears them.
    const rows = splitting ? syncedRows(splitRows) : [];
    if (splitting && Math.abs(unpaidSum(rows) - (amount ?? 0)) >= 0.005) {
      // As the app: say what is off and open the split page to fix it.
      const left = (amount ?? 0) - unpaidSum(rows);
      setSplitNote(left < 0 ? ts("negativeSelf") : ts("sumMismatch", { diff: currencyAmount(left, entryCurrency, f.locale) }));
      setSplitItemized(false);
      setSplitSeed(rows);
      return;
    }
    const viaSplits = splitting || (tx !== null && savedSplits.length > 0);
    const rowsChanged = JSON.stringify(rowsForOp(rows, true)) !== JSON.stringify(rowsForOp(savedSplits, true));
    if (tx && !Object.keys(tx_).length && (!viaSplits || !rowsChanged)) {
      onClose();
      return;
    }
    const splitOp: SplitOp | null = !viaSplits
      ? null
      : tx
        ? { entity: "module:split", op: "update", id: tx.id, at: tx.updatedAt, set: tx_, splits: rowsForOp(rows, true) }
        : { entity: "module:split", op: "create", tx: tx_, splits: rowsForOp(rows, false) };
    const ok = splitOp
      ? await run([splitOp], tx ? "split_update" : "split_create")
      : tx
        ? await run([{ entity: "transaction", op: "update", rows: [{ id: tx.id, at: tx.updatedAt }], set: tx_ }], "transaction_update")
        : await run([{ entity: "transaction", op: "create", tx: tx_ }], "transaction_create");
    if (!ok) return;
    if (again) {
      // The app's bulk add: keep the type, account and day; start a new amount.
      setDraft((current) => ({ ...current, amount: "", note: "", details: "", toAmount: "", sentiment: "neutral", reimbursable: false }));
      setSplitRows([]);
      setSplitEvenly(true);
      setSplitNote(null);
      setNewlyPaid(new Set());
      setTouched(false);
    } else {
      onClose();
    }
  };

  const remove = async () => {
    if (!tx || !ready || busy) return;
    if (await run([{ entity: "transaction", op: "delete", rows: [{ id: tx.id, at: tx.updatedAt }] }], "transaction_delete")) onClose();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void save(false);
  };

  const tabs: { value: TxType; label: string }[] =
    type === "balance_adjustment"
      ? [{ value: "balance_adjustment", label: t("adjustment") }]
      : [
          { value: "expense", label: t("expense") },
          { value: "income", label: t("income") },
          { value: "transfer", label: t("transfer") },
        ];
  const base = amount !== null && entryCurrency !== model.currency ? model.toBase(amount, entryCurrency) : null;
  const rate = model.rateForMonth(model.currentMonth);
  const nudgeHours = type === "expense" && amount && entryCurrency === model.currency && rate > 0 ? amount / rate : null;
  const receivedPlaceholder =
    cross && amount !== null && from && to
      ? (() => {
          const inBase = model.toBase(amount, from.currency);
          const unit = model.toBase(1, to.currency);
          return inBase !== null && unit ? formatAmountInput(inBase / unit, f.locale) : "";
        })()
      : "";

  return (
    <Sheet
      wide
      busy={busy}
      onClose={onClose}
      title={
        <span role="tablist" aria-label={t("type")} className="flex items-center gap-4">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={type === tab.value}
              disabled={(locked || tab.value === "balance_adjustment") && tab.value !== type}
              onClick={() => switchType(tab.value)}
              className={`border-b-2 pb-1 text-[15px] font-extrabold transition-colors disabled:opacity-40 ${
                type === tab.value
                  ? `${tab.value === "expense" ? "border-error text-error" : tab.value === "income" ? "border-success text-success" : "border-primary text-primary-dark"}`
                  : "border-transparent text-foreground-muted hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </span>
      }
      headerAction={tx ? <DeleteButton label={t("deleteTransaction")} onClick={() => setConfirmDelete(true)} disabled={busy} /> : null}
      footer={
        <div className="flex flex-wrap gap-2">
          {!tx ? (
            <button
              type="button"
              onClick={() => void save(true)}
              disabled={busy || !ready}
              title={t("addAnother")}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-primary/50 bg-primary/12 px-4 text-[14px] font-extrabold text-primary-dark disabled:opacity-50"
            >
              <ClayImg name="ui/plus" size={16} />
              {t("addAnother")}
            </button>
          ) : null}
          <SaveButton label={tx ? t("update") : t("add")} busy={busy} disabled={!ready || confirmDelete || !!friendPayer} form={formId} />
        </div>
      }
    >
      <form id={formId} onSubmit={submit} className="grid gap-5 md:grid-cols-[1fr_minmax(0,330px)]">
        <div className="min-w-0 space-y-3">
          {confirmDelete ? (
            <Confirm
              title={t("deleteTransaction")}
              body={t("deleteTransactionBody")}
              actions={[
                { label: t("cancel"), onClick: () => setConfirmDelete(false) },
                { label: t("delete"), tone: "danger", onClick: () => void remove(), disabled: !ready || busy },
              ]}
            />
          ) : null}
          {flow ? (
            <>
              <CategoryGrid type={type as Flow} value={draft.categoryId} keep={tx?.categoryId} onChange={(id) => set({ categoryId: id })} />
              {touched && missing.category ? <p className="px-1 text-[12px] font-semibold text-error">{t("required")}</p> : null}
            </>
          ) : type === "transfer" ? (
            <div className="space-y-2">
              <TransferCard label={t("from")} account={from} placeholder={t("chooseAccount")} error={touched && (missing.from || missing.same)} onClick={() => setPicker("from")} disabled={locked} />
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => set({ fromAccountId: draft.toAccountId, toAccountId: draft.fromAccountId, toAmount: "" })}
                  aria-label={t("swapAccounts")}
                  disabled={locked}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-primary/35 bg-primary/10 text-primary-dark disabled:opacity-40"
                >
                  <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" />
                  </svg>
                </button>
              </div>
              <TransferCard label={t("to")} account={to} placeholder={t("chooseAccount")} error={touched && (missing.to || missing.same)} onClick={() => setPicker("to")} disabled={locked} />
              {touched && missing.same ? <p className="px-1 text-[12px] font-semibold text-error">{t("differentAccount")}</p> : null}
            </div>
          ) : (
            <TransferCard label={t("accountLabel")} account={account} placeholder={t("chooseAccount")} onClick={() => undefined} disabled />
          )}
        </div>

        <div className="min-w-0 space-y-3">
          {/* The app's chip row. */}
          <div className="flex flex-wrap items-center gap-2">
            {flow ? <AccountChip account={account} placeholder={t("chooseAccount")} disabled={locked} onClick={() => setPicker("account")} /> : null}
            {type === "expense" ? <SentimentButton value={draft.sentiment} onChange={(sentiment) => set({ sentiment })} /> : null}
            {type === "expense" ? (
              <button
                type="button"
                onClick={openSplit}
                aria-label={ts("title")}
                title={ts("title")}
                className={`relative inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] font-bold transition ${
                  splitting ? "border-primary/30 bg-primary/15 text-primary-dark" : "border-border bg-background-subtle/60 text-foreground-soft hover:bg-background-subtle"
                }`}
              >
                <ClayImg name="insights/split-bill" size={16} />
                {ts("chip")}
                {splitting && splitRows.some((row) => !row.isSelf && !row.paid) ? (
                  <span className="absolute -right-1 -top-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-error px-1 text-[10.5px] font-extrabold text-card">
                    {splitRows.filter((row) => !row.isSelf && !row.paid).length}
                  </span>
                ) : null}
              </button>
            ) : null}
            {type !== "balance_adjustment" ? (
              <button
                type="button"
                onClick={() => setOptions((value) => !value)}
                aria-expanded={options}
                aria-label={t("options")}
                title={t("options")}
                className={`inline-flex h-9 w-9 items-center justify-center rounded-full border transition ${
                  options || draft.details || draft.reimbursable || draft.countsAsExpense ? "border-primary/40 bg-primary/15 text-primary-dark" : "border-border bg-background-subtle/60 text-foreground-soft"
                }`}
              >
                <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true">
                  <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
                  <circle cx="16" cy="7" r="2" />
                  <circle cx="10" cy="17" r="2" />
                </svg>
              </button>
            ) : null}
          </div>
          {touched && missing.account ? <p className="px-1 text-[12px] font-semibold text-error">{t("required")}</p> : null}
          {splitNote && type === "expense" ? <p className="px-1 text-[12px] font-semibold text-error">{splitNote}</p> : null}

          {/* The amount and note card. */}
          <div className={`rounded-2xl border bg-background-subtle/50 px-4 py-3 ${touched && missing.amount ? "border-error/60" : "border-border/60"}`}>
            <div className="flex items-start gap-2">
              <label className="min-w-0 flex-1">
                <span className="sr-only">{t("amount")}</span>
                <span className={`flex items-baseline gap-1 text-[30px] font-extrabold tracking-[-0.02em] ${TYPE_TINT[type]}`}>
                  <span className="shrink-0">{symbolOf(entryCurrency)}</span>
                  <input
                    data-autofocus
                    inputMode="decimal"
                    autoComplete="off"
                    value={draft.amount}
                    disabled={locked}
                    placeholder="0"
                    aria-invalid={touched && missing.amount}
                    // A new amount on a cross-currency transfer converts again: the received field goes back to its placeholder.
                    onChange={(event) => {
                      // A split note was about the amount it was shown for.
                      setSplitNote(null);
                      set(cross ? { amount: event.target.value, toAmount: "" } : { amount: event.target.value });
                    }}
                    onBlur={() => {
                      const settled = settledAmount(draft.amount, f.locale);
                      if (settled !== null) set({ amount: settled });
                    }}
                    className="tabular w-full min-w-0 bg-transparent outline-none placeholder:text-foreground-muted/60 disabled:opacity-70"
                  />
                </span>
              </label>
              {flow && model.currencies.length > 1 ? (
                <Select aria-label={t("currencyLabel")} value={draft.currency} disabled={locked} onChange={(event) => set({ currency: event.target.value })} className="w-[104px] shrink-0">
                  {/* The entry's own currency stays offered even when it is no longer tracked. */}
                  {(model.currencies.includes(draft.currency) ? model.currencies : [draft.currency, ...model.currencies]).map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </Select>
              ) : null}
            </div>
            {base !== null && amount !== null ? <p className="mt-0.5 text-[12.5px] text-foreground-muted">≈ {f.money(base)}</p> : null}
            {nudgeHours ? (
              <p className="mt-0.5 text-[12.5px] text-foreground-soft">
                {t(nudgeHours < 0.25 ? "nudgeSmall" : nudgeHours < 1 ? "nudgePause" : "nudgeLarge", { hours: f.hours(nudgeHours) })}
              </p>
            ) : null}
            {locked ? <p className="mt-1 text-[12px] text-foreground-muted">{t("amountLocked")}</p> : null}
            {friendPayer ? (
              <p className="mt-1 text-[12px] font-semibold text-foreground-soft">{t("friendPaid", { name: friendPayer.person_name?.trim() || ts("someone") })}</p>
            ) : null}
            <label className="mt-2 flex items-center gap-2 border-t border-border/50 pt-2">
              <ClayImg name="ui/checklist" size={16} />
              <span className="sr-only">{t("note")}</span>
              <input value={draft.note} maxLength={500} placeholder={t("optional")} onChange={(event) => set({ note: event.target.value })} className="min-w-0 flex-1 bg-transparent text-[14px] text-foreground outline-none placeholder:text-foreground-muted" />
            </label>
          </div>

          {cross ? (
            <label className="block">
              <span className="mb-1.5 block px-1 text-[12.5px] font-bold text-foreground-soft">
                {t("received")} ({to?.currency})
              </span>
              <input inputMode="decimal" value={draft.toAmount} placeholder={receivedPlaceholder} onChange={(event) => set({ toAmount: event.target.value })} className={INPUT} />
            </label>
          ) : null}

          <label className="block">
            <span className="mb-1.5 block px-1 text-[12.5px] font-bold text-foreground-soft">{t("date")}</span>
            <input
              type="date"
              required
              min={DAY_MIN}
              max={DAY_MAX}
              value={draft.date}
              aria-invalid={touched && missing.date}
              onChange={(event) => set({ date: event.target.value })}
              className={`${INPUT} ${touched && missing.date ? "border-error/60" : ""}`}
            />
          </label>
          {touched && missing.date ? <p className="px-1 text-[12px] font-semibold text-error">{t("required")}</p> : null}

          {options && type !== "balance_adjustment" ? (
            <div className="space-y-2 rounded-2xl border border-border/60 p-3">
              <label className="block">
                <span className="mb-1.5 block px-1 text-[11.5px] font-extrabold uppercase tracking-[0.08em] text-foreground-muted">{t("details")}</span>
                <textarea
                  value={draft.details}
                  maxLength={2000}
                  rows={3}
                  placeholder={t("detailsPlaceholder")}
                  onChange={(event) => set({ details: event.target.value })}
                  className="w-full resize-y rounded-2xl border border-border bg-background-subtle/60 px-4 py-3 text-[14px] text-foreground outline-none focus:border-primary"
                />
              </label>
              {type === "expense" ? (
                <CheckRow
                  checked={draft.reimbursable}
                  disabled={tx?.reimbursed}
                  onChange={(reimbursable) => {
                    // Flagging an expense to claim back is the Pro feature, gated
                    // at the tick as the app's editor does; one already flagged
                    // can always be unticked and ticked again.
                    if (reimbursable && !initial.reimbursable && !link.pro) {
                      paywall("reimbursements");
                      return;
                    }
                    set({ reimbursable });
                  }}
                  label={tx?.reimbursed ? t("reimbursed") : t("reimbursable")}
                  hint={t("reimbursableHint")}
                />
              ) : null}
              {tx && type === "expense" ? (
                <ClaimBack
                  tx={tx}
                  onDone={onClose}
                  hidden={draft.reimbursable !== initial.reimbursable}
                  // Claim and Undo save on their own: other edits must be saved first.
                  blocked={Object.keys(fields()).length > 0 || JSON.stringify(rowsForOp(splitRows, true)) !== JSON.stringify(rowsForOp(savedSplits, true))}
                />
              ) : null}
              {type === "transfer" ? (
                <>
                  <CheckRow
                    checked={draft.countsAsExpense}
                    onChange={(countsAsExpense) => {
                      set({ countsAsExpense });
                      // As in the app, counting it asks which spending it is.
                      if (countsAsExpense && !draft.categoryId) setPicker("transferCategory");
                    }}
                    label={t("countAsExpense")}
                    hint={t("countAsExpenseHint")}
                  />
                  {draft.countsAsExpense ? (
                    <button type="button" onClick={() => setPicker("transferCategory")} className="flex w-full items-center justify-between rounded-2xl bg-background-subtle/70 px-4 py-2.5 text-left text-[14px] font-bold text-foreground">
                      <span className="truncate">{categoryLabel(model, draft.categoryId) ?? t("categoryLabel")}</span>
                      <span aria-hidden="true">›</span>
                    </button>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null}

          <EditError message={error} onReload={reload} />
          <EditBlocked />
        </div>
      </form>

      {picker === "account" ? <AccountPickerSheet value={draft.accountId} onClose={() => setPicker(null)} onChange={(id) => set({ accountId: id, currency: model.accountById.get(id)?.currency ?? draft.currency })} /> : null}
      {picker === "from" ? <AccountPickerSheet value={draft.fromAccountId} disabledId={draft.toAccountId} onClose={() => setPicker(null)} onChange={(id) => set({ fromAccountId: id, toAmount: "" })} /> : null}
      {picker === "to" ? <AccountPickerSheet value={draft.toAccountId} disabledId={draft.fromAccountId} onClose={() => setPicker(null)} onChange={(id) => set({ toAccountId: id, toAmount: "" })} /> : null}
      {splitSeed ? (
        <SplitBillSheet
          total={amount ?? 0}
          currency={entryCurrency}
          rows={splitSeed}
          evenly={splitEvenly}
          // A claimed-back expense's amount is locked: no share is marked paid on it.
          edit={Boolean(tx) && !locked}
          itemized={splitItemized}
          defaultAccountId={defaultPayback}
          accountId={draft.accountId}
          newlyPaid={newlyPaid}
          onCancel={() => setSplitSeed(null)}
          onDone={(rows, evenly, total, paid) => {
            setSplitSeed(null);
            setSplitNote(null);
            setSplitRows(rows);
            setSplitEvenly(evenly);
            setNewlyPaid(paid);
            // Mark paid / Undo move the expense's amount, as in the app.
            if (Math.abs(total - (amount ?? 0)) >= 0.005) set({ amount: formatAmountInput(total, f.locale) });
          }}
        />
      ) : null}
      {picker === "transferCategory" ? (
        <CategoryPickerSheet type="expense" value={draft.categoryId} onChange={(id) => set({ categoryId: id })} onClose={() => setPicker(null)} />
      ) : null}
    </Sheet>
  );
}

/** The app's From and To cards on a transfer. */
function TransferCard({ label, account, placeholder, onClick, error, disabled }: { label: string; account: Account | null; placeholder: string; onClick: () => void; error?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-3 rounded-3xl border bg-background-subtle/50 px-4 py-4 text-left transition-colors hover:bg-background-subtle disabled:hover:bg-background-subtle/50 ${
        error ? "border-error/60" : "border-border/60"
      }`}
    >
      <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-card">
        {account ? <AccountLogo logoId={account.logoId} name={account.name} size={28} /> : <ClayImg name="settings/accounts" size={24} />}
      </span>
      <span className="min-w-0">
        <span className="block text-[12px] font-bold text-foreground-muted">{label}</span>
        <span className={`block truncate text-[17px] font-extrabold ${account ? "text-foreground" : "text-foreground-muted"}`}>{account?.name ?? placeholder}</span>
      </span>
    </button>
  );
}
