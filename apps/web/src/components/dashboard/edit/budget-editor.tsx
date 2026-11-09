"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState, type ReactNode } from "react";

import { CATEGORY_ICON_IDS } from "@/lib/backup/assets.generated";
import { formatFxRate, latestBudgetRate, storedBudgetCurrency } from "@/lib/backup/budget-currency";
import { monthlyBudgetRows } from "@/lib/backup/budget-period";
import { shiftMonthKey } from "@/lib/backup/dates";
import type { BudgetMonth, Category, Model } from "@/lib/backup/model";

import { usePaywall } from "../paywall";
import { FREE_MAX_BUDGET_TEMPLATES } from "../pro-limits";
import { useDashboard, useFormat } from "../state";
import { CategoryGlyph, ClayImg, Select } from "../ui";
import { CategoryIconPickerSheet } from "./icon-picker";
import { SortableList } from "./sortable";
import {
  CancelButton,
  categoryTree,
  Confirm,
  EditBlocked,
  EditError,
  evaluateAmount,
  Field,
  formatAmountInput,
  INPUT,
  MAX_AMOUNT,
  phoneToday,
  Reloadable,
  SaveButton,
  Sheet,
  Toggle,
  useEditRun,
  settledAmount,
} from "./kit";

/*
 * Budgets on the web, after the app's budget editors: templates (Settings →
 * Budget templates: new, edit, duplicate, make default, delete) and the month
 * shown (edit, delete, or create it from a template or as a custom one-off).
 * Amounts are allocated the way the app's allocation editor allocates them:
 * root expense categories that add up exactly to the total, each with an
 * optional subcategory split that adds up exactly to its amount. The phone
 * checks every change against the same rules (services/webDashboardEditModules/budget.ts).
 * A template or month may be in another currency than the main one, picked
 * beside its total from the currencies the app's entry flows offer; every
 * amount in its editors is in that currency, and a save names it (null for
 * the main one) when it is new or changed; one left as it was is not named,
 * so the phone keeps it. Only a phone that takes a budget's currency
 * (`link.budgetCurrencies`) is offered the picker or sent one: an older app
 * refuses a field it does not know.
 */

// --------------------------------------------------------------------- ops --

type Line = { categoryId: string; amount: number };
type TemplateBody = { name: string; emoji: string | null; totalAmount: number; countUnbudgeted: boolean; allocations: Line[]; currency?: string | null };
type MonthBody = { totalAmount: number; countUnbudgeted: boolean; lines: Line[]; currency?: string | null };

/**
 * The `currency` a save names: none when the phone does not take one, or when
 * it is what the template or budget already has (`own`; a new one has the main
 * currency), so the phone keeps its own.
 */
function currencyField(takes: boolean, currency: string | null, own: string | null): { currency?: string | null } {
  return takes && currency !== own ? { currency } : {};
}

/** The `module:budget` ops the phone reads. */
type BudgetOp =
  | { entity: "module:budget"; op: "template_create"; template: TemplateBody & { backPopulate: boolean } }
  | { entity: "module:budget"; op: "template_update"; id: string; at: string | null; template: TemplateBody }
  | { entity: "module:budget"; op: "template_delete" | "template_default" | "month_delete"; id: string; at: string | null }
  | { entity: "module:budget"; op: "month_create"; month: string; templateId: string }
  | { entity: "module:budget"; op: "month_custom"; month: string; budget: MonthBody }
  | { entity: "module:budget"; op: "month_update"; id: string; at: string | null; budget: MonthBody };

const ENTITY = "module:budget" as const;

// -------------------------------------------------------------------- data --

type TemplateRow = { id: string; name?: string | null; emoji?: string | null; total_amount?: number | null; is_default?: number | boolean | null; count_unbudgeted?: number | boolean | null; sort_order?: number | null; period?: string | null; currency?: string | null; updated_at?: string | null; deleted_at?: string | null };
type TemplateLineRow = { id: string; template_id: string; category_id: string; amount: number; sort_order?: number | null; deleted_at?: string | null };
type MonthRow = { id: string; month: string; period?: string | null; updated_at?: string | null; deleted_at?: string | null };

/** A budget template as the app lists it. */
type BudgetTemplate = {
  id: string;
  name: string;
  emoji: string | null;
  total: number;
  isDefault: boolean;
  countUnbudgeted: boolean;
  lines: Line[];
  /** Null for the main currency. */
  currency: string | null;
  updatedAt: string | null;
};

function table<T>(model: Model, name: string): T[] {
  const rows = (model.raw as unknown as Record<string, unknown>)[name];
  return Array.isArray(rows) ? (rows as T[]) : [];
}

const flag = (value: number | boolean | null | undefined, fallback: boolean) => (value === null || value === undefined ? fallback : Boolean(value));

/** Live templates, in the app's order (sort order, then name). */
function budgetTemplates(model: Model): BudgetTemplate[] {
  const lines = new Map<string, TemplateLineRow[]>();
  for (const row of table<TemplateLineRow>(model, "budget_template_categories")) {
    if (row.deleted_at) continue;
    const list = lines.get(row.template_id);
    if (list) list.push(row);
    else lines.set(row.template_id, [row]);
  }
  return monthlyBudgetRows(table<TemplateRow>(model, "budget_templates"))
    .filter((row) => !row.deleted_at)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || (a.name ?? "").localeCompare(b.name ?? ""))
    .map((row) => ({
      id: row.id,
      name: row.name ?? "",
      emoji: row.emoji || null,
      total: row.total_amount ?? 0,
      isDefault: flag(row.is_default, false),
      countUnbudgeted: flag(row.count_unbudgeted, true),
      lines: (lines.get(row.id) ?? []).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).map((line) => ({ categoryId: line.category_id, amount: line.amount })),
      currency: storedBudgetCurrency(row.currency, model.currency),
      updatedAt: row.updated_at ?? null,
    }));
}

/** A month budget's `updated_at`, which an edit names. */
function budgetUpdatedAt(model: Model, id: string): string | null {
  return monthlyBudgetRows(table<MonthRow>(model, "monthly_budgets")).find((row) => row.id === id)?.updated_at ?? null;
}

const round = (value: number) => Math.round(value * 100) / 100 || 0;

/** An amount as typed, or 0 when it is empty, not one, or not above zero. */
function positiveAmount(text: string | undefined, locale: string): number {
  const value = text ? evaluateAmount(text, locale) : null;
  return value !== null && value > 0 ? value : 0;
}

/**
 * An icon a new template may carry from the one it copies: an emoji or one of
 * the default pack. The app's other packs and uploads are Pro and app-only,
 * so the phone takes them only on the template that already has them.
 */
function copiedIcon(icon: string | null): string | null {
  if (!icon) return null;
  return icon.startsWith("emoji:") || (!icon.includes("/") && CATEGORY_ICON_IDS.has(icon)) ? icon : null;
}

/**
 * Past months a back-fill would create, as the app works them out: from the
 * calendar month of the first expense to last month, skipping months that have
 * or ever had a budget.
 */
function backFillRange(model: Model): string[] {
  let first: string | null = null;
  for (const tx of model.txs) {
    if (tx.type !== "expense") continue;
    const month = tx.dayKey.slice(0, 7);
    if (!first || month < first) first = month;
  }
  const current = phoneToday().slice(0, 7);
  if (!first || first >= current) return [];
  const taken = new Set(monthlyBudgetRows(table<MonthRow>(model, "monthly_budgets")).map((row) => row.month));
  const months: string[] = [];
  for (let month = first; month < current && months.length < 1200; month = shiftMonthKey(month, 1)) {
    if (!taken.has(month)) months.push(month);
  }
  return months;
}

/**
 * The months the app's budget pager offers: the first budget or expense month to a year ahead.
 * The app's range also stretches for weekly and yearly budgets, which the dashboard never sees,
 * so this can be shorter than the app's but never offers a month the app would refuse.
 */
function budgetMonths(model: Model): string[] {
  let first = model.currentMonth;
  let last = shiftMonthKey(model.currentMonth, 12);
  for (const budget of model.budgets) {
    if (budget.month < first) first = budget.month;
    if (budget.month > last) last = budget.month;
  }
  for (const tx of model.txs) if (tx.type === "expense" && tx.month < first) first = tx.month;
  const months: string[] = [];
  for (let month = first; month <= last && months.length < 1200; month = shiftMonthKey(month, 1)) months.push(month);
  return months;
}

/** Root allocations only: a subcategory split is part of its parent's amount. */
function rootCount(model: Model, lines: Line[]): number {
  return lines.filter((line) => !model.categories.get(line.categoryId)?.parentId).length;
}

// -------------------------------------------------------------- allocation --

/**
 * The app's allocation draft: the total, an amount per category, and whether
 * it may be saved. Until a total is typed it follows what is allocated, so
 * filling in categories first builds the budget.
 */
function useAllocationDraft(model: Model, seed: { total: number | null; lines: Line[] }) {
  const f = useFormat();
  const tree = useMemo(() => categoryTree(model, "expense").filter((node) => !node.parent.deleted && !node.parent.parentId), [model]);
  const children = useMemo(() => new Map(tree.map((node) => [node.parent.id, node.children.filter((c) => !c.deleted)])), [tree]);
  // The root order the user arranged: seeded from the saved lines; the saved
  // budget keeps it, as the app's drag-to-reorder list does.
  const [order, setOrder] = useState<string[]>(() => seed.lines.map((line) => line.categoryId));
  // Roots in that order, then any others in the app's order.
  const roots = useMemo(() => {
    const byId = new Map(tree.map((node) => [node.parent.id, node.parent]));
    const ordered: Category[] = [];
    for (const id of order) {
      const category = byId.get(id);
      if (category && !ordered.includes(category)) ordered.push(category);
    }
    for (const node of tree) if (!ordered.includes(node.parent)) ordered.push(node.parent);
    return ordered;
  }, [tree, order]);

  const [total, setTotalText] = useState(seed.total !== null ? formatAmountInput(seed.total, f.locale) : "");
  const [touched, setTouched] = useState(seed.total !== null);
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(seed.lines.filter((line) => line.amount > 0).map((line) => [line.categoryId, formatAmountInput(line.amount, f.locale)])),
  );
  const parse = (text: string | undefined) => positiveAmount(text, f.locale);

  const rootLines = roots.map((category) => ({ categoryId: category.id, amount: parse(amounts[category.id]) })).filter((line) => line.amount > 0);
  const allocated = round(rootLines.reduce((sum, line) => sum + line.amount, 0));
  const typed = parse(total);
  const parsedTotal = typed > 0 ? typed : allocated;
  const remaining = round(parsedTotal - allocated);
  const gaps = new Set<string>();
  for (const line of rootLines) {
    const kids = (children.get(line.categoryId) ?? []).map((child) => parse(amounts[child.id]));
    const split = kids.reduce((sum, value) => sum + value, 0);
    if (split > 0 && round(line.amount - split) !== 0) gaps.add(line.categoryId);
  }
  // The phone saves amounts up to its MAX_AMOUNT.
  const valid = parsedTotal > 0 && parsedTotal <= MAX_AMOUNT && rootLines.length > 0 && remaining === 0 && gaps.size === 0;

  const build = (): Line[] => {
    const out = [...rootLines];
    for (const line of rootLines) {
      for (const child of children.get(line.categoryId) ?? []) {
        const amount = parse(amounts[child.id]);
        if (amount > 0) out.push({ categoryId: child.id, amount });
      }
    }
    return out;
  };

  return {
    total: touched ? total : allocated > 0 ? formatAmountInput(allocated, f.locale) : "",
    setTotal: (text: string) => {
      setTouched(true);
      setTotalText(text);
    },
    parsedTotal,
    remaining,
    roots,
    children,
    amounts,
    merge: (next: Record<string, string>) => setAmounts((previous) => ({ ...previous, ...next })),
    /** Puts the root categories in this order. */
    reorder: (ids: string[]) => setOrder(ids),
    amountOf: (id: string) => parse(amounts[id]),
    gaps,
    valid,
    build,
  };
}

type Draft = ReturnType<typeof useAllocationDraft>;

/** The allocation bar the app pins above Save: how much of the total is placed. */
function AllocationStatus({ total, remaining, currency }: { total: number; remaining: number; currency: string | null }) {
  const t = useTranslations("dashboard.edit.budget");
  const f = useFormat();
  const money = (value: number) => f.moneyIn(value, currency);
  const allocated = round(total - remaining);
  const ratio = total > 0 ? Math.max(0, Math.min(1, allocated / total)) : 0;
  const tone = remaining < 0 ? "text-error" : remaining === 0 ? "text-success" : "text-primary";
  const bar = remaining < 0 ? "bg-error" : remaining === 0 ? "bg-success" : "bg-primary";
  return (
    <div className="mb-3 rounded-2xl border border-border/60 bg-background-subtle/50 px-4 py-3">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-border/60">
        <div className={`h-1.5 rounded-full ${bar}`} style={{ width: `${ratio * 100}%` }} />
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 text-[12.5px]">
        <span className="min-w-0 truncate text-foreground-muted">{t("allocatedSummary", { allocated: money(allocated), total: money(total) })}</span>
        <span role="status" className={`shrink-0 font-bold ${tone}`}>
          {remaining > 0 ? t("left", { amount: money(remaining) }) : remaining < 0 ? t("over", { amount: money(-remaining) }) : t("allocatedDone")}
        </span>
      </div>
    </div>
  );
}

/** Cancel and Save, under the allocation bar, as the app's editor footer. */
function AllocationFooter({ status, onCancel, onSave, saveDisabled, busy }: { status: ReactNode; onCancel: () => void; onSave: () => void; saveDisabled: boolean; busy: boolean }) {
  const t = useTranslations("dashboard.edit.budget");
  return (
    <div>
      {status}
      <div className="flex gap-2">
        <CancelButton onClick={onCancel} disabled={busy} />
        <SaveButton label={t("save")} busy={busy} disabled={saveDisabled} onClick={onSave} />
      </div>
    </div>
  );
}

/** A money input with the budget's currency in front: the main one's symbol, or another's code. */
function MoneyInput({ value, onChange, label, currency, placeholder = "0", autoFocus }: { value: string; onChange: (text: string) => void; label: string; currency: string | null; placeholder?: string; autoFocus?: boolean }) {
  const { fullModel: model } = useDashboard();
  const f = useFormat();
  return (
    <div className="flex h-12 items-center gap-1.5 rounded-2xl border border-border bg-background-subtle/60 px-4 focus-within:border-primary focus-within:bg-card">
      <span className="shrink-0 text-[14.5px] font-bold text-foreground-muted">{currency ?? model.symbol}</span>
      <input
        {...(autoFocus ? { "data-autofocus": true } : {})}
        inputMode="decimal"
        autoComplete="off"
        aria-label={label}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => {
          const settled = settledAmount(value, f.locale);
          if (settled !== null) onChange(settled);
        }}
        className="tabular h-full w-full min-w-0 bg-transparent text-[14.5px] text-foreground outline-none placeholder:text-foreground-muted"
      />
    </div>
  );
}

/**
 * The total and the currency the budget is in, side by side as the app has
 * them, and how spending in other currencies will be converted: at `rate`
 * (one unit of the budget's currency in the main one), or not yet, without one.
 * The currencies are the ones the app's entry flows offer.
 */
function BudgetTotalField({
  total,
  onTotal,
  currency,
  onCurrency,
  rate,
  hint,
  autoFocus,
}: {
  total: string;
  onTotal: (text: string) => void;
  /** Null for the main currency. */
  currency: string | null;
  onCurrency: (currency: string | null) => void;
  rate: number | null;
  /** A template converts at each budget's start; a month at its own rate. */
  hint: "template" | "budget";
  autoFocus?: boolean;
}) {
  const t = useTranslations("dashboard.edit.budget");
  const { fullModel: model, link } = useDashboard();
  const f = useFormat();
  const code = currency ?? model.currency;
  // A phone that cannot save a currency keeps the budget's own: nothing to pick.
  const codes = link.budgetCurrencies ? [...new Set([...model.currencies, code])] : [code];
  const input = <MoneyInput autoFocus={autoFocus} label={t("total")} currency={currency} value={total} placeholder={formatAmountInput(0, f.locale)} onChange={onTotal} />;
  return (
    <div>
      {codes.length > 1 ? (
        <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-3">
          <Field label={t("total")}>{input}</Field>
          <Field label={t("currency")}>
            <select
              value={code}
              aria-label={t("currency")}
              onChange={(event) => onCurrency(event.target.value === model.currency ? null : event.target.value)}
              className="h-12 w-full rounded-2xl border border-border bg-background-subtle/60 px-3 text-[14.5px] font-bold text-foreground outline-none focus:border-primary"
            >
              {codes.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </Field>
        </div>
      ) : (
        <Field label={t("total")}>{input}</Field>
      )}
      {currency ? (
        <p className={`mt-2 px-1 text-[12.5px] ${rate === null ? "font-semibold text-[#9A6A12]" : "text-foreground-muted"}`}>
          {rate === null
            ? t("currencyNoRate", { currency })
            : t(hint === "template" ? "currencyHintTemplate" : "currencyHintBudget", { currency, rate: formatFxRate(rate, f.locale), main: model.currency })}
        </p>
      ) : null}
    </div>
  );
}

/** One unit of `currency` in the main one at the latest rate, as a new budget would freeze it. */
function latestRate(model: Model, currency: string | null): number | null {
  return currency ? latestBudgetRate(model)(currency) : null;
}

/** The app's merged category list: one row per root expense category; a row opens its amount. */
function AllocationList({ draft, currency, onOpen }: { draft: Draft; currency: string | null; onOpen: (id: string) => void }) {
  const t = useTranslations("dashboard.edit.budget");
  const f = useFormat();
  if (!draft.roots.length) return <p className="rounded-2xl bg-background-subtle px-4 py-3 text-[13px] text-foreground-soft">{t("noCategories")}</p>;
  return (
    <SortableList
      ids={draft.roots.map((category) => category.id)}
      onChange={draft.reorder}
      label={(id) => draft.roots.find((category) => category.id === id)?.name ?? id}
      className="divide-y divide-border/40 overflow-hidden rounded-2xl border border-border/60 bg-card"
      itemClassName="bg-card"
      renderItem={(id, grip) => {
        const category = draft.roots.find((root) => root.id === id) as Category;
        const amount = draft.amountOf(id);
        return (
          <div className="flex items-center pl-1.5">
            {grip}
            <button type="button" onClick={() => onOpen(id)} className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-2 pr-4 text-left hover:bg-background-subtle/60">
              <CategoryGlyph icon={category.icon} name={category.name} color={category.color} size={22} />
              <span className="min-w-0 flex-1 truncate text-[14px] text-foreground">{category.name}</span>
              {draft.gaps.has(id) ? (
                <span role="img" aria-label={t("splitMismatch")} title={t("splitMismatch")} className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-error text-[10px] font-extrabold text-card">
                  !
                </span>
              ) : null}
              <span className={`tabular shrink-0 text-[14px] ${amount > 0 ? "font-extrabold text-foreground" : "text-foreground-muted"}`}>{f.moneyIn(amount, currency)}</span>
            </button>
          </div>
        );
      }}
    />
  );
}

/** One category's amount and its subcategory split: the app's category allocation page. */
function CategoryAllocationSheet({ draft, categoryId, currency, onClose }: { draft: Draft; categoryId: string; currency: string | null; onClose: () => void }) {
  const t = useTranslations("dashboard.edit.budget");
  const { fullModel: model } = useDashboard();
  const f = useFormat();
  const category = model.categories.get(categoryId);
  const kids = draft.children.get(categoryId) ?? [];
  const [amounts, setAmounts] = useState<Record<string, string>>(() => Object.fromEntries([categoryId, ...kids.map((c) => c.id)].map((id) => [id, draft.amounts[id] ?? ""])));
  const parse = (text: string | undefined) => positiveAmount(text, f.locale);
  const parent = parse(amounts[categoryId]);
  const split = round(kids.reduce((sum, child) => sum + parse(amounts[child.id]), 0));
  const gap = split > 0 ? round(parent - split) : 0;
  const othersLeft = round(draft.remaining + draft.amountOf(categoryId));
  const left = round(othersLeft - parent);
  const set = (id: string, text: string) => setAmounts((previous) => ({ ...previous, [id]: text }));
  if (!category) return null;
  return (
    <Sheet
      onClose={onClose}
      title={
        <span className="inline-flex items-center gap-2">
          <CategoryGlyph icon={category.icon} name={category.name} color={category.color} size={24} />
          {category.name}
        </span>
      }
      footer={
        <AllocationFooter
          status={kids.length > 0 && parent > 0 ? <AllocationStatus total={parent} remaining={round(parent - split)} currency={currency} /> : null}
          onCancel={onClose}
          onSave={() => {
            if (gap !== 0) return;
            draft.merge(amounts);
            onClose();
          }}
          saveDisabled={gap !== 0}
          busy={false}
        />
      }
    >
      <div className="space-y-4">
        <div className="flex items-end gap-3">
          <div className="min-w-0 flex-1">
            <Field label={t("amount")}>
              <MoneyInput autoFocus label={t("amount")} currency={currency} value={amounts[categoryId] ?? ""} onChange={(text) => set(categoryId, text)} />
            </Field>
          </div>
          {left > 0 ? (
            <button
              type="button"
              onClick={() => set(categoryId, formatAmountInput(othersLeft, f.locale))}
              aria-label={t("fillRemainder")}
              title={t("fillRemainder")}
              className="h-12 shrink-0 rounded-2xl border border-primary/30 bg-primary/10 px-4 text-[13px] font-bold text-primary-dark hover:bg-primary/15"
            >
              + {f.moneyIn(left, currency)}
            </button>
          ) : null}
        </div>
        {kids.length > 0 ? (
          <div className="pt-1">
            <p className="px-1 text-[11.5px] font-extrabold uppercase tracking-wide text-foreground-muted">{t("subcategories")}</p>
            <p className="mt-0.5 px-1 text-[12.5px] text-foreground-muted">{t("childrenHint")}</p>
            <ul className="mt-3 space-y-2">
              {kids.map((child) => (
                <li key={child.id} className="flex items-center gap-2.5">
                  {child.icon ? <CategoryGlyph icon={child.icon} name={child.name} size={18} /> : <span className="w-[18px]" aria-hidden="true" />}
                  <span className="min-w-0 flex-1 truncate text-[14px] text-foreground">{child.name}</span>
                  <div className="w-[160px] shrink-0">
                    <MoneyInput label={child.name} currency={currency} value={amounts[child.id] ?? ""} onChange={(text) => set(child.id, text)} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- editors --

/**
 * A template's editor: icon and name, the total, the category amounts, and
 * its options, as the app's template editor. `template` null makes a new one,
 * seeded from `duplicateOf` when duplicating. After a conflict it can start
 * over on the phone's newer copy.
 */
function BudgetTemplateEditor({ template, duplicateOf, onClose }: { template: BudgetTemplate | null; duplicateOf?: BudgetTemplate | null; onClose: () => void }) {
  const { fullModel: model } = useDashboard();
  return (
    <Reloadable row={template} fresh={(row) => (row ? budgetTemplates(model).find((item) => item.id === row.id) : null)} at={(row) => row?.updatedAt}>
      {(row) => <BudgetTemplateForm template={row} duplicateOf={duplicateOf} onClose={onClose} />}
    </Reloadable>
  );
}

function BudgetTemplateForm({ template, duplicateOf, onClose }: { template: BudgetTemplate | null; duplicateOf?: BudgetTemplate | null; onClose: () => void }) {
  const t = useTranslations("dashboard.edit.budget");
  const { fullModel: model, link } = useDashboard();
  const f = useFormat();
  const { run, busy, error, ready, clear, reload } = useEditRun();
  const seed = template ?? duplicateOf ?? null;
  const [name, setName] = useState(template?.name ?? (duplicateOf ? `${duplicateOf.name} ${t("duplicateSuffix")}`.slice(0, 80) : ""));
  const [emoji, setEmoji] = useState<string | null>(template ? template.emoji : copiedIcon(duplicateOf?.emoji ?? null));
  const [countUnbudgeted, setCountUnbudgeted] = useState(seed?.countUnbudgeted ?? true);
  const [currency, setCurrency] = useState<string | null>(seed?.currency ?? null);
  const [backPopulate, setBackPopulate] = useState(false);
  const [picker, setPicker] = useState<"icon" | string | null>(null);
  const draft = useAllocationDraft(model, { total: seed ? seed.total : null, lines: seed?.lines ?? [] });
  const range = useMemo(() => (template ? [] : backFillRange(model)), [model, template]);
  const trimmed = name.trim();
  const canSave = ready && trimmed.length > 0 && draft.valid;
  const change = (apply: () => void) => {
    clear();
    apply();
  };

  const save = async () => {
    if (!canSave || busy) return;
    const body: TemplateBody = { name: trimmed, emoji, totalAmount: draft.parsedTotal, countUnbudgeted, allocations: draft.build(), ...currencyField(link.budgetCurrencies, currency, template?.currency ?? null) };
    const ok = template
      ? await run([{ entity: ENTITY, op: "template_update", id: template.id, at: template.updatedAt, template: body } satisfies BudgetOp], "budget_template_update")
      : await run([{ entity: ENTITY, op: "template_create", template: { ...body, backPopulate: backPopulate && range.length > 0 } } satisfies BudgetOp], "budget_template_create");
    if (ok) onClose();
  };

  return (
    <Sheet
      busy={busy}
      onClose={onClose}
      title={template ? t("editTitle") : t("addTitle")}
      footer={<AllocationFooter status={draft.parsedTotal > 0 ? <AllocationStatus total={draft.parsedTotal} remaining={draft.remaining} currency={currency} /> : null} onCancel={onClose} onSave={() => void save()} saveDisabled={!canSave} busy={busy} />}
    >
      <div className="space-y-4">
        {/* Icon and name share a row, as in the app. */}
        <div className="flex items-end gap-3">
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setPicker("icon")}
              aria-label={t("chooseIcon")}
              title={t("chooseIcon")}
              className="flex h-[54px] w-[54px] items-center justify-center rounded-[18px] border border-border bg-background-subtle/60 transition hover:bg-background-subtle"
            >
              {emoji ? (
                <CategoryGlyph icon={emoji} name={trimmed || "?"} size={28} />
              ) : (
                <svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-foreground-muted">
                  <circle cx="11" cy="13" r="8" />
                  <path d="M8 15s1 1.5 3 1.5 3-1.5 3-1.5M8.5 11h.01M13.5 11h.01M19 2v6M16 5h6" />
                </svg>
              )}
            </button>
            {emoji ? (
              <button
                type="button"
                onClick={() => change(() => setEmoji(null))}
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
              <input data-autofocus value={name} maxLength={80} placeholder={t("namePlaceholder")} onChange={(event) => change(() => setName(event.target.value))} className={INPUT} />
            </Field>
          </div>
        </div>

        <BudgetTotalField
          total={draft.total}
          onTotal={(text) => change(() => draft.setTotal(text))}
          currency={currency}
          onCurrency={(next) => change(() => setCurrency(next))}
          rate={latestRate(model, currency)}
          hint="template"
        />

        <AllocationList draft={draft} currency={currency} onOpen={(id) => setPicker(id)} />

        <Toggle checked={countUnbudgeted} onChange={(value) => change(() => setCountUnbudgeted(value))} label={t("countUnbudgetedTitle")} hint={t("countUnbudgetedCaption")} />

        {range.length > 0 ? (
          <Toggle
            checked={backPopulate}
            onChange={(value) => change(() => setBackPopulate(value))}
            label={t("backPopulateTitle")}
            hint={t("backPopulateCaption", { first: f.monthLong(range[0]), last: f.monthLong(range[range.length - 1]), count: range.length })}
          />
        ) : null}

        <EditError message={error} onReload={reload} />
        <EditBlocked />
      </div>

      {picker === "icon" ? <CategoryIconPickerSheet value={emoji ?? ""} onChange={(next) => change(() => setEmoji(next || null))} onClose={() => setPicker(null)} /> : null}
      {picker && picker !== "icon" ? <CategoryAllocationSheet draft={draft} categoryId={picker} currency={currency} onClose={() => (clear(), setPicker(null))} /> : null}
    </Sheet>
  );
}

/**
 * One month's budget, edited in place (never its template), or a custom
 * one-off for `month` when `budget` is null: the app's month budget editor.
 * After a conflict it can start over on the phone's newer copy.
 */
function MonthlyBudgetEditor({ budget, month, onClose, onSaved }: { budget: BudgetMonth | null; month: string; onClose: () => void; onSaved?: (month: string) => void }) {
  const { fullModel: model } = useDashboard();
  return (
    <Reloadable row={budget} fresh={(row) => (row ? model.budgets.find((item) => item.id === row.id) : null)} at={(row) => (row ? budgetUpdatedAt(model, row.id) : null)}>
      {(row) => <MonthlyBudgetForm budget={row} month={month} onClose={onClose} onSaved={onSaved} />}
    </Reloadable>
  );
}

function MonthlyBudgetForm({ budget, month, onClose, onSaved }: { budget: BudgetMonth | null; month: string; onClose: () => void; onSaved?: (month: string) => void }) {
  const t = useTranslations("dashboard.edit.budget");
  const { fullModel: model, link } = useDashboard();
  const f = useFormat();
  const { run, busy, error, ready, clear, reload } = useEditRun();
  // The copy the draft is made from: a save names its `updated_at`, so a
  // change on the phone meanwhile is refused rather than overwritten.
  const [at] = useState(() => (budget ? budgetUpdatedAt(model, budget.id) : null));
  const [countUnbudgeted, setCountUnbudgeted] = useState(budget?.countUnbudgeted ?? true);
  const [currency, setCurrency] = useState<string | null>(budget?.currency ?? null);
  // Kept in its own currency, a month keeps its frozen rate; a new one takes today's on save.
  const rate = budget && currency === budget.currency && budget.fxRate !== null ? budget.fxRate : latestRate(model, currency);
  const [open, setOpen] = useState<string | null>(null);
  const draft = useAllocationDraft(model, { total: budget ? budget.total : null, lines: budget?.lines ?? [] });
  const canSave = ready && draft.valid;

  const save = async () => {
    if (!canSave || busy) return;
    const body: MonthBody = { totalAmount: draft.parsedTotal, countUnbudgeted, lines: draft.build(), ...currencyField(link.budgetCurrencies, currency, budget?.currency ?? null) };
    const ok = budget
      ? await run([{ entity: ENTITY, op: "month_update", id: budget.id, at, budget: body } satisfies BudgetOp], "budget_month_update")
      : await run([{ entity: ENTITY, op: "month_custom", month, budget: body } satisfies BudgetOp], "budget_month_custom");
    if (ok) {
      onSaved?.(month);
      onClose();
    }
  };

  return (
    <Sheet
      busy={busy}
      onClose={onClose}
      title={f.monthLong(month)}
      footer={<AllocationFooter status={draft.parsedTotal > 0 ? <AllocationStatus total={draft.parsedTotal} remaining={draft.remaining} currency={currency} /> : null} onCancel={onClose} onSave={() => void save()} saveDisabled={!canSave} busy={busy} />}
    >
      <div className="space-y-4">
        <BudgetTotalField autoFocus total={draft.total} onTotal={(text) => (clear(), draft.setTotal(text))} currency={currency} onCurrency={(next) => (clear(), setCurrency(next))} rate={rate} hint="budget" />
        <AllocationList draft={draft} currency={currency} onOpen={setOpen} />
        <Toggle checked={countUnbudgeted} onChange={(value) => (clear(), setCountUnbudgeted(value))} label={t("countUnbudgetedTitle")} hint={t("countUnbudgetedCaption")} />
        <EditError message={error} onReload={reload} />
        <EditBlocked />
      </div>
      {open ? <CategoryAllocationSheet draft={draft} categoryId={open} currency={currency} onClose={() => (clear(), setOpen(null))} /> : null}
    </Sheet>
  );
}

// ------------------------------------------------------------- templates --

/** Settings → Budget templates: the list, with make default, duplicate, delete and new. */
function BudgetTemplatesSheet({ onClose }: { onClose: () => void }) {
  const t = useTranslations("dashboard.edit.budget");
  const paywall = usePaywall();
  const { fullModel: model, link } = useDashboard();
  const f = useFormat();
  const { run, busy, error, ready } = useEditRun();
  const templates = useMemo(() => budgetTemplates(model), [model]);
  // undefined: closed; null: new.
  const [editing, setEditing] = useState<{ template: BudgetTemplate | null; duplicateOf?: BudgetTemplate } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  // As the templates screen's add and duplicate: the free plan's limit before the editor opens.
  // The phone counts weekly and yearly templates too, which a live session never sends, so a
  // free user with one of those passes this check and gets the paywall from the phone on Save.
  const add = (duplicateOf?: BudgetTemplate) => {
    if (!link.pro && templates.length >= FREE_MAX_BUDGET_TEMPLATES) {
      paywall("budget_templates");
      return;
    }
    setEditing({ template: null, duplicateOf });
  };

  const makeDefault = (template: BudgetTemplate) => {
    if (template.isDefault || !ready || busy) return;
    void run([{ entity: ENTITY, op: "template_default", id: template.id, at: template.updatedAt } satisfies BudgetOp], "budget_template_default");
  };
  const remove = async (template: BudgetTemplate) => {
    if (!ready || busy) return;
    if (await run([{ entity: ENTITY, op: "template_delete", id: template.id, at: template.updatedAt } satisfies BudgetOp], "budget_template_delete")) setDeleting(null);
  };

  return (
    <Sheet
      busy={busy}
      onClose={onClose}
      title={t("templatesTitle")}
      headerAction={
        templates.length ? (
          <button
            type="button"
            onClick={() => add()}
            aria-label={t("newTemplate")}
            title={t("newTemplate")}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary-dark hover:bg-primary/25"
          >
            <ClayImg name="ui/plus" size={18} />
          </button>
        ) : null
      }
    >
      <div className="space-y-3">
        <p className="px-1 text-[13px] text-foreground-muted">{t("templatesSubtitle")}</p>
        {templates.length === 0 ? (
          <div className="rounded-2xl border border-border bg-background-subtle/50 px-5 py-6 text-center">
            <p className="text-[15px] font-extrabold text-foreground">{t("noTemplatesTitle")}</p>
            <p className="mt-1 text-[13px] text-foreground-soft">{t("noTemplatesMessage")}</p>
            <button type="button" onClick={() => add()} className="mt-4 inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-[13.5px] font-extrabold text-card hover:bg-primary-dark">
              {t("createTemplate")}
            </button>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {templates.map((template) => (
              <li key={template.id} className="rounded-2xl border border-border/70 bg-card">
                <div className="flex items-center gap-3 px-4 py-3">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={template.isDefault}
                    aria-label={t("makeDefault")}
                    title={t("makeDefault")}
                    onClick={() => makeDefault(template)}
                    disabled={!template.isDefault && (!ready || busy)}
                    className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${template.isDefault ? "border-primary" : "border-border hover:border-primary/60"}`}
                  >
                    {template.isDefault ? <span className="h-2.5 w-2.5 rounded-full bg-primary" /> : null}
                  </button>
                  <button type="button" onClick={() => setEditing({ template })} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    {template.emoji ? <CategoryGlyph icon={template.emoji} name={template.name} size={22} /> : null}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[14.5px] font-extrabold text-foreground">{template.name}</span>
                        {template.isDefault ? <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-extrabold uppercase text-primary-dark">{t("defaultBadge")}</span> : null}
                      </span>
                      <span className="mt-0.5 block truncate text-[12.5px] text-foreground-muted">
                        {f.moneyIn(template.total, template.currency)} · {t("categoriesCount", { count: rootCount(model, template.lines) })}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => add(template)}
                    aria-label={t("duplicate")}
                    title={t("duplicate")}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-foreground-soft hover:bg-background-subtle hover:text-foreground"
                  >
                    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="8" y="8" width="13" height="13" rx="2" />
                      <path d="M4 16V5a2 2 0 0 1 2-2h11" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleting(template.id)}
                    disabled={busy}
                    aria-label={t("delete")}
                    title={t("delete")}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-error-soft disabled:opacity-40"
                  >
                    <ClayImg name="ui/trash" size={16} />
                  </button>
                </div>
                {deleting === template.id ? (
                  <div className="px-3 pb-3">
                    <Confirm
                      title={t("deleteTemplateTitle")}
                      body={t("deleteTemplateMessage")}
                      actions={[
                        { label: t("cancel"), onClick: () => setDeleting(null) },
                        { label: t("delete"), tone: "danger", onClick: () => void remove(template), disabled: !ready || busy },
                      ]}
                    />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <EditError message={error} />
        <EditBlocked />
      </div>
      {editing ? <BudgetTemplateEditor template={editing.template} duplicateOf={editing.duplicateOf} onClose={() => setEditing(null)} /> : null}
    </Sheet>
  );
}

/**
 * Making a month's budget: the month, then a template to create it from or a
 * custom one-off, as the app's template picker offers.
 */
function CreateBudgetSheet({ month: initial, onClose, onCreated }: { month: string | null; onClose: () => void; onCreated?: (month: string) => void }) {
  const t = useTranslations("dashboard.edit.budget");
  const { fullModel: model } = useDashboard();
  const f = useFormat();
  const { run, busy, error, ready } = useEditRun();
  const templates = useMemo(() => budgetTemplates(model), [model]);
  const free = useMemo(() => {
    const taken = new Set(model.budgets.map((budget) => budget.month));
    return budgetMonths(model).filter((month) => !taken.has(month));
  }, [model]);
  const [month, setMonth] = useState(initial && free.includes(initial) ? initial : free.includes(model.currentMonth) ? model.currentMonth : (free[0] ?? ""));
  const [next, setNext] = useState<"custom" | "template" | null>(null);

  const fromTemplate = async (template: BudgetTemplate) => {
    if (!ready || busy || !month) return;
    if (await run([{ entity: ENTITY, op: "month_create", month, templateId: template.id } satisfies BudgetOp], "budget_month_create")) {
      onCreated?.(month);
      onClose();
    }
  };

  return (
    <Sheet busy={busy} onClose={onClose} title={t("createBudget")}>
      <div className="space-y-4">
        <Field label={t("month")}>
          <Select value={month} onChange={(event) => setMonth(event.target.value)} aria-label={t("month")}>
            {free.map((key) => (
              <option key={key} value={key}>
                {f.monthLong(key)}
              </option>
            ))}
          </Select>
        </Field>
        {templates.length === 0 ? (
          <div className="rounded-2xl border border-border bg-background-subtle/50 px-4 py-3 text-[13px] text-foreground-soft">
            <p className="font-bold text-foreground">{t("noTemplatesTitle")}</p>
            <p className="mt-0.5">{t("noTemplatesMessage")}</p>
            <button type="button" onClick={() => setNext("template")} className="mt-3 inline-flex h-9 items-center rounded-full bg-primary px-4 text-[13px] font-extrabold text-card hover:bg-primary-dark">
              {t("createTemplate")}
            </button>
          </div>
        ) : (
          <div>
            <p className="mb-2 px-1 text-[12.5px] font-bold text-foreground-soft">{t("chooseTemplate")}</p>
            <ul className="space-y-2">
              {templates.map((template) => (
                <li key={template.id}>
                  <button
                    type="button"
                    onClick={() => void fromTemplate(template)}
                    disabled={!ready || busy || !month}
                    className="flex w-full items-center gap-3 rounded-2xl border border-border/70 bg-card px-4 py-3 text-left hover:bg-background-subtle/60 disabled:opacity-60"
                  >
                    {template.emoji ? <CategoryGlyph icon={template.emoji} name={template.name} size={22} /> : null}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[14.5px] font-extrabold text-foreground">{template.name}</span>
                        {template.isDefault ? <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-extrabold uppercase text-primary-dark">{t("defaultBadge")}</span> : null}
                      </span>
                      <span className="mt-0.5 block truncate text-[12.5px] text-foreground-muted">
                        {f.moneyIn(template.total, template.currency)} · {t("categoriesCount", { count: rootCount(model, template.lines) })}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <button
          type="button"
          onClick={() => setNext("custom")}
          disabled={!month}
          className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-border bg-background-subtle/40 px-4 py-3 text-left hover:bg-background-subtle disabled:opacity-60"
        >
          <ClayImg name="ui/pencil" size={20} />
          <span className="min-w-0 flex-1">
            <span className="block text-[14.5px] font-extrabold text-foreground">{t("customOption")}</span>
            <span className="mt-0.5 block text-[12.5px] text-foreground-muted">{t("customOptionCaption")}</span>
          </span>
        </button>
        <EditError message={error} />
        <EditBlocked />
      </div>
      {next === "custom" && month ? (
        <MonthlyBudgetEditor
          budget={null}
          month={month}
          onClose={() => setNext(null)}
          onSaved={(saved) => {
            onCreated?.(saved);
            onClose();
          }}
        />
      ) : null}
      {next === "template" ? <BudgetTemplateEditor template={null} onClose={() => setNext(null)} /> : null}
    </Sheet>
  );
}

/**
 * The budget page's edit bar: templates, a new month budget, and the shown
 * month's edit and delete (with the app's question).
 */
export function BudgetEditBar({ budget, month, onShowMonth }: { budget: BudgetMonth | null; month: string | null; onShowMonth: (month: string) => void }) {
  const t = useTranslations("dashboard.edit.budget");
  const { fullModel: model } = useDashboard();
  const { run, busy, error, ready } = useEditRun();
  const [open, setOpen] = useState<"templates" | "create" | "edit" | null>(null);
  // The month the trash was pressed on, held so the question deletes that
  // one even if the page moves to another month meanwhile.
  const [deleting, setDeleting] = useState<{ id: string; at: string | null } | null>(null);
  // The full model's copy of the month shown, so its lines include every category.
  const current = budget ? (model.budgets.find((item) => item.id === budget.id) ?? budget) : null;

  const remove = async () => {
    if (!deleting || !ready || busy) return;
    if (await run([{ entity: ENTITY, op: "month_delete", id: deleting.id, at: deleting.at } satisfies BudgetOp], "budget_month_delete")) setDeleting(null);
  };

  const pill = "inline-flex h-10 items-center gap-2 rounded-full border border-border bg-card px-4 text-[13.5px] font-extrabold text-foreground-soft shadow-[var(--shadow-soft)] hover:text-foreground disabled:opacity-50";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button type="button" onClick={() => setOpen("templates")} className={pill}>
          <ClayImg name="settings/budget" size={18} />
          {t("templatesTitle")}
        </button>
        {current ? (
          <>
            <button type="button" onClick={() => setOpen("edit")} className={pill}>
              <ClayImg name="ui/pencil" size={16} />
              {t("editBudget")}
            </button>
            <button
              type="button"
              onClick={() => setDeleting({ id: current.id, at: budgetUpdatedAt(model, current.id) })}
              disabled={busy}
              aria-label={t("deleteBudget")}
              title={t("deleteBudget")}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card shadow-[var(--shadow-soft)] hover:bg-error-soft disabled:opacity-40"
            >
              <ClayImg name="ui/trash" size={17} />
            </button>
          </>
        ) : null}
        <button
          type="button"
          onClick={() => setOpen("create")}
          className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-[13.5px] font-extrabold text-card shadow-[var(--shadow-soft)] hover:bg-primary-dark"
        >
          <ClayImg name="ui/plus" size={16} />
          {t("createBudget")}
        </button>
      </div>
      {deleting ? (
        <Confirm
          title={t("deleteBudgetTitle")}
          body={t("deleteBudgetMessage")}
          actions={[
            { label: t("cancel"), onClick: () => setDeleting(null) },
            { label: t("delete"), tone: "danger", onClick: () => void remove(), disabled: !ready || busy },
          ]}
        />
      ) : null}
      <EditError message={error} />
      {open === "templates" ? <BudgetTemplatesSheet onClose={() => setOpen(null)} /> : null}
      {open === "create" ? <CreateBudgetSheet month={budget ? null : month} onClose={() => setOpen(null)} onCreated={onShowMonth} /> : null}
      {open === "edit" && current ? <MonthlyBudgetEditor budget={current} month={current.month} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}
