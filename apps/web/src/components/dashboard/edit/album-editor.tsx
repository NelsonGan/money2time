"use client";

import { useTranslations } from "next-intl";
import { useId, useMemo, useState, type FormEvent, type ReactNode } from "react";

import { shiftMonthKey } from "@/lib/backup/dates";
import type { Model, Trip, Tx } from "@/lib/backup/model";
import type { AlbumRow } from "@/lib/backup/types";
import { MAX_EDIT_ROWS } from "@/lib/cloud/edits";

import { usePaywall } from "../paywall";
import { FREE_MAX_ALBUMS } from "../pro-limits";
import { useDashboard, useFormat } from "../state";
import { CategoryGlyph, ClayImg, Select } from "../ui";
import { CancelButton, Confirm, DAY_MAX, DAY_MIN, EditBlocked, EditError, Field, INPUT, PickerRow, Reloadable, SaveButton, Sheet, isDayKey, useEditRun, dayOf } from "./kit";
import { OptionMenu } from "../dropdown";
import { OrderSheet } from "./order-sheet";

/*
 * The app's albums (trips) on the web: CreateAlbumScreen, EditAlbumDetailsScreen,
 * the month-by-month "Add transactions" picker and the album's delete. Cover
 * photos and places stay in the app: the web has no photo upload and no offline
 * place search, so a new album gets neither and an edit keeps both. The app's
 * picker offers expenses only, and so does this one.
 */

type Details = { name: string; startDate: string | null; endDate: string | null };

type AlbumOp =
  | { entity: "module:album"; op: "create"; album: Details & { transactionIds: string[] } }
  | { entity: "module:album"; op: "update"; id: string; at: string | null; album: Details }
  | { entity: "module:album"; op: "delete"; id: string; at: string | null }
  | { entity: "module:album"; op: "transactions"; id: string; at: string | null; add: string[]; remove: string[] }
  | { entity: "module:album"; op: "reorder"; ids: string[] }
  | { entity: "module:album"; op: "active"; id: string | null };

/** The albums as stored, in the app's list order. */
function albumRows(model: Model): AlbumRow[] {
  return (model.raw.albums ?? [])
    .filter((row) => !row.deleted_at)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name));
}

/**
 * The album's own shared bills: entries of its group, whose id is the album's.
 * Ending the share clears their group, so a shared album is one that has any
 * (as of the last sync). Read from the full data, so a page filter cannot
 * hide them. Taking one out, or deleting the album, changes it for everyone in
 * it, which the app asks about first and the phone refuses from here.
 */
function albumGroupBillIds(model: Model, albumId: string): Set<string> {
  return new Set(model.txs.filter((tx) => tx.albumGroupId === albumId).map((tx) => tx.id));
}

/** The album as stored, with its `updated_at`. */
function albumRow(model: Model, id: string): AlbumRow | null {
  return (model.raw.albums ?? []).find((row) => row.id === id && !row.deleted_at) ?? null;
}

/** One optional day, with the app's clear button. */
function DayField({ label, value, onChange }: { label: string; value: string | null; onChange: (value: string | null) => void }) {
  const t = useTranslations("dashboard.edit.album");
  return (
    <div className="min-w-0 flex-1">
      <span className="mb-1 block px-1 text-[11.5px] font-bold text-foreground-muted">{label}</span>
      <div className="relative">
        <input type="date" min={DAY_MIN} max={DAY_MAX} value={value ?? ""} onChange={(event) => onChange(event.target.value || null)} aria-label={label} className={`${INPUT} pr-10`} />
        {value ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label={`${t("clear")}: ${label}`}
            className="absolute right-3 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-background-subtle text-foreground-soft hover:text-foreground"
          >
            <svg viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Starts an album editor over on the phone's newer copy of the album after a conflict. */
function ReloadableAlbum({ trip, children }: { trip: Trip | null; children: (trip: Trip | null) => ReactNode }) {
  const { fullModel: model } = useDashboard();
  return (
    <Reloadable row={trip} fresh={(row) => (row ? model.trips.find((item) => item.id === row.id) : null)} at={(row) => (row ? albumRow(model, row.id)?.updated_at : null)}>
      {children}
    </Reloadable>
  );
}

/**
 * A new album (CreateAlbumScreen: name, optional dates, transactions) or an
 * album's details (EditAlbumDetailsScreen: name and dates). `trip` null means
 * a new one.
 */
export function AlbumEditor({ trip, onClose }: { trip: Trip | null; onClose: () => void }) {
  return <ReloadableAlbum trip={trip}>{(row) => <AlbumForm trip={row} onClose={onClose} />}</ReloadableAlbum>;
}

function AlbumForm({ trip, onClose }: { trip: Trip | null; onClose: () => void }) {
  const t = useTranslations("dashboard.edit.album");
  const te = useTranslations("dashboard.edit");
  const { fullModel: model } = useDashboard();
  const { run, busy, error, ready, clear, reload } = useEditRun();
  const formId = useId();
  // The album as stored when the editor opened: the draft starts from it, and
  // a save names its `updated_at`, so a change on the phone is not overwritten.
  const [row] = useState(() => (trip ? albumRow(model, trip.id) : null));

  const [name, setName] = useState(row?.name ?? "");
  const [startDate, setStartDate] = useState<string | null>(dayOf(row?.start_date));
  const [endDate, setEndDate] = useState<string | null>(dayOf(row?.end_date));
  const [selected, setSelected] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);
  const [touched, setTouched] = useState(false);
  const missingName = !name.trim();
  const badDates = (startDate !== null && !isDayKey(startDate)) || (endDate !== null && !isDayKey(endDate));
  const touch = () => clear();

  const save = async (event?: FormEvent) => {
    event?.preventDefault();
    setTouched(true);
    if (missingName || badDates || !ready || busy) return;
    const details: Details = { name: name.trim(), startDate, endDate };
    if (trip) {
      const op: AlbumOp = { entity: "module:album", op: "update", id: trip.id, at: row?.updated_at ?? null, album: details };
      if (await run([op], "album_update")) onClose();
      return;
    }
    const op: AlbumOp = { entity: "module:album", op: "create", album: { ...details, transactionIds: selected } };
    if (await run([op], "album_create")) {
      onClose();
    }
  };

  const place = trip?.place;
  return (
    <Sheet
      title={trip ? t("editTitle") : t("createTitle")}
      onClose={onClose}
      busy={busy}
      footer={
        <div className="flex gap-2">
          <CancelButton onClick={onClose} disabled={busy} />
          <SaveButton label={trip ? t("save") : t("create")} busy={busy} disabled={!ready || (touched && (missingName || badDates))} form={formId} />
        </div>
      }
    >
      <form id={formId} onSubmit={(event) => void save(event)} className="space-y-4">
        <EditBlocked />
        <Field label={t("name")} error={touched && missingName ? te("required") : null}>
          <input
            value={name}
            onChange={(event) => {
              touch();
              setName(event.target.value);
            }}
            placeholder={t("namePlaceholder")}
            maxLength={80}
            className={INPUT}
            data-autofocus
          />
        </Field>

        <div>
          <span className="mb-1.5 block px-1 text-[12.5px] font-bold text-foreground-soft">{t("dates")}</span>
          <div className="flex gap-2.5">
            <DayField
              label={t("startDate")}
              value={startDate}
              onChange={(value) => {
                touch();
                setStartDate(value);
              }}
            />
            <DayField
              label={t("endDate")}
              value={endDate}
              onChange={(value) => {
                touch();
                setEndDate(value);
              }}
            />
          </div>
        </div>

        {place ? (
          <Field label={t("location")}>
            <p className="flex h-12 items-center gap-2 rounded-2xl border border-border bg-background-subtle/60 px-4 text-[14.5px] text-foreground-soft">
              <span className="truncate">{place}</span>
            </p>
          </Field>
        ) : null}

        {!trip ? (
          <PickerRow
            label={t("addTransactions")}
            value={t("selectedCount", { count: selected.length })}
            onClick={() => setPicking(true)}
            placeholder={t("addTransactions")}
          />
        ) : null}

        {touched && badDates ? <p className="px-1 text-[12px] font-semibold text-error">{te("required")}</p> : null}
        <p className="px-1 text-[12px] leading-snug text-foreground-muted">{t("appOnlyHint")}</p>
        <EditError message={error} onReload={reload} />
      </form>

      {picking ? (
        <AlbumTransactionsPicker
          initial={selected}
          // A new album is a row of its own, plus each entry in it.
          touches={(ids) => 1 + ids.length}
          max={MAX_EDIT_ROWS - 1}
          title={t("addTransactions")}
          doneLabel={t("done")}
          onDone={(ids) => {
            touch();
            setSelected(ids);
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      ) : null}
    </Sheet>
  );
}

/**
 * The app's transaction picker for an album: expenses month by month, a tap
 * toggles one. `onDone` gets the picked ids; `busy`/`footer` let a caller save.
 */
function AlbumTransactionsPicker({
  initial,
  title,
  doneLabel,
  onDone,
  onClose,
  busy,
  disabled,
  touches,
  max = MAX_EDIT_ROWS,
  locked,
  noAdding = false,
  children,
}: {
  initial: string[];
  title: string;
  doneLabel: string;
  onDone: (ids: string[]) => void;
  onClose: () => void;
  busy?: boolean;
  disabled?: boolean;
  /** The rows saving these picks touches, for the batch's row limit. */
  touches: (picked: string[]) => number;
  /** The most entries the message names. */
  max?: number;
  /** Entries that cannot be unticked: the album's own shared bills, which are taken out of it in the app. */
  locked?: ReadonlySet<string>;
  /** A shared album takes no entries made elsewhere: entries can only be taken out. */
  noAdding?: boolean;
  children?: ReactNode;
}) {
  const t = useTranslations("dashboard.edit.album");
  const te = useTranslations("dashboard.edit");
  const tc = useTranslations("dashboard.common");
  const { fullModel: model } = useDashboard();
  const f = useFormat();
  const [picked, setPicked] = useState<string[]>(initial);
  const pickedSet = useMemo(() => new Set(picked), [picked]);

  const expenses = useMemo(() => model.txs.filter((tx) => tx.type === "expense"), [model]);
  const [month, setMonth] = useState(() => {
    // Open on the newest picked entry's month, else this month.
    const newest = initial.map((id) => model.txById.get(id)).filter((tx): tx is Tx => !!tx).sort((a, b) => b.date.getTime() - a.date.getTime())[0];
    return newest?.month ?? model.currentMonth;
  });
  const rows = useMemo(() => expenses.filter((tx) => tx.month === month).sort((a, b) => b.date.getTime() - a.date.getTime()), [expenses, month]);
  const toggle = (id: string) =>
    setPicked((current) =>
      current.includes(id) ? (locked?.has(id) ? current : current.filter((x) => x !== id)) : noAdding ? current : [...current, id],
    );
  const tooMany = touches(picked) > MAX_EDIT_ROWS;

  const arrow = (delta: number, label: string, path: string) => (
    <button
      type="button"
      onClick={() => setMonth((current) => shiftMonthKey(current, delta))}
      aria-label={label}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-foreground-soft hover:text-foreground"
    >
      <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden="true">
        <path d={path} />
      </svg>
    </button>
  );

  return (
    <Sheet
      title={title}
      onClose={onClose}
      busy={busy}
      wide
      footer={
        <div className="flex items-center gap-2">
          <span className="tabular mr-auto px-1 text-[13px] font-bold text-foreground-soft">{t("selectedCount", { count: picked.length })}</span>
          <CancelButton onClick={onClose} disabled={busy} />
          <SaveButton label={doneLabel} busy={Boolean(busy)} disabled={disabled || tooMany} onClick={() => onDone(picked)} />
        </div>
      }
    >
      <div className="space-y-3">
        {children}
        <div className="flex items-center justify-between gap-3">
          {arrow(-1, t("previous"), "m15 6-6 6 6 6")}
          <p className="text-[15px] font-extrabold text-foreground">{f.monthLong(month)}</p>
          {arrow(1, t("next"), "m9 6 6 6-6 6")}
        </div>
        {tooMany ? <EditError message={te("tooMany", { max })} /> : null}
        {rows.length === 0 ? (
          <p className="py-10 text-center text-[13px] text-foreground-muted">{t("noExpenses")}</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {rows.map((tx) => {
              const category = tx.categoryId ? model.categories.get(tx.categoryId) : null;
              const label = tx.note || category?.name || tc("uncategorized");
              const on = pickedSet.has(tx.id);
              const fixed = on ? !!locked?.has(tx.id) : noAdding;
              return (
                <li key={tx.id}>
                  <label
                    title={on && fixed ? te("groupBill") : undefined}
                    className={`flex items-center gap-3 rounded-xl px-2 py-2.5 ${fixed ? "cursor-default" : "cursor-pointer"} ${on ? "bg-primary/10" : "hover:bg-background-subtle"}`}
                  >
                    <input type="checkbox" checked={on} disabled={fixed} onChange={() => toggle(tx.id)} className="h-5 w-5 shrink-0 rounded-md accent-[var(--color-primary)] disabled:opacity-60" />
                    <CategoryGlyph icon={category?.icon} name={category?.name ?? label} color={category?.color} size={32} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-bold text-foreground">{label}</span>
                      <span className="block truncate text-[12px] text-foreground-soft">{f.day(tx.dayKey)}</span>
                    </span>
                    <span className="tabular shrink-0 text-[14px] font-bold text-foreground">{f.money(tx.amount)}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Sheet>
  );
}

/** The album's transactions, edited as AddAlbumTransactionsScreen does: what was added and what was removed. */
function AlbumTransactionsEditor({ trip, onClose }: { trip: Trip; onClose: () => void }) {
  return <ReloadableAlbum trip={trip}>{(row) => <AlbumTransactionsForm trip={row ?? trip} onClose={onClose} />}</ReloadableAlbum>;
}

function AlbumTransactionsForm({ trip: shown, onClose }: { trip: Trip; onClose: () => void }) {
  const t = useTranslations("dashboard.edit.album");
  const { fullModel: model } = useDashboard();
  const { run, busy, error, ready, reload } = useEditRun();
  // The album as it was when the picker opened: all of its entries (not only
  // those the page's filters show) and the `updated_at` the change names.
  const [base] = useState(() => ({
    txIds: (model.trips.find((item) => item.id === shown.id) ?? shown).txIds,
    at: albumRow(model, shown.id)?.updated_at ?? null,
  }));
  const changes = (ids: string[]) => {
    const before = new Set(base.txIds);
    const after = new Set(ids);
    return { add: ids.filter((id) => !before.has(id)), remove: base.txIds.filter((id) => !after.has(id)) };
  };
  const save = async (ids: string[]) => {
    if (!ready || busy) return;
    const { add, remove } = changes(ids);
    if (!add.length && !remove.length) {
      onClose();
      return;
    }
    const op: AlbumOp = { entity: "module:album", op: "transactions", id: shown.id, at: base.at, add, remove };
    if (await run([op], "album_transactions")) onClose();
  };
  const touches = (ids: string[]) => {
    const { add, remove } = changes(ids);
    return add.length + remove.length;
  };
  const locked = useMemo(() => albumGroupBillIds(model, shown.id), [model, shown.id]);
  return (
    <AlbumTransactionsPicker initial={base.txIds} touches={touches} locked={locked} noAdding={locked.size > 0} title={t("editTransactions")} doneLabel={t("save")} onDone={(ids) => void save(ids)} onClose={onClose} busy={busy} disabled={!ready}>
      <EditBlocked />
      <EditError message={error} onReload={reload} />
    </AlbumTransactionsPicker>
  );
}

/** The selected album's edit, transactions and delete buttons, as its detail screen's header has. */
export function AlbumActions({ trip }: { trip: Trip }) {
  const t = useTranslations("dashboard.edit.album");
  const te = useTranslations("dashboard.edit");
  const { fullModel: model } = useDashboard();
  const { run, busy, error, ready } = useEditRun();
  const [open, setOpen] = useState<"details" | "transactions" | "delete" | null>(null);
  // A shared album stops being shared (or is left) in the app before it is
  // deleted. One with no bills yet still offers it, and the phone says no.
  const shared = useMemo(() => albumGroupBillIds(model, trip.id).size > 0, [model, trip.id]);

  const remove = async () => {
    if (!ready || busy) return;
    const op: AlbumOp = { entity: "module:album", op: "delete", id: trip.id, at: albumRow(model, trip.id)?.updated_at ?? null };
    if (await run([op], "album_delete")) setOpen(null);
  };

  const button = (key: "details" | "transactions" | "delete", icon: string, label: string) => (
    <button
      type="button"
      onClick={() => setOpen(key)}
      disabled={busy}
      className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] font-bold transition-colors disabled:opacity-40 ${
        key === "delete" ? "border-border text-error hover:bg-error-soft" : "border-border text-foreground-soft hover:bg-background-subtle hover:text-foreground"
      }`}
    >
      <ClayImg name={icon} size={16} />
      {label}
    </button>
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        {button("details", "ui/pencil", t("editTitle"))}
        {button("transactions", "ui/checklist", t("editTransactions"))}
        {shared ? null : button("delete", "ui/trash", te("delete"))}
      </div>
      {open === "delete" ? (
        <Confirm
          title={t("deleteTitle")}
          body={t("deleteBody")}
          actions={[
            { label: te("cancel"), onClick: () => setOpen(null) },
            { label: te("delete"), tone: "danger", onClick: () => void remove(), disabled: !ready || busy },
          ]}
        />
      ) : null}
      <EditError message={error} />
      {open === "details" ? <AlbumEditor trip={trip} onClose={() => setOpen(null)} /> : null}
      {open === "transactions" ? <AlbumTransactionsEditor trip={trip} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

/**
 * The bulk bar's album menu: adds the selected expenses to an album, as the
 * app's "Add to album". Other entries are left out, as the app leaves them.
 */
export function AlbumBulkMenu({ selected, onDone }: { selected: Tx[]; onDone: () => void }) {
  const t = useTranslations("dashboard.edit.album");
  const { fullModel: model } = useDashboard();
  const { run, busy, error, ready } = useEditRun();
  const expenses = selected.filter((tx) => tx.type === "expense");
  const left = selected.length - expenses.length;

  const add = async (trip: Trip) => {
    if (!ready || busy) return;
    const have = new Set(trip.txIds);
    const ids = expenses.map((tx) => tx.id).filter((id) => !have.has(id));
    if (!ids.length) {
      onDone();
      return;
    }
    const op: AlbumOp = { entity: "module:album", op: "transactions", id: trip.id, at: albumRow(model, trip.id)?.updated_at ?? null, add: ids, remove: [] };
    if (await run([op], "album_transactions")) onDone();
  };

  if (!expenses.length) return <p className="p-3.5 text-[13px] leading-snug text-foreground-soft">{t("expensesOnly")}</p>;
  return (
    <div>
      <p className="border-b border-border px-3.5 py-2.5 text-[12.5px] leading-snug text-foreground-soft">
        {left > 0 ? t("expensesLeftOut", { count: left }) : t("expensesCount", { count: expenses.length })}
      </p>
      {model.trips.length === 0 ? (
        <p className="px-3.5 py-6 text-center text-[13px] text-foreground-muted">{t("noAlbums")}</p>
      ) : (
        <OptionMenu
          label={t("addToAlbum")}
          searchable={model.trips.length > 6}
          options={model.trips.map((trip) => ({
            value: trip.id,
            label: trip.name,
            icon: <ClayImg name="settings/albums" size={20} />,
            hint: t("transactionCount", { count: trip.txIds.length }),
            disabled: busy || !ready,
          }))}
          onSelect={(id) => {
            const trip = model.trips.find((item) => item.id === id);
            if (trip) void add(trip);
          }}
        />
      )}
      {error ? (
        <div className="border-t border-border p-2">
          <EditError message={error} />
        </div>
      ) : null}
    </div>
  );
}

/**
 * The Albums screen's controls: "Auto-add new transactions to" (the active
 * album), Reorder, and New Album after the free-plan check the app makes
 * before its create screen opens.
 */
export function AlbumToolbar({ onCreate }: { onCreate: () => void }) {
  const t = useTranslations("dashboard.edit.album");
  const tr = useTranslations("dashboard.edit.reorder");
  const paywall = usePaywall();
  const { fullModel: model, link } = useDashboard();
  const { run, busy, error, ready } = useEditRun();
  const [ordering, setOrdering] = useState(false);
  const rows = useMemo(() => albumRows(model), [model]);
  const activeId = rows.find((row) => row.is_active === 1)?.id ?? "";

  const create = () => {
    if (!link.pro && rows.length >= FREE_MAX_ALBUMS) {
      paywall("albums");
      return;
    }
    onCreate();
  };
  const setActive = (id: string) => {
    if (!ready || busy || id === activeId) return;
    const op: AlbumOp = { entity: "module:album", op: "active", id: id || null };
    void run([op], "album_active");
  };
  const reorder = async (ids: string[]) => {
    if (!ready || busy) return;
    const op: AlbumOp = { entity: "module:album", op: "reorder", ids };
    if (await run([op], "album_reorder")) setOrdering(false);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {rows.length ? (
          <label className="mr-auto flex min-w-0 items-center gap-2 text-[13px] font-semibold text-foreground-soft">
            <span className="truncate">{t("activeLabel")}</span>
            <Select value={activeId} onChange={(event) => setActive(event.target.value)} disabled={!ready || busy} aria-label={t("activeTitle")}>
              <option value="">{t("activeNone")}</option>
              {rows.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </Select>
          </label>
        ) : null}
        {rows.length > 1 ? (
          <button
            type="button"
            onClick={() => setOrdering(true)}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-card px-4 text-[13.5px] font-bold text-foreground-soft hover:text-foreground"
          >
            {tr("open")}
          </button>
        ) : null}
        <button
          type="button"
          onClick={create}
          className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-[13.5px] font-extrabold text-card shadow-[var(--shadow-soft)] hover:bg-primary-dark"
        >
          <ClayImg name="ui/plus" size={16} />
          {t("createTitle")}
        </button>
      </div>
      {!ordering ? <EditError message={error} /> : null}
      {ordering ? (
        <OrderSheet
          title={t("reorderTitle")}
          rows={rows.map((row) => ({ id: row.id, name: row.name, icon: <ClayImg name="settings/albums" size={24} /> }))}
          busy={busy}
          ready={ready}
          error={error}
          onSave={(ids) => void reorder(ids)}
          onClose={() => setOrdering(false)}
        />
      ) : null}
    </div>
  );
}
