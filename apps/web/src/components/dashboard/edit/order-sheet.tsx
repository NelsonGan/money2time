"use client";

import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";

import { CancelButton, EditBlocked, EditError, SaveButton, Sheet } from "./kit";
import { SortableList } from "./sortable";

/*
 * The app's drag-to-reorder for a flat list (its items, its albums) on the
 * web, by drag and drop. The list is saved whole, as the app's drag
 * saves it; the phone refuses it unless it names exactly the rows it has.
 */

type OrderRow = { id: string; name: string; icon?: ReactNode };

export function OrderSheet({
  title,
  rows: initial,
  busy,
  ready,
  error,
  onSave,
  onClose,
}: {
  title: string;
  rows: OrderRow[];
  busy: boolean;
  ready: boolean;
  error: string | null;
  onSave: (ids: string[]) => void;
  onClose: () => void;
}) {
  const t = useTranslations("dashboard.edit.reorder");
  const [rows, setRows] = useState(initial);
  const changed = rows.some((row, index) => row.id !== initial[index]?.id);
  const byId = new Map(rows.map((row) => [row.id, row]));
  return (
    <Sheet
      title={title}
      onClose={onClose}
      busy={busy}
      footer={
        <div className="flex flex-wrap gap-2">
          <CancelButton onClick={onClose} disabled={busy} />
          <SaveButton label={t("save")} busy={busy} disabled={!ready || !changed} onClick={() => onSave(rows.map((row) => row.id))} />
        </div>
      }
    >
      <div className="space-y-3">
        <SortableList
          ids={rows.map((row) => row.id)}
          onChange={(ids) => setRows(ids.map((id) => byId.get(id) as OrderRow))}
          label={(id) => byId.get(id)?.name ?? id}
          disabled={busy}
          className="space-y-1.5"
          itemClassName="rounded-2xl border border-border bg-card"
          renderItem={(id, grip) => {
            const row = byId.get(id) as OrderRow;
            return (
              <div className="flex items-center gap-2.5 py-2 pl-1.5 pr-3">
                {grip}
                {row.icon}
                <span className="min-w-0 flex-1 truncate text-[14px] font-bold text-foreground">{row.name}</span>
              </div>
            );
          }}
        />
        <EditError message={error} />
        <EditBlocked />
      </div>
    </Sheet>
  );
}
