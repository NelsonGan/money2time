"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import type { Category } from "@/lib/backup/model";

import { CategoryEditor } from "../edit/category-editor";
import { CategoryIconPickerSheet } from "../edit/icon-picker";
import { CategoriesReorderSheet } from "../edit/reorder";
import { EditError, categoryTree, useEditRun } from "../edit/kit";
import { EditUnavailable } from "../editing";
import { usePaywall } from "../paywall";
import { FREE_MAX_CATEGORIES } from "../pro-limits";
import { offersEdits, useDashboard } from "../state";
import { CategoryGlyph, Card, ClayImg, Empty, Segmented } from "../ui";

type Flow = "expense" | "income";

/** What the editor is open on: a category, or a new one of a type (under a parent). */
type Editing = {
  category: Category | null;
  type: Flow;
  parentId: string | null;
};

/**
 * The app's Categories screen: Expense and Income, each top-level category with
 * its subcategories under it. While the phone is connected, a category opens in
 * the editor, its icon changes in place, and new ones can be added.
 */
export function CategoriesView() {
  const t = useTranslations("dashboard.edit.category");
  const { fullModel: model, link } = useDashboard();
  const editable =
    offersEdits(link.editing);
  const ready = link.editing === "ready";
  const paywall = usePaywall();
  const { run, busy, error } = useEditRun();
  const [type, setType] = useState<Flow>("expense");
  const [editing, setEditing] = useState<Editing | null>(null);
  const [iconFor, setIconFor] = useState<Category | null>(null);
  const [reordering, setReordering] = useState(false);
  const tReorder = useTranslations("dashboard.edit.reorder");
  // Parents whose subcategories show, as the app's list: all collapsed at first.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const toggle = (id: string, open?: boolean) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (open ?? !next.has(id)) next.add(id);
      else next.delete(id);
      return next;
    });
  /** The app's free-plan check before a new category opens: every live category, both types. */
  const create = (parentId: string | null) => {
    const live = [...model.categories.values()].filter((c) => !c.deleted).length;
    if (!link.pro && live >= FREE_MAX_CATEGORIES) {
      paywall("categories");
      return;
    }
    // As in the app, adding a subcategory opens its parent's panel.
    if (parentId) toggle(parentId, true);
    setEditing({ category: null, type, parentId });
  };

  const tree = useMemo(
    () =>
      categoryTree(model, type)
        .filter((node) => !node.parent.deleted)
        .map((node) => ({
          parent: node.parent,
          children: node.children.filter((child) => !child.deleted),
        })),
    [model, type],
  );

  /** The app saves a new icon picked from the list straight away. */
  const saveIcon = (category: Category, icon: string) => {
    if (icon === (category.icon ?? "")) return;
    void run(
      [
        {
          entity: "category",
          op: "update",
          id: category.id,
          at: category.updatedAt,
          set: { icon },
        },
      ],
      "category_update",
    );
  };

  const open = (category: Category) =>
    editable &&
    ready &&
    setEditing({ category, type: category.type, parentId: category.parentId });
  const can = editable && ready && !busy;

  const iconButton = (category: Category, size: number) =>
    editable ? (
      <button
        type="button"
        onClick={() => setIconFor(category)}
        disabled={!can}
        aria-label={`${t("chooseIcon")}: ${category.name}`}
        title={t("chooseIcon")}
        className="inline-flex shrink-0 items-center justify-center rounded-xl p-1 transition hover:bg-background-subtle disabled:hover:bg-transparent"
      >
        <CategoryGlyph
          icon={category.icon}
          name={category.name}
          color={category.color}
          size={size}
        />
      </button>
    ) : (
      <span className="inline-flex shrink-0 p-1">
        <CategoryGlyph
          icon={category.icon}
          name={category.name}
          color={category.color}
          size={size}
        />
      </span>
    );

  const name = (category: Category, className: string) =>
    editable ? (
      <button
        type="button"
        onClick={() => open(category)}
        disabled={!can}
        className={`min-w-0 flex-1 truncate text-left hover:underline disabled:no-underline ${className}`}
      >
        {category.name}
      </button>
    ) : (
      <span className={`min-w-0 flex-1 truncate ${className}`}>
        {category.name}
      </span>
    );

  return (
    <div className="space-y-5">
      <EditUnavailable state={link.editing} />

      <Card>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Segmented
            label={t("type")}
            value={type}
            onChange={setType}
            options={[
              { value: "expense", label: t("expense") },
              { value: "income", label: t("income") },
            ]}
          />
          {editable ? (
            <button
              type="button"
              onClick={() => setReordering(true)}
              disabled={!can || !tree.length}
              className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-4 text-[13px] font-extrabold text-foreground-soft hover:text-foreground disabled:opacity-50"
            >
              {tReorder("open")}
            </button>
          ) : null}
          {editable ? (
            <button
              type="button"
              onClick={() => create(null)}
              disabled={!can}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-[13px] font-extrabold text-card shadow-[var(--shadow-soft)] hover:bg-primary-dark disabled:opacity-50"
            >
              <ClayImg name="ui/plus" size={16} />
              {t("newTitle")}
            </button>
          ) : null}
        </div>

        {error ? (
          <div className="mb-3">
            <EditError message={error} />
          </div>
        ) : null}

        {tree.length ? (
          <ul className="space-y-2">
            {tree.map(({ parent, children }) => {
              const isOpen = expanded.has(parent.id);
              return (
                <li
                  key={parent.id}
                  className={`rounded-[20px] border bg-card ${isOpen ? "border-primary/40" : "border-primary/15"}`}
                >
                  <div className="flex items-center gap-2 px-3 py-2">
                    <button
                      type="button"
                      onClick={() => toggle(parent.id)}
                      aria-expanded={isOpen}
                      aria-label={`${isOpen ? t("collapse") : t("expand")}: ${parent.name}`}
                      title={isOpen ? t("collapse") : t("expand")}
                      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-background-subtle ${isOpen ? "text-primary" : "text-foreground-muted"}`}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width={18}
                        height={18}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2.4}
                        strokeLinecap="round"
                        aria-hidden="true"
                        className={`transition-transform ${isOpen ? "rotate-90" : ""}`}
                      >
                        <path d="m9 6 6 6-6 6" />
                      </svg>
                    </button>
                    {iconButton(parent, 26)}
                    {name(parent, "text-[15px] font-bold text-foreground")}
                    {editable ? (
                      <>
                        <button
                          type="button"
                          onClick={() => create(parent.id)}
                          disabled={!can}
                          aria-label={`${t("addSubcategory")}: ${parent.name}`}
                          title={t("addSubcategory")}
                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary hover:bg-primary/20 disabled:opacity-50"
                        >
                          <svg
                            viewBox="0 0 24 24"
                            width={16}
                            height={16}
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2.4}
                            strokeLinecap="round"
                            aria-hidden="true"
                          >
                            <path d="M12 5v14M5 12h14" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => open(parent)}
                          disabled={!can}
                          aria-label={`${t("editTitle")}: ${parent.name}`}
                          title={t("editTitle")}
                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-foreground-soft hover:bg-background-subtle disabled:opacity-50"
                        >
                          <ClayImg name="ui/pencil" size={18} />
                        </button>
                      </>
                    ) : null}
                  </div>
                  {isOpen ? (
                    children.length ? (
                      <ul className="mx-2 mb-2 grid gap-1.5 rounded-2xl bg-primary/[0.06] p-1.5 sm:grid-cols-2">
                        {children.map((child) => (
                          <li
                            key={child.id}
                            className="flex min-w-0 items-center gap-1.5 rounded-xl border border-primary/15 bg-card px-2 py-1.5"
                          >
                            {iconButton(child, 18)}
                            {name(
                              child,
                              "text-[13.5px] font-semibold text-foreground",
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mx-2 mb-2 rounded-2xl bg-primary/[0.06] px-3 py-2.5 text-[13px] text-foreground-muted">
                        {t("noSubcategories")}
                      </p>
                    )
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty title={t("emptyTitle")} mascot="thinking" />
        )}
      </Card>

      {editing ? (
        <CategoryEditor
          key={
            editing.category?.id ??
            `new-${editing.type}-${editing.parentId ?? ""}`
          }
          category={editing.category}
          type={editing.type}
          parentId={editing.parentId}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {reordering ? (
        <CategoriesReorderSheet
          key={type}
          type={type}
          onClose={() => setReordering(false)}
        />
      ) : null}
      {iconFor ? (
        <CategoryIconPickerSheet
          value={iconFor.icon ?? ""}
          onChange={(icon) => saveIcon(iconFor, icon)}
          onClose={() => setIconFor(null)}
        />
      ) : null}
    </div>
  );
}
