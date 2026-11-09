"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useMemo, useState, type FormEvent } from "react";

import { CATEGORY_ICON_PATTERNS } from "@/lib/backup/category-icon-groups.generated";
import type { Category } from "@/lib/backup/model";
import type { CategoryFields } from "@/lib/cloud/edits";

import { useDashboard } from "../state";
import { CategoryGlyph } from "../ui";
import { CancelButton, categoryTree, Confirm, DeleteButton, EditBlocked, EditError, Field, INPUT, Reloadable, SaveButton, Sheet, useEditRun } from "./kit";
import { CategoryIconPickerSheet } from "./icon-picker";

type Flow = "expense" | "income";

/** The icon the app's editor starts a new top-level category on (DEFAULT_CATEGORY_ICONS[0]). */
const DEFAULT_ICON = "meal";

/** The app's suggestion for a name (utils/categoryIconMatcher.ts): the first pattern that matches. */
function suggestCategoryIcon(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  return CATEGORY_ICON_PATTERNS.find(([, pattern]) => pattern.test(trimmed))?.[0] ?? null;
}

/** Which of the app's delete alerts is showing. */
type Asking = null | "delete" | "hasTransactions" | { moveTo: string };

/**
 * Adds a category or edits or deletes one: the app's category editor on the
 * web. Icon and name on one row, then an optional parent (one level only, of
 * the same type). `category` null means a new one of `type`, under `parentId`
 * when given. The type never changes here, as in the app. After a conflict it
 * can start over on the phone's newer copy.
 */
export function CategoryEditor({ category, type, parentId = null, onClose }: { category: Category | null; type: Flow; parentId?: string | null; onClose: () => void }) {
  const { fullModel: model } = useDashboard();
  return (
    <Reloadable row={category} fresh={(row) => {
        // A category deleted on the phone has nothing to reload into.
        const latest = row ? model.categories.get(row.id) : null;
        return latest && !latest.deleted ? latest : null;
      }} at={(row) => row?.updatedAt}>
      {(row) => <CategoryForm category={row} type={type} parentId={parentId} onClose={onClose} />}
    </Reloadable>
  );
}

function CategoryForm({ category, type, parentId, onClose }: { category: Category | null; type: Flow; parentId: string | null; onClose: () => void }) {
  const t = useTranslations("dashboard.edit.category");
  const { fullModel: model } = useDashboard();
  const { run, busy, error, ready, clear, reload } = useEditRun();
  const formId = useId();
  const kind: Flow = category?.type ?? type;

  const initial = useMemo(() => ({ name: category?.name ?? "", icon: category ? (category.icon ?? "") : parentId ? "" : DEFAULT_ICON, parentId: category ? category.parentId : parentId }), [category, parentId]);
  const [name, setName] = useState(initial.name);
  const [icon, setIcon] = useState(initial.icon);
  const [parent, setParent] = useState<string | null>(initial.parentId);
  // A new category's icon follows its name until one is picked, as in the app.
  const [iconPicked, setIconPicked] = useState(Boolean(category));
  useEffect(() => {
    if (iconPicked || parent !== null) return;
    const timer = setTimeout(() => {
      const suggested = suggestCategoryIcon(name);
      if (suggested) setIcon(suggested);
    }, 400);
    return () => clearTimeout(timer);
  }, [name, iconPicked, parent]);
  const [picker, setPicker] = useState<"icon" | "parent" | "reassign" | null>(null);
  const [asking, setAsking] = useState<Asking>(null);
  const [touched, setTouched] = useState(false);
  const change = (apply: () => void) => {
    clear();
    apply();
  };

  const live = useMemo(() => [...model.categories.values()].filter((c) => !c.deleted && c.type === kind), [model, kind]);
  // A category with children cannot become one: two levels at most.
  const hasChildren = category ? live.some((c) => c.parentId === category.id) : false;
  // Parents to offer: top-level categories of this type, never itself.
  const parents = useMemo(() => categoryTree(model, kind).map((node) => node.parent).filter((c) => !c.deleted && !c.parentId && c.id !== category?.id), [model, kind, category]);
  const selectedParent = parent ? (model.categories.get(parent) ?? null) : null;
  const used = useMemo(() => (category ? model.txs.filter((tx) => tx.categoryId === category.id).length : 0), [model, category]);
  const canReassign = category ? live.some((c) => c.id !== category.id) : false;

  const trimmed = name.trim();
  const missingName = !trimmed;

  const save = async () => {
    setTouched(true);
    if (missingName || !ready || busy) return;
    if (!category) {
      const fields: CategoryFields = { name: trimmed, type: kind, parentId: parent, icon: icon.trim() };
      if (await run([{ entity: "category", op: "create", category: fields }], "category_create")) onClose();
      return;
    }
    const set: CategoryFields = {};
    if (trimmed !== category.name) set.name = trimmed;
    if (icon.trim() !== (category.icon ?? "")) set.icon = icon.trim();
    if (!hasChildren && parent !== category.parentId) set.parentId = parent;
    if (!Object.keys(set).length) {
      onClose();
      return;
    }
    if (await run([{ entity: "category", op: "update", id: category.id, at: category.updatedAt, set }], "category_update")) onClose();
  };

  const remove = async (reassignTo?: string) => {
    if (!category || !ready || busy) return;
    const ok = await run(
      [{ entity: "category", op: "delete", id: category.id, at: category.updatedAt, ...(reassignTo ? { reassignTo } : {}) }],
      "category_delete",
    );
    if (ok) onClose();
    else setAsking(null);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void save();
  };

  const moveName = asking && typeof asking === "object" ? (model.categories.get(asking.moveTo)?.name ?? "") : "";

  return (
    <Sheet
      busy={busy}
      onClose={onClose}
      title={category ? t("editTitle") : t("newTitle")}
      headerAction={category ? <DeleteButton label={t("delete")} onClick={() => setAsking(used > 0 ? "hasTransactions" : "delete")} disabled={busy} /> : null}
      footer={
        <div className="flex gap-2">
          <CancelButton onClick={onClose} disabled={busy} />
          <SaveButton label={t("save")} busy={busy} disabled={!ready || missingName || asking !== null} form={formId} />
        </div>
      }
    >
      <form id={formId} onSubmit={submit} className="space-y-4">
        {asking === "delete" ? (
          <Confirm
            title={t("delete")}
            body={t("deleteConfirm")}
            actions={[
              { label: t("cancel"), onClick: () => setAsking(null) },
              { label: t("delete"), tone: "danger", onClick: () => void remove(), disabled: !ready || busy },
            ]}
          />
        ) : asking === "hasTransactions" ? (
          <Confirm
            title={t("deleteTitle")}
            body={t("deleteHasTransactions", { count: used })}
            actions={[
              { label: t("cancel"), onClick: () => setAsking(null) },
              ...(canReassign ? [{ label: t("moveToOther"), tone: "primary" as const, onClick: () => setPicker("reassign"), disabled: !ready || busy }] : []),
              { label: t("deleteAnyway"), tone: "danger", onClick: () => void remove(), disabled: !ready || busy },
            ]}
          />
        ) : asking ? (
          <Confirm
            title={t("moveTitle")}
            body={t("moveBody", { name: moveName })}
            actions={[
              { label: t("cancel"), onClick: () => setAsking(null) },
              { label: t("moveAction"), tone: "danger", onClick: () => void remove(asking.moveTo), disabled: !ready || busy },
            ]}
          />
        ) : null}

        {/* Icon and name share a row, as in the app. */}
        <div className="flex items-end gap-3">
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setPicker("icon")}
              aria-label={t("chooseIcon")}
              title={t("chooseIcon")}
              className="flex h-[54px] w-[54px] items-center justify-center rounded-[22px] border border-border bg-card transition hover:bg-background-subtle"
            >
              {icon ? (
                <CategoryGlyph icon={icon} name={trimmed || "?"} size={32} />
              ) : (
                <svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-foreground-muted">
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7M16 5h6M19 2v6" />
                  <circle cx="9" cy="9" r="2" />
                  <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
                </svg>
              )}
            </button>
            {icon ? (
              <button
                type="button"
                onClick={() =>
                  change(() => {
                    setIconPicked(true);
                    setIcon("");
                  })
                }
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
                value={name}
                maxLength={200}
                aria-invalid={touched && missingName}
                onChange={(event) => change(() => setName(event.target.value))}
                className={`${INPUT} ${touched && missingName ? "border-error/60" : ""}`}
              />
            </Field>
          </div>
        </div>
        {touched && missingName ? <p className="-mt-2 px-1 text-[12px] font-semibold text-error">{t("required")}</p> : null}

        {hasChildren ? null : (
          <Field label={t("parentOptional")}>
            <div className="flex items-center rounded-2xl border border-border bg-background-subtle/60">
              <button type="button" onClick={() => setPicker("parent")} aria-label={t("parentOptional")} className="flex min-h-12 min-w-0 flex-1 items-center gap-2 px-4 py-2.5 text-left">
                {selectedParent?.icon ? <CategoryGlyph icon={selectedParent.icon} name={selectedParent.name} size={20} /> : null}
                <span className={`truncate text-[14.5px] ${selectedParent ? "font-bold text-foreground" : "text-foreground-muted"}`}>{selectedParent ? selectedParent.name : t("select")}</span>
              </button>
              {selectedParent ? (
                <button type="button" onClick={() => change(() => setParent(null))} aria-label={t("clear")} title={t("clear")} className="px-4 py-3 text-foreground-muted hover:text-foreground">
                  <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden="true">
                    <path d="M6 6l12 12M18 6 6 18" />
                  </svg>
                </button>
              ) : (
                <span className="pr-4 text-foreground-muted" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </span>
              )}
            </div>
          </Field>
        )}

        <EditError message={error} onReload={reload} />
        <EditBlocked />
      </form>

      {picker === "icon" ? <CategoryIconPickerSheet value={icon} onChange={(next) =>
            change(() => {
              setIconPicked(true);
              setIcon(next);
            })
          } onClose={() => setPicker(null)} /> : null}
      {picker === "parent" ? (
        <CategoryListSheet
          title={t("parentOptional")}
          options={parents.map((c) => ({ category: c, children: [] }))}
          value={parent}
          onPick={(id) => {
            change(() => setParent(id));
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
      ) : null}
      {picker === "reassign" && category ? (
        <CategoryListSheet
          title={t("moveToOther")}
          options={categoryTree(model, kind)
            .filter((node) => !node.parent.deleted)
            .flatMap((node) => {
              const children = node.children.filter((c) => !c.deleted && c.id !== category.id);
              // The edited category's own children stand on their own once it goes.
              if (node.parent.id === category.id) return children.map((c) => ({ category: c, children: [] }));
              return [{ category: node.parent, children }];
            })}
          value={null}
          onPick={(id) => {
            setPicker(null);
            setAsking({ moveTo: id });
          }}
          onClose={() => setPicker(null)}
        />
      ) : null}
    </Sheet>
  );
}

/** The app's category picker with parents selectable: each parent, its children under it. */
function CategoryListSheet({
  title,
  options,
  value,
  onPick,
  onClose,
}: {
  title: string;
  options: { category: Category; children: Category[] }[];
  value: string | null;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations("dashboard.edit.category");
  const row = (category: Category, child: boolean) => {
    const active = category.id === value;
    return (
      <button
        key={category.id}
        type="button"
        aria-pressed={active}
        onClick={() => onPick(category.id)}
        className={`flex w-full min-w-0 items-center gap-2.5 rounded-2xl border px-3 text-left transition-colors ${child ? "py-2.5 text-[13.5px] font-semibold" : "py-3 text-[14px] font-bold"} ${
          active ? "border-primary/30 bg-primary/15 text-primary-dark" : "border-transparent bg-background-subtle/70 text-foreground hover:bg-background-subtle"
        }`}
      >
        <CategoryGlyph icon={category.icon} name={category.name} color={category.color} size={child ? 18 : 22} />
        <span className="min-w-0 flex-1 truncate">{category.name}</span>
      </button>
    );
  };
  return (
    <Sheet title={title} onClose={onClose}>
      {options.length ? (
        <div className="space-y-2">
          {options.map(({ category, children }) => (
            <div key={category.id} className="space-y-1.5">
              {row(category, false)}
              {children.length ? <div className="ml-6 space-y-1.5">{children.map((c) => row(c, true))}</div> : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="py-6 text-center text-[13px] text-foreground-muted">{t("noOptions")}</p>
      )}
    </Sheet>
  );
}
