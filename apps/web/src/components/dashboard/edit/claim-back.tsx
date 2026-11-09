"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import type { Tx } from "@/lib/backup/model";
import type { TransactionRow } from "@/lib/backup/types";

import { useDashboard } from "../state";
import { AccountLogo, ClayImg } from "../ui";
import { AccountPickerSheet, Confirm, EditError, useEditRun } from "./kit";

/** The phone's `module:reimbursement` ops (the app's services/webDashboardEditModules/reimbursement.ts). */
type ReimbursementOp =
  | { entity: "module:reimbursement"; op: "mark"; id: string; at: string | null; accountId?: string; date?: string }
  | { entity: "module:reimbursement"; op: "unmark"; id: string; at: string | null };

/**
 * The app's Reimbursements page for one expense, where the web has no such
 * page: in the editor's options, under "Pending reimbursement". A pending
 * expense shows the account the money comes back into and Claim; a claimed one
 * shows where it went and Undo, which asks first as the app does. Each saves
 * on its own and closes the editor, since the expense changes.
 */
export function ClaimBack({ tx, onDone, hidden, blocked }: { tx: Tx; onDone: () => void; hidden?: boolean; blocked?: boolean }) {
  const t = useTranslations("dashboard.edit.reimbursement");
  const { fullModel: model } = useDashboard();
  const { run, busy, error, ready } = useEditRun();
  const [picker, setPicker] = useState(false);
  const [confirmUndo, setConfirmUndo] = useState(false);

  const row = useMemo(
    () => (model.raw.transactions ?? []).find((item) => item.id === tx.id) as (TransactionRow & { reimbursement_account_id?: string | null }) | undefined,
    [model, tx.id],
  );
  // Where the page's chip points: the account picked for it, else the expense's own.
  const saved = row?.reimbursement_account_id ?? tx.accountId;
  const [accountId, setAccountId] = useState<string | null>(saved);
  if (hidden || tx.type !== "expense" || (!tx.reimbursable && !tx.reimbursed)) return null;

  const account = accountId ? (model.accountById.get(accountId) ?? null) : null;
  const into = row?.reimbursement_account_id ? (model.accountById.get(row.reimbursement_account_id) ?? null) : null;

  const claim = async () => {
    if (!account || !ready || busy || blocked) return;
    const op: ReimbursementOp = { entity: "module:reimbursement", op: "mark", id: tx.id, at: tx.updatedAt };
    if (account.id !== saved) op.accountId = account.id;
    if (await run([op], "reimbursement_mark")) onDone();
  };
  const undo = async () => {
    if (!ready || busy || blocked) return;
    if (await run([{ entity: "module:reimbursement", op: "unmark", id: tx.id, at: tx.updatedAt }], "reimbursement_unmark")) onDone();
  };

  return (
    <div className="space-y-2 rounded-2xl bg-background-subtle/70 p-3">
      <p className="px-1 text-[11.5px] font-extrabold uppercase tracking-[0.08em] text-foreground-muted">{tx.reimbursed ? t("settledTitle") : t("pendingTitle")}</p>
      {tx.reimbursed ? (
        <div className="flex items-center gap-2">
          <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-card px-2.5 py-1.5 text-[12.5px] font-semibold text-foreground-soft">
            {into ? <AccountLogo logoId={into.logoId} name={into.name} size={16} /> : null}
            <span className="truncate">{into ? t("paidInto", { account: into.name }) : t("noAccount")}</span>
          </span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => setConfirmUndo(true)}
            disabled={busy || !ready || blocked}
            aria-label={t("undoAction")}
            title={t("undoAction")}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-card text-foreground-soft disabled:opacity-50"
          >
            <ClayImg name="ui/undo" size={15} />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPicker(true)}
            className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-card px-2.5 py-1.5 text-[12.5px] font-semibold text-foreground-soft hover:text-foreground"
          >
            {account ? <AccountLogo logoId={account.logoId} name={account.name} size={16} /> : null}
            <span className="truncate">{account?.name ?? t("noAccount")}</span>
            <span aria-hidden="true">▾</span>
          </button>
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => void claim()}
            disabled={busy || !ready || !account || blocked}
            className="rounded-full bg-success/15 px-3.5 py-2 text-[12.5px] font-extrabold text-success disabled:opacity-50"
          >
            {t("claim")}
          </button>
        </div>
      )}
      {confirmUndo ? (
        <Confirm
          title={t("undoTitle")}
          body={t("undoMessage")}
          actions={[
            { label: t("cancel"), onClick: () => setConfirmUndo(false) },
            { label: t("undoAction"), tone: "danger", onClick: () => void undo(), disabled: busy || !ready || blocked },
          ]}
        />
      ) : null}
      {blocked ? <p className="px-1 text-[12px] text-foreground-muted">{t("saveFirst")}</p> : null}
      <EditError message={error} />
      {picker ? <AccountPickerSheet value={accountId} onClose={() => setPicker(false)} onChange={(id) => setAccountId(id)} /> : null}
    </div>
  );
}
