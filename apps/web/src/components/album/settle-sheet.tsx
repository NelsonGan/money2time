"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";

import { cents } from "@/lib/backup/album-group";
import { paidFrom } from "@/lib/album/debts";
import type { Group } from "@/lib/album/group";
import { readValue, trimNumber } from "@/lib/album/split";
import { settleRows, type GroupRowWrite } from "@/lib/album/writes";

import type { AlbumActions } from "./album-screen";
import type { SettleTarget } from "./balances-tab";
import { Avatar, Button, Icon, Sheet, currencySymbol, personColor, today, useMoney } from "./ui";

/**
 * Recording a payment on one line of Who owes whom: the user paying someone
 * (Settle up), someone paying the user, or two others, after a yes. All of it
 * or part. On the web no account is picked: the app asks for one when the
 * user moves there (README: Which account).
 */
export function SettleSheet({
  group,
  target,
  actions,
  onClose,
  onRecorded,
  onStale,
}: {
  group: Group;
  target: SettleTarget;
  actions: AlbumActions;
  onClose: () => void;
  onRecorded: (text: string, undo: GroupRowWrite[] | null) => void;
  /** The debt changed since the sheet opened, so nothing was recorded. */
  onStale: () => void;
}) {
  const t = useTranslations("album");
  const locale = useLocale();
  const money = useMoney();
  const [amountText, setAmountText] = useState(trimNumber(target.amount));
  const [busy, setBusy] = useState(false);
  const selfId = group.selfId;
  const realName = (id: string) => group.members.find((member) => member.id === id)?.name ?? t("someone");
  const nameOf = (id: string) => (id === selfId ? t("people.you") : realName(id));
  const amount = Math.min(cents(readValue(amountText)), cents(target.amount));
  const valid = amount > 0 && cents(readValue(amountText)) <= cents(target.amount);

  const title = target.from === selfId ? t("settle.payTitle", { name: nameOf(target.to) }) : target.to === selfId ? t("settle.receivedTitle", { name: nameOf(target.from) }) : t("settle.othersTitle");

  const record = async (event: FormEvent) => {
    event.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    const rows = settleRows(group, { ...target, amount: amount / 100 }, today());
    if (!rows.length) {
      // Someone's payment or change landed since this sheet opened: nothing is owed as it showed.
      setBusy(false);
      onStale();
      return;
    }
    // All of it, unless it runs across more bills than one change takes (`MAX_WRITE_ROWS`).
    const paid = paidFrom(
      rows.map(({ row }) => ({ from: String(row.from_member), to: String(row.to_member), amount: Number(row.amount) })),
      target.from,
    );
    const ok = await actions.write(rows, "payment_record");
    setBusy(false);
    if (ok) {
      onRecorded(
        t("settle.recorded", { from: nameOf(target.from), to: nameOf(target.to), amount: money(paid, target.currency) }),
        rows.map((row) => ({ table: "album_settlements", row: { id: row.row.id, deleted_at: "undone" } })),
      );
      onClose();
    }
  };

  return (
    <Sheet
      title={title}
      onClose={onClose}
      busy={busy}
      footer={
        <Button type="submit" form="album-settle" size="lg" busy={busy} disabled={!valid} className="w-full">
          {t("settle.record")}
        </Button>
      }
    >
      <form id="album-settle" onSubmit={record} className="flex flex-col items-center gap-4 pb-2 pt-2 text-center">
        <div className="flex items-center gap-3">
          <span className="flex flex-col items-center gap-1">
            <Avatar name={realName(target.from)} color={personColor(group.members, target.from, selfId)} size={52} />
            <span className="max-w-[110px] truncate text-[13px] font-bold">{nameOf(target.from)}</span>
          </span>
          <span className="mb-5 text-foreground-muted">
            <Icon name="arrow" size={22} />
          </span>
          <span className="flex flex-col items-center gap-1">
            <Avatar name={realName(target.to)} color={personColor(group.members, target.to, selfId)} size={52} />
            <span className="max-w-[110px] truncate text-[13px] font-bold">{nameOf(target.to)}</span>
          </span>
        </div>
        <label className="w-full">
          <span className="sr-only">{t("settle.amount")}</span>
          <span className="flex items-center justify-center gap-1 rounded-[22px] border border-border bg-background-subtle px-4 py-3 focus-within:border-primary">
            <span className="text-[30px] font-extrabold tracking-[-0.03em] text-foreground-soft">{currencySymbol(locale, target.currency)}</span>
            <input
              value={amountText}
              onChange={(event) => setAmountText(event.target.value.replace(/[^\d.,]/g, "").slice(0, 15))}
              inputMode="decimal"
              aria-label={t("settle.amount")}
              data-autofocus
              size={Math.max(2, amountText.length)}
              className="min-w-0 bg-transparent text-[36px] font-extrabold tracking-[-0.03em] outline-none tabular"
            />
            <span className="text-foreground-muted" aria-hidden="true">
              <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" />
              </svg>
            </span>
          </span>
        </label>
        <p className={`text-[13.5px] ${valid || !amountText ? "text-foreground-soft" : "font-semibold text-error"}`}>{t("settle.owed", { amount: money(target.amount, target.currency) })}</p>
        <p className="max-w-[340px] text-[13px] text-foreground-muted">{target.from === selfId || target.to === selfId ? t("settle.note") : t("settle.othersNote", { from: nameOf(target.from), to: nameOf(target.to) })}</p>
      </form>
    </Sheet>
  );
}
