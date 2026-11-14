"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import type { Tx } from "@/lib/backup/model";

import { EditUnavailable } from "../editing";
import { offersEdits, useDashboard, useFormat } from "../state";
import { AccountLogo, Card, ClayImg } from "../ui";
import { AccountPickerSheet, Confirm, EditBlocked, EditError, useEditRun } from "./kit";
import { defaultPaybackId, type SplitOp, type SplitRecord } from "./split-ops";

type Share = { row: SplitRecord; tx: Tx };

/** Paid shares listed for Undo: the most recent ones. */
const PAID_SHOWN = 20;

/**
 * The app's Who owes you share cards on the web: each friend's share of a
 * bill with the account it is paid back to (a chip that picks another) and
 * Mark paid; a paid share is muted and can be undone. Each saves on its own
 * through the phone.
 */
export function SplitShares() {
  const t = useTranslations("dashboard.edit.split");
  const te = useTranslations("dashboard.edit");
  const { fullModel: model, link } = useDashboard();
  const f = useFormat();
  const { run, busy, error, ready } = useEditRun();
  // The share whose payback account is being picked, or "default" for Default paid to.
  const [pickerFor, setPickerFor] = useState<Share | "default" | null>(null);
  const [undoFor, setUndoFor] = useState<Share | null>(null);
  const [removeFor, setRemoveFor] = useState<Share | null>(null);
  const editable = offersEdits(link.editing);

  const { owed, paid } = useMemo(() => {
    const shares: Share[] = [];
    for (const raw of model.raw.transaction_splits ?? []) {
      const row = raw as SplitRecord;
      const tx = model.txById.get(row.transaction_id);
      if (row.deleted_at || row.is_self || !tx || !(row.amount > 0)) continue;
      shares.push({ row, tx });
    }
    return {
      owed: shares.filter((share) => !share.row.paid_at).sort((a, b) => b.tx.date.getTime() - a.tx.date.getTime()),
      paid: shares
        .filter((share) => share.row.paid_at)
        .sort((a, b) => (b.row.paid_at ?? "").localeCompare(a.row.paid_at ?? ""))
        .slice(0, PAID_SHOWN),
    };
  }, [model]);

  if (!owed.length && !paid.length) return null;

  const shareOp = (share: Share, op: "settle" | "unsettle" | "remove") =>
    ({ entity: "module:split", op, id: share.row.id, txId: share.tx.id, at: share.row.updated_at ?? null }) as SplitOp;
  const settle = async (share: Share) => {
    if (!ready || busy) return;
    await run([shareOp(share, "settle")], "split_settle");
  };
  const removeShare = async (share: Share) => {
    if (!ready || busy) return;
    if (await run([shareOp(share, "remove")], "split_remove")) setRemoveFor(null);
  };
  // As the app's chip: the share's account changes right away.
  const repoint = async (share: Share, accountId: string) => {
    if (!ready || busy || accountId === share.row.payback_account_id) return;
    await run([{ entity: "module:split", op: "payback", id: share.row.id, txId: share.tx.id, at: share.row.updated_at ?? null, paybackAccountId: accountId }], "split_payback");
  };
  const defaultId = defaultPaybackId(model);
  const defaultAccount = defaultId ? (model.accountById.get(defaultId) ?? null) : null;
  const setDefault = async (accountId: string) => {
    if (!ready || busy || accountId === defaultId) return;
    await run([{ entity: "module:split", op: "default_payback", accountId }], "split_default_payback");
  };
  const unsettle = async (share: Share) => {
    if (!ready || busy) return;
    if (await run([{ entity: "module:split", op: "unsettle", id: share.row.id, txId: share.tx.id, at: share.row.updated_at ?? null }], "split_unsettle")) setUndoFor(null);
  };

  const card = (share: Share) => {
    const { row, tx } = share;
    const accountId = row.payback_account_id ?? tx.accountId;
    const account = accountId ? (model.accountById.get(accountId) ?? null) : null;
    const settled = !!row.paid_at;
    // A shared album's bill is the group's: its payments are recorded in the
    // app, and the phone refuses them from here, so its cards have no buttons.
    const groupBill = !!tx.albumGroupId;
    return (
      <li key={row.id} title={groupBill ? te("sharedBill.payments") : undefined} className={`rounded-2xl border px-4 py-3 ${settled ? "border-border/40 bg-background-subtle/40" : "border-border/70 bg-card"}`}>
        <div className="flex items-center gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-background-subtle text-[13px] font-extrabold text-foreground-soft">
            {(row.person_name?.trim() || t("someone")).slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className={`block truncate text-[14px] font-bold ${settled ? "text-foreground-muted" : "text-foreground"}`}>{row.person_name?.trim() || t("someone")}</span>
            <span className="block truncate text-[12px] text-foreground-muted">
              {tx.note || t("untitledBill")} · {f.date(tx.date)}
            </span>
          </span>
          <span className={`tabular text-[14px] font-extrabold ${settled ? "text-foreground-muted" : "text-foreground"}`}>{f.foreign(row.amount, tx.currency)}</span>
        </div>
        {editable && (settled || !groupBill) ? (
          <div className="mt-2 flex items-center gap-2 pl-12">
            {settled ? (
              <>
                <span className="min-w-0 truncate text-[12px] text-foreground-muted">
                  {t("paidLabel", { date: row.paid_at ? new Date(row.paid_at).toLocaleDateString(f.locale) : "" })}
                  {account ? ` · ${account.name}` : ""}
                </span>
                <span className="flex-1" />
                {groupBill ? null : (
                  <button
                    type="button"
                    onClick={() => setUndoFor(share)}
                    disabled={busy || !ready}
                    className="inline-flex shrink-0 items-center gap-1 rounded-full bg-background-subtle px-2.5 py-1 text-[12px] font-bold text-foreground-soft hover:text-foreground disabled:opacity-50"
                  >
                    <ClayImg name="ui/undo" size={12} />
                    {t("undo")}
                  </button>
                )}
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setPickerFor(share)}
                  disabled={busy || !ready}
                  className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-background-subtle px-2.5 py-1.5 text-[12px] font-semibold text-foreground-soft hover:text-foreground"
                >
                  {account ? <AccountLogo logoId={account.logoId} name={account.name} size={14} /> : null}
                  <span className="truncate">{account?.name ?? t("noAccount")}</span>
                  <span aria-hidden="true">▾</span>
                </button>
                <span className="flex-1" />
                <button
                  type="button"
                  onClick={() => setRemoveFor(share)}
                  disabled={busy || !ready}
                  aria-label={t("remove")}
                  title={t("remove")}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-error-soft hover:bg-error/15 disabled:opacity-50"
                >
                  <ClayImg name="ui/trash" size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => void settle(share)}
                  disabled={busy || !ready || !account}
                  className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success/15 px-3 py-1.5 text-[12px] font-extrabold text-success disabled:opacity-50"
                >
                  <ClayImg name="ui/check" size={12} />
                  {t("markPaid")}
                </button>
              </>
            )}
          </div>
        ) : null}
        {removeFor?.row.id === row.id ? (
          <div className="mt-2">
            <Confirm
              title={t("removeTitle")}
              body={t("removeBody")}
              actions={[
                { label: t("cancel"), onClick: () => setRemoveFor(null) },
                { label: t("remove"), tone: "danger", onClick: () => void removeShare(share), disabled: busy || !ready },
              ]}
            />
          </div>
        ) : null}
        {undoFor?.row.id === row.id ? (
          <div className="mt-2">
            <Confirm
              title={t("undoTitle")}
              body={t("undoBody")}
              actions={[
                { label: t("cancel"), onClick: () => setUndoFor(null) },
                { label: t("undo"), tone: "danger", onClick: () => void unsettle(share), disabled: busy || !ready },
              ]}
            />
          </div>
        ) : null}
      </li>
    );
  };

  return (
    <Card title={t("sharesTitle")}>
      <div className="space-y-3">
        {editable ? (
          <>
            <EditError message={error} />
            <EditBlocked />
          </>
        ) : (
          <EditUnavailable state={link.editing} />
        )}
        {editable ? (
          <div className="flex items-center gap-2 rounded-2xl bg-background-subtle/60 px-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-bold text-foreground">{t("defaultPaidTo")}</span>
              <span className="block text-[11.5px] leading-snug text-foreground-muted">{t("defaultPaidToHint")}</span>
            </span>
            <button
              type="button"
              onClick={() => setPickerFor("default")}
              disabled={busy || !ready}
              className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-card px-2.5 py-1.5 text-[12px] font-semibold text-foreground-soft hover:text-foreground disabled:opacity-50"
            >
              {defaultAccount ? <AccountLogo logoId={defaultAccount.logoId} name={defaultAccount.name} size={14} /> : null}
              <span className="truncate">{defaultAccount?.name ?? t("noAccount")}</span>
              <span aria-hidden="true">▾</span>
            </button>
          </div>
        ) : null}
        {owed.length ? <ul className="space-y-2">{owed.map(card)}</ul> : null}
        {paid.length ? (
          <>
            <p className="px-1 pt-1 text-[11.5px] font-extrabold uppercase tracking-[0.08em] text-foreground-muted">{t("paidTitle")}</p>
            <ul className="space-y-2">{paid.map(card)}</ul>
          </>
        ) : null}
      </div>
      {pickerFor === "default" ? (
        <AccountPickerSheet title={t("defaultPaidTo")} value={defaultId} onClose={() => setPickerFor(null)} onChange={(id) => void setDefault(id)} />
      ) : pickerFor ? (
        <AccountPickerSheet
          title={t("paidTo")}
          value={pickerFor.row.payback_account_id ?? pickerFor.tx.accountId}
          onClose={() => setPickerFor(null)}
          onChange={(id) => void repoint(pickerFor, id)}
        />
      ) : null}
    </Card>
  );
}
