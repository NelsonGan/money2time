"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState, type ReactNode } from "react";

import type { Account, Model } from "@/lib/backup/model";

import { useDashboard } from "../state";
import { AccountLogo, CategoryGlyph } from "../ui";
import { CancelButton, EditBlocked, EditError, SaveButton, Sheet, categoryTree, useEditRun } from "./kit";
import { SortableList } from "./sortable";

/*
 * The app's drag-to-reorder on the web, by drag and drop: accounts within
 * their group and the groups themselves (the Accounts screen), and categories
 * at the top level and within a parent (the Categories screen). As in the app,
 * each list is saved whole: the phone's `module:reorder` op carries every id
 * of the list and is refused unless that is exactly the set it has
 * (services/webDashboardEditModules/reorder.ts).
 */

/** The ops the phone's reorder module reads. */
type ReorderOp =
  | { entity: "module:reorder"; op: "accounts" | "groups"; ids: string[] }
  | { entity: "module:reorder"; op: "categories"; type: "expense" | "income"; ids: string[] };

const same = (a: string[], b: string[]) => a.length === b.length && a.every((id, i) => id === b[i]);

/** The sheet both reorder editors share: the list, then Cancel and Save. */
function ReorderSheet({ title, hint, children, changed, busy, ready, error, onSave, onClose }: { title: string; hint: string; children: ReactNode; changed: boolean; busy: boolean; ready: boolean; error: string | null; onSave: () => void; onClose: () => void }) {
  const t = useTranslations("dashboard.edit.reorder");
  return (
    <Sheet
      busy={busy}
      onClose={onClose}
      title={title}
      footer={
        <div className="flex flex-wrap gap-2">
          <CancelButton onClick={onClose} disabled={busy} />
          <SaveButton label={t("save")} busy={busy} disabled={!ready || !changed} onClick={onSave} />
        </div>
      }
    >
      <div className="space-y-3">
        <p className="px-1 text-[13px] leading-snug text-foreground-soft">{hint}</p>
        {children}
        <EditError message={error} />
        <EditBlocked />
      </div>
    </Sheet>
  );
}

// ----------------------------------------------------------------- accounts --

type Section = { key: string; title: string; groupId: string | null; ids: string[] };

/**
 * The Accounts screen's sections, as it builds them for reordering: each
 * account group in its order (empty ones too), then names only accounts carry,
 * then ungrouped. Savings goals have their own list and are left out.
 */
function accountReorderSections(model: Model, ungrouped: string): Section[] {
  const accounts = model.accounts.filter((account) => account.type !== "goal");
  const byGroup = new Map<string, string[]>();
  for (const account of [...accounts].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const key = account.group?.trim() ?? "";
    byGroup.set(key, [...(byGroup.get(key) ?? []), account.id]);
  }
  const named = new Set(model.groups.map((group) => group.name));
  const sections: Section[] = model.groups.map((group) => ({ key: group.id, title: group.name, groupId: group.id, ids: byGroup.get(group.name) ?? [] }));
  for (const [name, ids] of byGroup) {
    if (name && !named.has(name)) sections.push({ key: `name:${name}`, title: name, groupId: null, ids });
  }
  const loose = byGroup.get("");
  if (loose?.length) sections.push({ key: "ungrouped", title: ungrouped, groupId: null, ids: loose });
  return sections;
}

/** Reorders accounts within their groups, and the groups. */
export function AccountsReorderSheet({ onClose }: { onClose: () => void }) {
  const t = useTranslations("dashboard.edit.reorder");
  const te = useTranslations("dashboard.edit");
  const { fullModel: model } = useDashboard();
  const { run, busy, error, ready, clear } = useEditRun();
  const initial = useMemo(() => accountReorderSections(model, te("ungrouped")), [model, te]);
  const [sections, setSections] = useState(initial);
  const byId = useMemo(() => new Map<string, Account>(model.accounts.map((account) => [account.id, account])), [model]);

  // Real groups move among themselves; the others stay after them, as in the app.
  const groups = sections.filter((section) => section.groupId);
  const statics = sections.filter((section) => !section.groupId);
  const groupIds = groups.map((section) => section.groupId as string);
  const accountIds = (list: Section[]) => list.flatMap((section) => section.ids);
  const groupsChanged = !same(groupIds, initial.filter((s) => s.groupId).map((s) => s.groupId as string));
  // Moving a group alone changes no account's place within its group.
  const accountsChanged = sections.some((section) => !same(section.ids, initial.find((item) => item.key === section.key)?.ids ?? []));
  const changed = groupsChanged || accountsChanged;

  const setGroups = (keys: string[]) => {
    clear();
    setSections([...keys.map((key) => groups.find((section) => section.key === key) as Section), ...statics]);
  };
  const setAccounts = (key: string, ids: string[]) => {
    clear();
    setSections((current) => current.map((section) => (section.key === key ? { ...section, ids } : section)));
  };

  const save = async () => {
    if (!changed || !ready || busy) return;
    const ops: ReorderOp[] = [];
    if (accountsChanged) ops.push({ entity: "module:reorder", op: "accounts", ids: accountIds(sections) });
    if (groupsChanged) ops.push({ entity: "module:reorder", op: "groups", ids: groupIds });
    const action = accountsChanged && groupsChanged ? "reorder_accounts_groups" : accountsChanged ? "reorder_accounts" : "reorder_groups";
    if (await run(ops, action)) onClose();
  };

  const nameOf = (id: string) => byId.get(id)?.name ?? id;
  const body = (section: Section, handle: ReactNode | null) => (
    <>
      <div className="flex items-center gap-2 py-2 pl-1.5 pr-3">
        {handle ?? <span className="w-6 shrink-0" />}
        <p className="min-w-0 flex-1 truncate text-[14.5px] font-extrabold text-foreground">{section.title}</p>
      </div>
      {section.ids.length ? (
        <SortableList
          ids={section.ids}
          onChange={(ids) => setAccounts(section.key, ids)}
          label={nameOf}
          disabled={busy}
          className="mx-2 mb-2 space-y-1 rounded-2xl bg-primary/[0.06] p-1.5"
          itemClassName="rounded-xl border border-primary/15 bg-card"
          renderItem={(id, grip) => {
            const account = byId.get(id);
            return (
              <div className="flex items-center gap-2 py-1.5 pl-1 pr-2.5">
                {grip}
                <AccountLogo logoId={account?.logoId ?? null} name={nameOf(id)} size={26} />
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-foreground">{nameOf(id)}</span>
              </div>
            );
          }}
        />
      ) : (
        <p className="mx-2 mb-2 rounded-2xl bg-primary/[0.06] px-3 py-2 text-[13px] text-foreground-muted">{t("emptyGroup")}</p>
      )}
    </>
  );
  const sectionClass = "rounded-[20px] border border-primary/15 bg-card";

  return (
    <ReorderSheet title={t("accountsTitle")} hint={t("accountsHint")} changed={changed} busy={busy} ready={ready} error={error} onSave={() => void save()} onClose={onClose}>
      {sections.length ? (
        <div className="space-y-2">
          <SortableList
            ids={groups.map((section) => section.key)}
            onChange={setGroups}
            label={(key) => groups.find((section) => section.key === key)?.title ?? key}
            disabled={busy}
            className="space-y-2"
            itemClassName={sectionClass}
            renderItem={(key, grip) => body(groups.find((section) => section.key === key) as Section, grip)}
          />
          {statics.length ? (
            <ul className="space-y-2">
              {statics.map((section) => (
                <li key={section.key} className={sectionClass}>
                  {body(section, null)}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : (
        <p className="px-1 text-[13px] text-foreground-muted">{te("noAccounts")}</p>
      )}
    </ReorderSheet>
  );
}

// --------------------------------------------------------------- categories --

type Node = { id: string; children: string[] };

/** Reorders one type's top-level categories, and the subcategories within each. */
export function CategoriesReorderSheet({ type, onClose }: { type: "expense" | "income"; onClose: () => void }) {
  const t = useTranslations("dashboard.edit.reorder");
  const te = useTranslations("dashboard.edit");
  const { fullModel: model } = useDashboard();
  const { run, busy, error, ready, clear } = useEditRun();
  const initial = useMemo<Node[]>(
    () =>
      // The tree holds live categories only.
      categoryTree(model, type).map((node) => ({ id: node.parent.id, children: node.children.map((child) => child.id) })),
    [model, type],
  );
  const [nodes, setNodes] = useState(initial);
  // Parents each followed by their children, as the app's list is saved.
  const flat = (list: Node[]) => {
    const ids = list.flatMap((node) => [node.id, ...node.children]);
    const seen = new Set(ids);
    for (const category of model.categories.values()) {
      if (category.type === type && !category.deleted && !seen.has(category.id)) ids.push(category.id);
    }
    return ids;
  };
  const changed = !same(flat(nodes), flat(initial));

  const setParents = (ids: string[]) => {
    clear();
    setNodes((current) => ids.map((id) => current.find((node) => node.id === id) as Node));
  };
  const setChildren = (parent: string, children: string[]) => {
    clear();
    setNodes((current) => current.map((node) => (node.id === parent ? { ...node, children } : node)));
  };
  const nameOf = (id: string) => model.categories.get(id)?.name ?? id;

  const save = async () => {
    if (!changed || !ready || busy) return;
    if (await run([{ entity: "module:reorder", op: "categories", type, ids: flat(nodes) }], "reorder_categories")) onClose();
  };

  return (
    <ReorderSheet title={t("categoriesTitle")} hint={t("categoriesHint")} changed={changed} busy={busy} ready={ready} error={error} onSave={() => void save()} onClose={onClose}>
      {nodes.length ? (
        <SortableList
          ids={nodes.map((node) => node.id)}
          onChange={setParents}
          label={nameOf}
          disabled={busy}
          className="space-y-2"
          itemClassName="rounded-[20px] border border-primary/15 bg-card"
          renderItem={(id, grip) => {
            const parent = model.categories.get(id);
            const children = nodes.find((node) => node.id === id)?.children ?? [];
            return (
              <>
                <div className="flex items-center gap-2 py-2 pl-1.5 pr-3">
                  {grip}
                  <CategoryGlyph icon={parent?.icon} name={nameOf(id)} color={parent?.color} size={24} />
                  <p className="min-w-0 flex-1 truncate text-[14.5px] font-bold text-foreground">{nameOf(id)}</p>
                </div>
                {children.length ? (
                  <SortableList
                    ids={children}
                    onChange={(next) => setChildren(id, next)}
                    label={nameOf}
                    disabled={busy}
                    className="mx-2 mb-2 space-y-1 rounded-2xl bg-primary/[0.06] p-1.5"
                    itemClassName="rounded-xl border border-primary/15 bg-card"
                    renderItem={(childId, childGrip) => {
                      const child = model.categories.get(childId);
                      return (
                        <div className="flex items-center gap-2 py-1 pl-1 pr-2.5">
                          {childGrip}
                          <CategoryGlyph icon={child?.icon} name={nameOf(childId)} color={child?.color} size={18} />
                          <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-foreground">{nameOf(childId)}</span>
                        </div>
                      );
                    }}
                  />
                ) : null}
              </>
            );
          }}
        />
      ) : (
        <p className="px-1 text-[13px] text-foreground-muted">{te("noCategories")}</p>
      )}
    </ReorderSheet>
  );
}
