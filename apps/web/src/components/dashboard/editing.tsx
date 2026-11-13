"use client";

import { useTranslations } from "next-intl";
import { useId, useMemo, useRef, useState, type ReactNode } from "react";

import type { DashboardEditAction } from "@/lib/analytics";
import type { Tx } from "@/lib/backup/model";
import { MAX_EDIT_OPS, MAX_EDIT_ROWS, type EditOp, type TxFields } from "@/lib/cloud/edits";

import { accountOptions, Caret, categoryOptions, OptionMenu, Popover, useDismiss } from "./dropdown";
import { AlbumBulkMenu } from "./edit/album-editor";
import { DAY_MAX, DAY_MIN, EditBlocked, EditError, isDayKey, phoneToday, Sheet, useEditRun } from "./edit/kit";
import { useDashboard, type EditAvailability } from "./state";
import { ClayImg } from "./ui";

/*
 * Changing data from the dashboard. Nothing is changed here: each change goes
 * to the phone, which checks it against its own data and saves it, then sends
 * the changed data back. So it works only while the phone is connected (and
 * has allowed this browser to make changes), and the dashboard says so
 * wherever a change could start.
 */

const ON: EditAvailability[] = ["ready", "saving", "syncing"];

/** The edit status in the top bar: on while the phone is connected, otherwise read only and why. */
export function EditStatusBadge() {
  const t = useTranslations("dashboard.edit");
  const { link } = useDashboard();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useDismiss(ref, open, () => setOpen(false));
  const state = link.editing;
  const on = ON.includes(state);
  const label = state === "ready" ? t("statusReady") : state === "saving" ? t("statusSaving") : state === "syncing" ? t("statusSyncing") : t("statusAway");
  const [title, body] =
    state === "update"
      ? [t("statusUpdateTitle"), t("statusUpdateBody")]
      : state === "off"
        ? [t("statusOffTitle"), t("statusOffBody")]
        : on
          ? [t("statusReadyTitle"), t("statusReadyBody")]
          : [t("statusAwayTitle"), t("statusAwayBody")];
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={id}
        className={`inline-flex h-10 items-center gap-2 rounded-full border px-3.5 text-[13.5px] font-extrabold ${
          on ? "border-success/40 bg-success-soft text-success" : "border-accent/50 bg-accent-soft text-[#8A5A0B]"
        }`}
      >
        {on ? (
          <ClayImg name={state === "ready" ? "ui/pencil" : "ui/refresh"} size={20} className={state === "ready" ? "" : "animate-spin"} />
        ) : (
          <ClayImg name="status/lock-closed" size={20} />
        )}
        <span role="status">{label}</span>
      </button>
      {open ? (
        <div id={id} className="absolute right-0 top-12 z-40 w-[300px] rounded-2xl border border-border bg-card p-4 text-[13px] leading-relaxed text-foreground-soft shadow-[var(--shadow-float)]">
          <p className="font-bold text-foreground">{title}</p>
          <p className="mt-1">{body}</p>
        </div>
      ) : null}
    </div>
  );
}

/** Above a page that can change data, while it cannot: how to make it possible. */
export function EditUnavailable({ state }: { state: EditAvailability }) {
  const t = useTranslations("dashboard.edit");
  if (state !== "away" && state !== "update" && state !== "off") return null;
  const [title, body] =
    state === "update" ? [t("statusUpdateTitle"), t("statusUpdateBody")] : state === "off" ? [t("statusOffTitle"), t("statusOffBody")] : [t("statusAwayTitle"), t("awayHint")];
  return (
    <div role="note" className="flex items-start gap-3 rounded-[20px] border border-border bg-card px-4 py-3.5 text-[13.5px] leading-relaxed">
      <ClayImg name="status/lock-closed" size={24} className="mt-px" />
      <p className="text-foreground-soft">
        <span className="font-extrabold text-foreground">{title}</span> {body}
      </p>
    </div>
  );
}

type BulkMenu = "category" | "account" | "date" | "note" | "duplicate" | "album" | "delete";

/**
 * Whether the app's buildDuplicateInput makes a copy the phone saves: never
 * of a balance adjustment (as in the app), nor of an entry with a negative
 * amount, which the phone refuses on a new entry and whose sign a copy must
 * not flip.
 */
const canDuplicate = (tx: Tx) => tx.type !== "balance_adjustment" && tx.originalAmount >= 0;

/** A copy of `tx` on `day`, as the app's buildDuplicateInput: the same entry, a fresh rate. */
function duplicateFields(tx: Tx, day: string): TxFields {
  const out: TxFields = { type: tx.type, amount: tx.originalAmount, date: day, note: tx.note, details: tx.details };
  if (tx.type === "transfer") {
    out.fromAccountId = tx.fromAccountId;
    out.toAccountId = tx.toAccountId;
    out.countsAsExpense = tx.countsAsExpense;
    out.categoryId = tx.countsAsExpense ? tx.categoryId : null;
    out.toAmount = tx.toAmount && tx.toAmount > 0 ? tx.toAmount : null;
  } else {
    out.accountId = tx.accountId;
    out.categoryId = tx.categoryId;
    out.currency = tx.currency;
    if (tx.type === "expense") {
      out.sentiment = tx.sentiment;
      out.reimbursable = tx.reimbursable;
    }
  }
  return out;
}

/** A toolbar button; `menu` opens under it. */
function ToolButton({
  icon,
  label,
  open,
  onClick,
  disabled,
  danger,
  menu,
  caret,
  align,
  width,
}: {
  icon: string;
  label: string;
  open: boolean;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  menu?: ReactNode;
  caret?: boolean;
  align?: "left" | "right";
  width?: number;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-expanded={menu === undefined ? undefined : open}
        aria-haspopup={menu === undefined ? undefined : "dialog"}
        aria-label={label}
        title={label}
        className={`inline-flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-[13px] font-bold transition-colors disabled:opacity-40 ${
          danger ? "text-error hover:bg-error-soft" : open ? "bg-background-subtle text-foreground" : "text-foreground-soft hover:bg-background-subtle hover:text-foreground"
        }`}
      >
        <ClayImg name={icon} size={16} />
        <span className="hidden sm:inline">{label}</span>
        {caret ? <Caret className={`-ml-0.5 transition-transform ${open ? "rotate-180" : ""}`} /> : null}
      </button>
      {open && menu ? (
        <Popover align={align} width={width}>
          {menu}
        </Popover>
      ) : null}
    </div>
  );
}

/** A small form in a menu: one field, then Apply. */
function MenuForm({ title, children, onApply, applyLabel, busy, disabled }: { title?: string; children: ReactNode; onApply: () => void; applyLabel: string; busy: boolean; disabled?: boolean }) {
  const t = useTranslations("dashboard.edit");
  return (
    <form
      className="space-y-2.5 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        onApply();
      }}
    >
      {title ? <p className="text-[12.5px] font-bold text-foreground-soft">{title}</p> : null}
      {children}
      <button type="submit" disabled={busy || disabled} className="h-9 w-full rounded-xl bg-primary text-[13px] font-extrabold text-card hover:bg-primary-dark disabled:opacity-50">
        {busy ? t("statusSaving") : applyLabel}
      </button>
    </form>
  );
}

const FIELD = "h-10 w-full rounded-xl border border-border bg-card px-3 text-[14px] text-foreground outline-none focus:border-primary";

/**
 * What a selection can do, in the list's header as a web list does it: change
 * the category (one per type, as the app's bulk sheet), account, day or note
 * of every selected entry, duplicate them to a day, add them to an album, or
 * delete them. A pick from a menu applies at once; each change goes to the
 * phone as one batch, saved whole or not at all.
 */
export function BulkToolbar({ selected, onClear }: { selected: Tx[]; onClear: () => void }) {
  const t = useTranslations("dashboard.edit");
  const ta = useTranslations("dashboard.edit.album");
  const { fullModel: model } = useDashboard();
  const { run, busy, error, ready, clear } = useEditRun();
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<BulkMenu | null>(null);
  const [day, setDay] = useState(phoneToday);
  const [note, setNote] = useState("");
  const [flow, setFlow] = useState<"expense" | "income">("expense");
  useDismiss(ref, open !== null && open !== "delete", () => setOpen(null));
  const count = selected.length;
  const tooMany = count > MAX_EDIT_ROWS;

  // As the app's bulk sheet: an expense category for the expenses, an income one for the income.
  const flows = (["expense", "income"] as const).filter((type) => selected.some((tx) => tx.type === type));
  const anyTransfer = selected.some((tx) => tx.type !== "expense" && tx.type !== "income");
  const anyLocked = selected.some((tx) => tx.amountLocked);
  // A shared album's bill keeps its day and title from the group and is
  // deleted in the app: the phone refuses the whole batch when one is in it.
  const anyGroupBill = selected.some((tx) => tx.albumGroupId);
  const copies = selected.filter(canDuplicate);
  // A bulk move keeps each amount as it is, so the phone takes it only into
  // an account of the entries' own currency: one currency, or none to offer.
  const currencies = new Set(selected.map((tx) => tx.currency));
  const moveCurrency = count > 1 ? (currencies.size === 1 ? [...currencies][0] : null) : undefined;
  const shownFlow = flows.includes(flow) ? flow : (flows[0] ?? "expense");
  // Built once per copy of the data, not on every tick or keystroke.
  const categoryChoices = useMemo(
    () => ({
      expense: categoryOptions(model, ["expense"], { expense: t("expense"), income: t("income") }),
      income: categoryOptions(model, ["income"], { expense: t("expense"), income: t("income") }),
    }),
    [model, t],
  );
  const accountChoices = useMemo(
    () =>
      accountOptions(model, { ungrouped: t("ungrouped"), goals: t("savingsGoals") }, (id) => {
        const account = model.accountById.get(id);
        return account?.type !== "goal" && (moveCurrency === undefined || account?.currency === moveCurrency);
      }),
    [model, t, moveCurrency],
  );

  const toggle = (menu: BulkMenu) => {
    clear();
    setOpen((current) => (current === menu ? null : menu));
    if (menu === "date" || menu === "duplicate") setDay(phoneToday());
    if (menu === "note") setNote("");
  };

  const rows = (list: Tx[]) => list.map((tx) => ({ id: tx.id, at: tx.updatedAt }));
  const send = async (ops: EditOp[], action: DashboardEditAction) => {
    if (!ready || busy || tooMany || !ops.length) return;
    if (await run(ops, action)) {
      setOpen(null);
      onClear();
    }
  };
  const update = (list: Tx[], set: TxFields) => send([{ entity: "transaction", op: "update", rows: rows(list), set }], "transaction_bulk_update");

  const notice = (text: string) => <p className="p-3.5 text-[13px] leading-snug text-foreground-soft">{text}</p>;
  const errorLine = error ? (
    <div className="border-t border-border p-2">
      <EditError message={error} />
    </div>
  ) : null;
  const can = ready && !busy && !tooMany;

  const categoryMenu = !flows.length ? (
    notice(t("categoryNone"))
  ) : (
    <div>
      {flows.length > 1 ? (
        <div className="flex gap-1 border-b border-border p-1.5" role="tablist">
          {flows.map((type) => (
            <button
              key={type}
              type="button"
              role="tab"
              aria-selected={shownFlow === type}
              onClick={() => setFlow(type)}
              className={`h-8 flex-1 rounded-lg text-[12.5px] font-bold ${shownFlow === type ? "bg-primary-soft text-primary-dark" : "text-foreground-soft hover:bg-background-subtle"}`}
            >
              {t(type === "expense" ? "expenseCategory" : "incomeCategory")}
            </button>
          ))}
        </div>
      ) : null}
      <OptionMenu
        key={shownFlow}
        label={t(shownFlow === "expense" ? "expenseCategory" : "incomeCategory")}
        searchable
        options={categoryChoices[shownFlow].map((option) => ({ ...option, disabled: !can }))}
        onSelect={(id) => void update(selected.filter((tx) => tx.type === shownFlow), { categoryId: id })}
      />
      {errorLine}
    </div>
  );

  const accountMenu = anyTransfer ? (
    notice(t("accountTransfers"))
  ) : anyLocked ? (
    notice(t("accountLocked"))
  ) : moveCurrency === null ? (
    notice(t("accountCurrencies"))
  ) : (
    <div>
      <OptionMenu
        label={t("accountLabel")}
        searchable
        options={accountChoices.map((option) => ({ ...option, disabled: !can }))}
        onSelect={(id) => void update(selected, { accountId: id })}
      />
      {errorLine}
    </div>
  );

  const dateMenu = anyGroupBill ? (
    notice(t("groupBills"))
  ) : (
    <div>
      <MenuForm applyLabel={t("apply")} busy={busy} disabled={!can || !isDayKey(day)} onApply={() => void update(selected, { date: day })}>
        <input type="date" data-autofocus min={DAY_MIN} max={DAY_MAX} value={day} onChange={(event) => setDay(event.target.value)} aria-label={t("date")} className={FIELD} autoFocus />
      </MenuForm>
      {errorLine}
    </div>
  );

  const noteMenu = anyGroupBill ? (
    notice(t("groupBills"))
  ) : (
    <div>
      {/* An emptied note clears it, as the app's bulk sheet does. */}
      <MenuForm applyLabel={t("apply")} busy={busy} disabled={!can} onApply={() => void update(selected, { note: note.trim() })}>
        <input value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} aria-label={t("note")} placeholder={t("notePlaceholder")} className={FIELD} autoFocus />
      </MenuForm>
      {errorLine}
    </div>
  );

  const duplicateMenu = !copies.length ? (
    notice(t("duplicateNone"))
  ) : copies.length > MAX_EDIT_OPS ? (
    // One op per copy.
    notice(t("duplicateTooMany", { max: MAX_EDIT_OPS }))
  ) : (
    <div>
      <MenuForm
        title={t("duplicateTitle")}
        applyLabel={t("duplicate")}
        busy={busy}
        disabled={!can || !isDayKey(day)}
        onApply={() =>
          void send(
            copies.map((tx) => ({ entity: "transaction", op: "create", tx: duplicateFields(tx, day) })),
            "transaction_bulk_duplicate",
          )
        }
      >
        <input type="date" min={DAY_MIN} max={DAY_MAX} value={day} onChange={(event) => setDay(event.target.value)} aria-label={t("duplicateTitle")} className={FIELD} autoFocus />
      </MenuForm>
      {errorLine}
    </div>
  );

  const buttons: { key: BulkMenu; icon: string; label: string; menu: ReactNode; width?: number; align?: "left" | "right" }[] = [
    { key: "category", icon: "ui/checklist", label: t("categoryLabel"), menu: categoryMenu, width: 300 },
    { key: "account", icon: "settings/accounts", label: t("accountLabel"), menu: accountMenu, width: 280 },
    { key: "date", icon: "ui/calendar", label: t("date"), menu: dateMenu, width: 240 },
    { key: "note", icon: "ui/pencil", label: t("note"), menu: noteMenu, width: 280 },
    { key: "duplicate", icon: "ui/plus", label: t("duplicate"), menu: duplicateMenu, width: 240, align: "right" },
    { key: "album", icon: "settings/albums", label: ta("bulkAction"), menu: <AlbumBulkMenu selected={selected} onDone={() => { setOpen(null); onClear(); }} />, width: 280, align: "right" },
  ];

  return (
    <div ref={ref} role="toolbar" aria-label={t("selected", { count })} className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1 gap-y-1.5">
      <span className="tabular whitespace-nowrap pr-1 text-[13.5px] font-extrabold text-foreground" aria-live="polite">
        {busy ? t("statusSaving") : t("selected", { count })}
      </span>
      <button type="button" onClick={onClear} disabled={busy} className="mr-1 rounded-lg px-2 py-1 text-[12.5px] font-bold text-primary hover:bg-primary-soft disabled:opacity-40">
        {t("clear")}
      </button>
      <span className="mx-1 hidden h-5 w-px bg-border sm:block" aria-hidden="true" />
      {buttons.map((button) => (
        <ToolButton
          key={button.key}
          icon={button.icon}
          label={button.label}
          caret
          open={open === button.key}
          onClick={() => toggle(button.key)}
          disabled={!ready || tooMany || (busy && open !== button.key)}
          menu={button.menu}
          width={button.width}
          align={button.align}
        />
      ))}
      <ToolButton icon="ui/trash" label={t("delete")} danger open={false} onClick={() => toggle("delete")} disabled={!ready || busy || tooMany} />
      {tooMany ? (
        <p role="alert" className="basis-full text-[12.5px] font-semibold text-error">
          {t("tooMany", { max: MAX_EDIT_ROWS })}
        </p>
      ) : null}
      {open === "delete" ? (
        <Sheet title={t("delete")} onClose={() => setOpen(null)} busy={busy}>
          <div className="space-y-4">
            <p className="text-[14px] leading-relaxed text-foreground">{anyGroupBill ? t("groupBills") : t("deleteConfirm", { count })}</p>
            <EditError message={error} />
            <EditBlocked />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(null)} disabled={busy} className="h-10 rounded-full px-4 text-[13.5px] font-bold text-foreground-soft hover:bg-background-subtle disabled:opacity-40">
                {t("cancel")}
              </button>
              {anyGroupBill ? null : (
                <button
                  type="button"
                  data-autofocus
                  onClick={() => void send([{ entity: "transaction", op: "delete", rows: rows(selected) }], "transaction_bulk_delete")}
                  disabled={!can}
                  className="h-10 rounded-full bg-error px-5 text-[13.5px] font-extrabold text-card disabled:opacity-50"
                >
                  {busy ? t("statusSaving") : t("delete")}
                </button>
              )}
            </div>
          </div>
        </Sheet>
      ) : null}
    </div>
  );
}
