"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { useDashboard, useFormat } from "../state";
import { AccountLogo, ClayImg } from "../ui";
import { AccountPickerSheet, MAX_AMOUNT, Sheet, Toggle, currencyAmount, decimalMark, formatDecimal } from "./kit";
import { MAX_SPLIT_ROWS, balanceFriends, balanceSelf, evenAcrossUnpaid, hasFriend, newRowKey, num, unpaidSum, type SplitDraftRow } from "./split-ops";

/**
 * The app's Split Bill page on the web: Me and the friends with their shares,
 * Split evenly, Add person, and the sum bar that must read the total before
 * Done. On a saved expense a friend's share can be marked paid (into the
 * account they paid back to), which takes it off the expense, and undone
 * before the editor saves, as in the app. Nothing is sent from here: the
 * transaction editor saves the rows with the expense.
 */
export function SplitBillSheet({
  total: initialTotal,
  currency,
  rows: initialRows,
  evenly: initialEvenly,
  edit,
  itemized = false,
  defaultAccountId,
  accountId,
  newlyPaid: initialNewlyPaid,
  onCancel,
  onDone,
}: {
  /** The expense's amount, already less any paid shares. */
  total: number;
  currency: string;
  rows: SplitDraftRow[];
  evenly: boolean;
  /** A saved expense whose amount may move: Mark paid is offered on its saved shares. */
  edit: boolean;
  /**
   * The app's "split before amount": no amount yet, so each row is typed on
   * its own and their sum becomes the amount on Done.
   */
  itemized?: boolean;
  defaultAccountId: string | null;
  /** The expense's account: where a share marked paid goes when it names none, as the phone pays it. */
  accountId: string | null;
  /**
   * Shares marked paid earlier in this editor visit: only those offer Undo, as
   * in the app. The editor keeps them across openings of this sheet.
   */
  newlyPaid: ReadonlySet<string>;
  onCancel: () => void;
  onDone: (rows: SplitDraftRow[], evenly: boolean, total: number, newlyPaid: ReadonlySet<string>) => void;
}) {
  const t = useTranslations("dashboard.edit.split");
  const { fullModel: model } = useDashboard();
  const f = useFormat();
  const [rows, setRows] = useState(initialRows);
  const [evenly, setEvenly] = useState(initialEvenly);
  const [total, setTotal] = useState(initialTotal);
  // Kept here until Done, so Cancel drops a Mark paid or Undo with the rest.
  const [newlyPaid, setNewlyPaid] = useState<ReadonlySet<string>>(initialNewlyPaid);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  // The amount being typed shows as typed; the others in the browser's format.
  const [focused, setFocused] = useState<string | null>(null);
  const mark = decimalMark(f.locale);

  const rebalance = (next: SplitDraftRow[], amount: number, on = evenly) => (itemized ? next : on ? evenAcrossUnpaid(next, amount) : balanceSelf(next, amount));
  const sum = unpaidSum(rows);
  const diff = Math.round((total - sum) * 100) / 100;
  // The phone saves amounts up to its MAX_AMOUNT.
  const tooLarge = rows.some((row) => num(row.amount) > MAX_AMOUNT);
  // Itemized has no total to match: Done needs something to commit.
  const matches = !tooLarge && (itemized ? sum > 0.004 : Math.abs(diff) < 0.005);
  const money = (value: number) => currencyAmount(value, currency, f.locale);
  const shown = (row: SplitDraftRow) =>
    focused === row.key ? row.amount.split(".").join(mark) : formatDecimal(num(row.amount), f.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const changeAmount = (index: number, value: string) => {
    const target = rows[index];
    if (!target || target.paid) return;
    // Kept with a decimal point: the browser's mark becomes one ("12,50" in
    // German is twelve and a half), group marks go, and so does anything
    // else but digits. Going over is allowed, the sum bar shows it.
    const group = mark === "," ? "." : ",";
    const cleaned = value.split(group).join("").split(mark).join(".").replace(/[^0-9.]/g, "");
    const next = rows.map((row, i) => (i === index ? { ...row, amount: cleaned } : row));
    setEvenly(false);
    setRows(itemized ? next : target.isSelf ? balanceFriends(next, total) : balanceSelf(next, total, index));
  };

  const addPerson = () => {
    if (rows.length >= MAX_SPLIT_ROWS) return;
    const next = [...rows, { key: newRowKey(), name: "", amount: "0", isSelf: false, paybackAccountId: defaultAccountId, paid: false, paidAt: null }];
    setRows(rebalance(next, total));
  };

  const remove = (index: number) => {
    const target = rows[index];
    if (!target || target.isSelf || target.paid) return;
    setRows(rebalance(rows.filter((_, i) => i !== index), total));
  };

  const markPaid = (key: string, paybackAccountId: string) => {
    const target = rows.find((row) => row.key === key);
    if (!target || target.isSelf || target.paid) return;
    const nextTotal = Math.round((total - num(target.amount)) * 100) / 100;
    const next = rows.map((row) => (row.key === key ? { ...row, paybackAccountId, paid: true, paidAt: new Date().toISOString() } : row));
    setTotal(nextTotal);
    setRows(rebalance(next, nextTotal));
    setNewlyPaid((current) => new Set(current).add(key));
  };

  const undoPaid = (key: string) => {
    const target = rows.find((row) => row.key === key);
    if (!target?.paid) return;
    const nextTotal = Math.round((total + num(target.amount)) * 100) / 100;
    const next = rows.map((row) => (row.key === key ? { ...row, paid: false, paidAt: null } : row));
    setTotal(nextTotal);
    setRows(rebalance(next, nextTotal));
    setNewlyPaid((current) => {
      const out = new Set(current);
      out.delete(key);
      return out;
    });
  };

  const done = () => {
    if (!matches) return;
    // Every friend removed: split mode folds back off.
    // Itemized: the rows' sum is the amount, and later edits go to Me alone.
    const amount = itemized ? sum : total;
    if (!hasFriend(rows)) onDone([], false, amount, newlyPaid);
    else onDone(rows, itemized ? false : evenly, amount, newlyPaid);
  };

  const picking = pickerFor ? rows.find((row) => row.key === pickerFor) : null;

  return (
    <Sheet
      title={t("title")}
      onClose={onCancel}
      headerAction={
        <button
          type="button"
          onClick={done}
          disabled={!matches}
          className="inline-flex h-9 items-center rounded-full bg-primary px-4 text-[13px] font-extrabold text-card transition hover:bg-primary-dark disabled:bg-background-subtle disabled:text-foreground-muted"
        >
          {t("done")}
        </button>
      }
      footer={
        <div className="text-center" aria-live="polite">
          <p className="inline-flex items-center gap-1.5 text-[15px] font-extrabold text-foreground">
            {itemized ? t("itemizedTotal", { sum: money(sum) }) : t("sumMatch", { sum: money(sum), total: money(total) })}
            {matches ? <ClayImg name="ui/check" size={16} /> : null}
          </p>
          {matches ? null : itemized ? (
            <p className="mt-0.5 text-[12.5px] text-foreground-muted">{t("itemizedZeroHint")}</p>
          ) : (
            <p className={`mt-0.5 text-[12.5px] font-semibold ${diff > 0 ? "text-success" : "text-error"}`}>
              {diff > 0 ? t("sumLeft", { diff: money(diff) }) : t("sumOver", { diff: money(Math.abs(diff)) })}
            </p>
          )}
        </div>
      }
    >
      <div className="space-y-3">
        {itemized ? null : (
          <Toggle
            checked={evenly}
            onChange={(on) => {
              setEvenly(on);
              if (on) setRows(evenAcrossUnpaid(rows, total));
            }}
            label={t("evenly")}
          />
        )}

        <div className="overflow-hidden rounded-[20px] border border-border/60 bg-background-subtle/40">
          {rows.map((row, index) => {
            // As the phone pays a share: to the account it names, else the expense's own.
            const paidTo = row.paybackAccountId ?? accountId;
            const account = paidTo ? model.accountById.get(paidTo) : null;
            const canMarkPaid = edit && !row.isSelf && !row.paid && !!row.id;
            return (
              <div key={row.key} className={index > 0 ? "border-t border-border/50" : ""}>
                <div className="flex items-center gap-2.5 px-4 py-3">
                  <span
                    aria-hidden="true"
                    className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold ${
                      row.isSelf ? "bg-primary/15 text-primary-dark" : row.paid ? "bg-success/15" : "bg-card"
                    }`}
                  >
                    {row.paid ? <ClayImg name="ui/check" size={16} /> : row.isSelf ? t("me").slice(0, 1).toUpperCase() : <ClayImg name="status/people-two" size={20} />}
                  </span>
                  <input
                    value={row.isSelf ? t("me") : row.name}
                    disabled={row.isSelf || row.paid}
                    maxLength={80}
                    placeholder={t("personPlaceholder")}
                    aria-label={t("personPlaceholder")}
                    onChange={(event) => setRows(rows.map((item, i) => (i === index ? { ...item, name: event.target.value } : item)))}
                    className="min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-foreground-muted disabled:text-foreground-soft"
                  />
                  <label className="flex shrink-0 items-center gap-1">
                    <span className="text-[12px] text-foreground-muted">{currency}</span>
                    <input
                      inputMode="decimal"
                      value={shown(row)}
                      disabled={row.paid}
                      aria-label={row.isSelf ? t("me") : row.name || t("personPlaceholder")}
                      onChange={(event) => changeAmount(index, event.target.value)}
                      onFocus={(event) => {
                        setFocused(row.key);
                        // Selected once it shows as typed.
                        const input = event.target;
                        requestAnimationFrame(() => input.select());
                      }}
                      onBlur={() => setFocused(null)}
                      className="tabular w-[92px] rounded-lg border border-border/70 bg-card px-2 py-1 text-right text-[15px] text-foreground outline-none focus:border-primary disabled:border-transparent disabled:bg-transparent disabled:text-foreground-muted"
                    />
                  </label>
                </div>
                {row.paid ? (
                  <div className="flex items-center justify-between gap-2 px-4 pb-3 pl-[60px]">
                    <span className="flex min-w-0 items-center gap-1.5 text-[12px] text-foreground-muted">
                      <span className="shrink-0">{t("paidLabel", { date: row.paidAt ? new Date(row.paidAt).toLocaleDateString(f.locale) : "" })} ·</span>
                      {account ? <AccountLogo logoId={account.logoId} name={account.name} size={14} /> : null}
                      <span className="truncate">{account?.name ?? t("noAccount")}</span>
                    </span>
                    {newlyPaid.has(row.key) ? (
                      <button type="button" onClick={() => undoPaid(row.key)} className="inline-flex shrink-0 items-center gap-1 rounded-full bg-background-subtle px-2.5 py-1 text-[12px] font-bold text-foreground-soft hover:text-foreground">
                        <ClayImg name="ui/undo" size={12} />
                        {t("undo")}
                      </button>
                    ) : null}
                  </div>
                ) : !row.isSelf ? (
                  <div className="flex items-center justify-end gap-2 px-4 pb-3">
                    {canMarkPaid ? (
                      <button type="button" onClick={() => setPickerFor(row.key)} className="inline-flex items-center gap-1 rounded-full bg-success/15 px-3 py-1.5 text-[12px] font-bold text-success">
                        <ClayImg name="ui/check" size={12} />
                        {t("markPaid")}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => remove(index)}
                      aria-label={t("remove")}
                      title={t("remove")}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-error-soft hover:bg-error/15"
                    >
                      <ClayImg name="ui/trash" size={15} />
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
          <button
            type="button"
            onClick={addPerson}
            disabled={rows.length >= MAX_SPLIT_ROWS}
            className="flex w-full items-center gap-3 border-t border-border/50 px-4 py-3.5 text-left text-[14.5px] font-bold text-primary-dark hover:bg-background-subtle/60 disabled:opacity-50 disabled:hover:bg-transparent"
          >
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/15">
              <ClayImg name="ui/plus" size={14} />
            </span>
            {t("addPerson")}
          </button>
        </div>
      </div>

      {picking ? (
        <AccountPickerSheet
          title={t("paidTo")}
          value={picking.paybackAccountId ?? defaultAccountId}
          onClose={() => setPickerFor(null)}
          onChange={(accountId) => markPaid(picking.key, accountId)}
        />
      ) : null}
    </Sheet>
  );
}
