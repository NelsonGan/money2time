"use client";

import { useTranslations } from "next-intl";
import { useDeferredValue, useId, useMemo, useState, type FormEvent } from "react";

import type { Model } from "@/lib/backup/model";
import type { ItemRow } from "@/lib/backup/types";

import { usePaywall } from "../paywall";
import { FREE_MAX_ITEMS } from "../pro-limits";
import { useDashboard, useFormat } from "../state";
import { ClayImg, ItemArt } from "../ui";
import {
  CancelButton,
  Confirm,
  DAY_MAX,
  DAY_MIN,
  DeleteButton,
  EditBlocked,
  EditError,
  Field,
  INPUT,
  MAX_AMOUNT,
  Reloadable,
  Sheet,
  SaveButton,
  Toggle,
  evaluateAmount,
  formatAmountInput,
  isDayKey,
  phoneToday,
  useEditRun,
  dayOf,
} from "./kit";
import { ITEM_ICON_GROUPS } from "./item-icons.generated";
import { addedCurrencies } from "./currency-editor";
import { OrderSheet } from "./order-sheet";

/*
 * The app's item editor on the web (ItemEditorScreen): icon, name, purchase
 * price and currency, purchase date, "Mark as inactive" with its end date and
 * "I sold it" with its sale price, and a note. The phone saves the whole form,
 * as the app does on every save. Icons come from the app's item library;
 * uploading one is in the app, and an uploaded icon an item already has is kept.
 */

/** The whole form, as the phone's `module:item` op takes it. */
type ItemFields = {
  name: string;
  iconId: string | null;
  purchasePrice: number;
  currency: string;
  purchaseDate: string;
  endDate: string | null;
  salePrice: number | null;
  note: string;
};

type ItemOp =
  | { entity: "module:item"; op: "create"; item: ItemFields }
  | { entity: "module:item"; op: "update"; id: string; at: string | null; item: ItemFields }
  | { entity: "module:item"; op: "delete"; id: string; at: string | null }
  | { entity: "module:item"; op: "reorder"; ids: string[] };

/** The items as stored, with their `updated_at`, in the app's list order. */
export function itemRows(model: Model): ItemRow[] {
  return (model.raw.items ?? [])
    .filter((row) => !row.deleted_at)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name));
}

/**
 * The Items page's buttons: Add item, after the free-plan check the app makes
 * before its editor opens, and Reorder.
 */
export function ItemToolbar({ onCreate }: { onCreate: () => void }) {
  const t = useTranslations("dashboard.edit.item");
  const tr = useTranslations("dashboard.edit.reorder");
  const paywall = usePaywall();
  const { fullModel: model, link } = useDashboard();
  const { run, busy, error, ready } = useEditRun();
  const [ordering, setOrdering] = useState(false);
  const rows = useMemo(() => itemRows(model), [model]);
  const create = () => {
    if (!link.pro && rows.length >= FREE_MAX_ITEMS) {
      paywall("items");
      return;
    }
    onCreate();
  };
  const reorder = async (ids: string[]) => {
    if (!ready || busy) return;
    const op: ItemOp = { entity: "module:item", op: "reorder", ids };
    if (await run([op], "item_reorder")) setOrdering(false);
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
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
          {t("add")}
        </button>
      </div>
      {ordering ? (
        <OrderSheet
          title={t("reorderTitle")}
          rows={rows.map((row) => ({ id: row.id, name: row.name, icon: <ItemArt iconId={row.icon_id ?? null} name={row.name} size={28} /> }))}
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

/** What the editor holds while it is filled in; amounts and dates as typed. */
type Draft = {
  name: string;
  iconId: string | null;
  price: string;
  currency: string;
  purchaseDate: string;
  inactive: boolean;
  endDate: string;
  sold: boolean;
  salePrice: string;
  note: string;
};

/**
 * Adds an item, or edits or deletes one. `row` null means a new one. After a
 * conflict it can start over on the phone's newer copy.
 */
export function ItemEditor({ row, onClose }: { row: ItemRow | null; onClose: () => void }) {
  const { fullModel: model } = useDashboard();
  return (
    <Reloadable row={row} fresh={(current) => (current ? itemRows(model).find((item) => item.id === current.id) : null)} at={(current) => current?.updated_at}>
      {(current) => <ItemForm row={current} onClose={onClose} />}
    </Reloadable>
  );
}

function ItemForm({ row, onClose }: { row: ItemRow | null; onClose: () => void }) {
  const t = useTranslations("dashboard.edit.item");
  const te = useTranslations("dashboard.edit");
  const { fullModel: model } = useDashboard();
  const f = useFormat();
  const { run, busy, error, ready, clear, reload } = useEditRun();
  const formId = useId();

  const [draft, setDraft] = useState<Draft>(() => {
    const today = phoneToday();
    return {
      name: row?.name ?? "",
      iconId: row?.icon_id ?? null,
      price: row?.purchase_price != null ? formatAmountInput(row.purchase_price, f.locale) : "",
      currency: row?.currency || model.currency,
      purchaseDate: dayOf(row?.purchase_date) ?? today,
      inactive: row?.end_date != null,
      endDate: dayOf(row?.end_date) ?? today,
      sold: row?.sale_price != null,
      salePrice: row?.sale_price != null ? formatAmountInput(row.sale_price, f.locale) : "",
      note: row?.note ?? "",
    };
  });
  const set = (patch: Partial<Draft>) => {
    clear();
    setDraft((current) => ({ ...current, ...patch }));
  };
  const [picking, setPicking] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [touched, setTouched] = useState(false);

  // The main currency and the added ones, plus the item's own.
  const currencies = useMemo(() => [...new Set([model.currency, ...addedCurrencies(model), draft.currency])], [model, draft.currency]);
  const price = evaluateAmount(draft.price, f.locale);
  const sale = evaluateAmount(draft.salePrice, f.locale);
  const missing = {
    name: !draft.name.trim(),
    price: price === null || price < 0 || price > MAX_AMOUNT,
    purchaseDate: !isDayKey(draft.purchaseDate),
    endDate: draft.inactive && !isDayKey(draft.endDate),
    sale: draft.inactive && draft.sold && draft.salePrice.trim() !== "" && (sale === null || sale < 0 || sale > MAX_AMOUNT),
  };
  const invalid = Object.values(missing).some(Boolean);

  const save = async (event?: FormEvent) => {
    event?.preventDefault();
    setTouched(true);
    if (invalid || !ready || busy || price === null) return;
    // As the editor saves: no end date unless inactive, no sale price unless sold.
    const item: ItemFields = {
      name: draft.name.trim(),
      iconId: draft.iconId,
      purchasePrice: price,
      currency: draft.currency,
      purchaseDate: draft.purchaseDate,
      endDate: draft.inactive ? draft.endDate : null,
      salePrice: draft.inactive && draft.sold && sale !== null ? sale : null,
      note: draft.note.trim(),
    };
    const op: ItemOp = row ? { entity: "module:item", op: "update", id: row.id, at: row.updated_at ?? null, item } : { entity: "module:item", op: "create", item };
    if (await run([op], row ? "item_update" : "item_create")) onClose();
  };

  const remove = async () => {
    if (!row || !ready || busy) return;
    const op: ItemOp = { entity: "module:item", op: "delete", id: row.id, at: row.updated_at ?? null };
    if (await run([op], "item_delete")) onClose();
  };

  const dateInput = (value: string, onChange: (value: string) => void, label: string) => (
    <input type="date" min={DAY_MIN} max={DAY_MAX} value={value} onChange={(event) => onChange(event.target.value)} aria-label={label} className={INPUT} />
  );

  return (
    <Sheet
      title={row ? t("editTitle") : t("addTitle")}
      onClose={onClose}
      busy={busy}
      headerAction={row ? <DeleteButton label={te("delete")} onClick={() => setConfirmDelete(true)} disabled={busy} /> : null}
      footer={
        <div className="flex gap-2">
          <CancelButton onClick={onClose} disabled={busy} />
          <SaveButton label={t("save")} busy={busy} disabled={!ready || (touched && invalid)} form={formId} />
        </div>
      }
    >
      <form id={formId} onSubmit={(event) => void save(event)} className="space-y-4">
        <EditBlocked />
        {confirmDelete ? (
          <Confirm
            title={t("deleteTitle")}
            body={t("deleteMessage")}
            actions={[
              { label: te("cancel"), onClick: () => setConfirmDelete(false) },
              { label: te("delete"), tone: "danger", onClick: () => void remove(), disabled: !ready || busy },
            ]}
          />
        ) : null}

        <div className="flex justify-center">
          <button type="button" onClick={() => setPicking(true)} className="group flex flex-col items-center gap-2" aria-label={t("iconTitle")}>
            <span className="flex h-20 w-20 items-center justify-center rounded-[22px] border border-border bg-background-subtle/60 transition-colors group-hover:bg-background-subtle">
              <ItemArt iconId={draft.iconId} name={draft.name || "?"} size={64} />
            </span>
            <span className="text-[12.5px] font-bold text-primary">{t("chooseIcon")}</span>
          </button>
        </div>

        <Field label={t("name")} error={touched && missing.name ? te("required") : null}>
          <input value={draft.name} onChange={(event) => set({ name: event.target.value })} placeholder={t("namePlaceholder")} maxLength={80} className={INPUT} data-autofocus />
        </Field>

        <div className="flex gap-3">
          <div className="min-w-0 flex-1">
            <Field label={t("price")} error={touched && missing.price ? te("required") : null}>
              <input value={draft.price} onChange={(event) => set({ price: event.target.value })} inputMode="decimal" placeholder={formatAmountInput(0, f.locale)} className={`${INPUT} tabular`} />
            </Field>
          </div>
          <div className="w-[120px] shrink-0">
            <Field label={t("currency")}>
              <select value={draft.currency} onChange={(event) => set({ currency: event.target.value })} className={`${INPUT} cursor-pointer`}>
                {currencies.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>

        <Field label={t("purchaseDate")} error={touched && missing.purchaseDate ? te("required") : null}>
          {dateInput(draft.purchaseDate, (purchaseDate) => set({ purchaseDate }), t("purchaseDate"))}
        </Field>

        <Toggle checked={draft.inactive} onChange={(inactive) => set({ inactive })} label={t("markInactive")} hint={t("markInactiveHint")} />

        {draft.inactive ? (
          <>
            <Field label={t("endDate")} error={touched && missing.endDate ? te("required") : null}>
              {dateInput(draft.endDate, (endDate) => set({ endDate }), t("endDate"))}
            </Field>
            <Toggle checked={draft.sold} onChange={(sold) => set({ sold })} label={t("sold")} />
            {draft.sold ? (
              <Field label={t("salePrice")} error={touched && missing.sale ? te("required") : null}>
                <input value={draft.salePrice} onChange={(event) => set({ salePrice: event.target.value })} inputMode="decimal" placeholder={formatAmountInput(0, f.locale)} className={`${INPUT} tabular`} />
              </Field>
            ) : null}
          </>
        ) : null}

        <Field label={t("note")}>
          <textarea
            value={draft.note}
            onChange={(event) => set({ note: event.target.value })}
            placeholder={t("notePlaceholder")}
            maxLength={500}
            rows={3}
            className={`${INPUT} h-auto min-h-[88px] resize-y py-3`}
          />
        </Field>

        <EditError message={error} onReload={reload} />
      </form>

      {picking ? (
        <ItemIconPicker
          value={draft.iconId}
          keep={row?.icon_id?.startsWith("custom:") ? row.icon_id : null}
          onChange={(iconId) => {
            set({ iconId });
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      ) : null}
    </Sheet>
  );
}

type Icon = { id: string; name: string; group: string };

const ICONS: Icon[] = ITEM_ICON_GROUPS.flatMap(({ group, icons }) => icons.map(([id, name]) => ({ id, name, group })));

/** The app's item icon search: a name or id that starts with it, then a word that does, then anywhere. */
function searchIcons(query: string): Icon[] {
  const q = query.trim().toLowerCase();
  const scored: { icon: Icon; score: number }[] = [];
  for (const icon of ICONS) {
    const name = icon.name.toLowerCase();
    const id = icon.id.toLowerCase();
    const score = name.startsWith(q) || id.startsWith(q) ? 3 : name.includes(` ${q}`) || id.includes(`-${q}`) ? 2 : name.includes(q) || id.includes(q) ? 1 : -1;
    if (score >= 0) scored.push({ icon, score });
  }
  return scored.sort((a, b) => b.score - a.score || a.icon.name.localeCompare(b.icon.name)).map((entry) => entry.icon);
}

/** The app's item icon picker: its library by section, with search. An uploaded icon the item has can be kept. */
function ItemIconPicker({ value, keep, onChange, onClose }: { value: string | null; keep: string | null; onChange: (id: string) => void; onClose: () => void }) {
  const t = useTranslations("dashboard.edit.item");
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const found = useMemo(() => (deferred.trim() ? searchIcons(deferred) : null), [deferred]);

  const tile = (id: string, name: string) => {
    const active = id === value;
    return (
      <button
        key={id}
        type="button"
        onClick={() => onChange(id)}
        aria-pressed={active}
        aria-label={name}
        title={name}
        className={`flex aspect-square items-center justify-center rounded-2xl border transition-colors ${active ? "border-primary/30 bg-primary/15" : "border-transparent hover:bg-background-subtle"}`}
      >
        <ItemArt iconId={id} name={name} size={44} />
      </button>
    );
  };
  const grid = (icons: Icon[]) => <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-6">{icons.map((icon) => tile(icon.id, icon.name))}</div>;

  return (
    <Sheet title={t("iconTitle")} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-[12.5px] text-foreground-muted">{t("iconSubtitle")}</p>
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("searchIcons")} className={INPUT} data-autofocus />
        {keep && !found ? (
          <section>
            <h3 className="mb-2 px-1 text-[12px] font-extrabold uppercase tracking-wide text-foreground-muted">{t("customIcon")}</h3>
            <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-6">{tile(keep, t("customIcon"))}</div>
          </section>
        ) : null}
        {found ? (
          found.length ? (
            grid(found)
          ) : (
            <p className="py-8 text-center text-[13px] text-foreground-muted">{t("noResults")}</p>
          )
        ) : (
          ITEM_ICON_GROUPS.map(({ group }) => (
            <section key={group}>
              <h3 className="mb-2 px-1 text-[12px] font-extrabold uppercase tracking-wide text-foreground-muted">{t(`groups.${group}`)}</h3>
              {grid(ICONS.filter((icon) => icon.group === group))}
            </section>
          ))
        )}
      </div>
    </Sheet>
  );
}
