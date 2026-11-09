"use client";

import { useTranslations } from "next-intl";
import { useMemo, useRef, useState } from "react";

import { useDismiss } from "./dropdown";
import { categoryTree } from "./edit/kit";
import { filterCount, NO_FILTERS, type FilterMode, type Filters } from "./filters";
import { useDashboard } from "./state";
import { AccountLogo, CategoryGlyph, Segmented } from "./ui";

/** Masks every amount on every page, for a screen someone else can see. */
export function HideAmountsButton() {
  const t = useTranslations("dashboard.hide");
  const { hidden, setHidden } = useDashboard();
  const label = hidden ? t("show") : t("hide");
  return (
    <button
      type="button"
      onClick={() => setHidden(!hidden)}
      aria-pressed={hidden}
      aria-label={label}
      title={label}
      className={`inline-flex h-10 w-10 items-center justify-center rounded-full border transition-colors ${
        hidden ? "border-primary/40 bg-primary-soft text-primary-dark" : "border-border bg-card text-foreground-soft shadow-[var(--shadow-soft)] hover:text-foreground"
      }`}
    >
      <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {hidden ? (
          <>
            <path d="M3 3l18 18" />
            <path d="M10.6 5.1A9.8 9.8 0 0 1 12 5c5 0 9 4.5 10 7a12.5 12.5 0 0 1-3.2 4.3M6.2 6.2C3.9 7.6 2.5 9.8 2 12c1 2.5 5 7 10 7a9.6 9.6 0 0 0 4.7-1.2" />
            <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
          </>
        ) : (
          <>
            <path d="M2 12c1-2.5 5-7 10-7s9 4.5 10 7c-1 2.5-5 7-10 7S3 14.5 2 12z" />
            <circle cx="12" cy="12" r="3" />
          </>
        )}
      </svg>
    </button>
  );
}

type Tab = "accounts" | "expense" | "income";

const LISTS: Record<Tab, { ids: keyof Filters; mode: keyof Filters }> = {
  accounts: { ids: "accounts", mode: "accountMode" },
  expense: { ids: "expenseCategories", mode: "expenseMode" },
  income: { ids: "incomeCategories", mode: "incomeMode" },
};

/** The app's filter sheet: accounts and each type's categories, excluded or included. */
export function FilterButton() {
  const t = useTranslations("dashboard.filters");
  const tv = useTranslations("dashboard.views");
  const { fullModel, filters, setFilters } = useDashboard();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("accounts");
  const ref = useRef<HTMLDivElement>(null);
  const count = filterCount(filters, fullModel);

  // Closes on a click outside or Escape, like a menu; that Escape does not
  // also clear the transaction list's selection.
  useDismiss(ref, open, () => setOpen(false));

  const rows = useMemo(() => {
    if (tab === "accounts") {
      return fullModel.accounts.map((account) => ({
        id: account.id,
        name: account.name,
        parentId: null as string | null,
        icon: <AccountLogo logoId={account.logoId} name={account.name} size={24} />,
      }));
    }
    return categoryTree(fullModel, tab === "expense" ? "expense" : "income").flatMap(({ parent, children }) => [
      { id: parent.id, name: parent.name, parentId: null as string | null, icon: <CategoryGlyph icon={parent.icon} name={parent.name} color={parent.color} size={24} /> },
      ...children.map((child) => ({
        id: child.id,
        name: child.name,
        parentId: parent.id as string | null,
        icon: <CategoryGlyph icon={child.icon} name={child.name} color={child.color} size={22} />,
      })),
    ]);
  }, [tab, fullModel]);

  const list = LISTS[tab];
  const picked = new Set(filters[list.ids] as string[]);
  const mode = filters[list.mode] as FilterMode;
  const toggle = (id: string) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setFilters({ ...filters, [list.ids]: [...next] });
  };
  const tabCount = (key: Tab) => (filters[LISTS[key].ids] as string[]).length;

  return (
    // On a phone the panel spans the header instead of hanging off the button.
    <div ref={ref} className="sm:relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`inline-flex h-10 items-center gap-2 rounded-full border px-4 text-[13.5px] font-bold transition-colors ${
          count ? "border-primary/40 bg-primary-soft text-primary-dark" : "border-border bg-card text-foreground-soft shadow-[var(--shadow-soft)] hover:text-foreground"
        }`}
      >
        <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
          <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
          <circle cx="16" cy="6" r="2" />
          <circle cx="10" cy="12" r="2" />
          <circle cx="18" cy="18" r="2" />
        </svg>
        {t("title")}
        {count ? <span className="tabular rounded-full bg-primary px-1.5 text-[11.5px] leading-[18px] text-card">{count}</span> : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label={t("title")}
          className="absolute inset-x-4 top-full z-40 mt-2 flex max-h-[min(70vh,560px)] flex-col sm:inset-x-auto sm:right-0 sm:top-12 sm:mt-0 sm:w-[360px] overflow-hidden rounded-[22px] border border-border bg-card shadow-[var(--shadow-float-lg)]"
        >
          <div className="space-y-3 border-b border-border p-4">
            <div className="flex gap-1 rounded-full bg-background-subtle p-1" role="tablist">
              {(["accounts", "expense", "income"] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => setTab(key)}
                  className={`min-w-0 flex-1 truncate rounded-full px-2 py-1.5 text-[12.5px] font-bold transition-colors ${
                    tab === key ? "bg-card text-foreground shadow-[var(--shadow-soft)]" : "text-foreground-soft hover:text-foreground"
                  }`}
                >
                  {key === "accounts" ? t("accounts") : tv(key === "expense" ? "spending.nav" : "income.nav")}
                  {tabCount(key) ? <span className="tabular ml-1 text-primary-dark">{tabCount(key)}</span> : null}
                </button>
              ))}
            </div>
            <Segmented<FilterMode>
              label={t("title")}
              value={mode}
              onChange={(next) => setFilters({ ...filters, [list.mode]: next })}
              options={[
                { value: "exclude", label: t("exclude") },
                { value: "include", label: t("include") },
              ]}
            />
          </div>

          <ul className="min-h-0 flex-1 overflow-y-auto p-2">
            {rows.map((row) => {
              // A picked parent already covers its children, as in the app.
              const covered = row.parentId != null && picked.has(row.parentId);
              return (
                <li key={row.id}>
                  <label
                    className={`flex items-center gap-3 rounded-2xl px-2 py-1.5 ${covered ? "opacity-50" : "cursor-pointer hover:bg-background-subtle"} ${row.parentId ? "pl-9" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={covered || picked.has(row.id)}
                      disabled={covered}
                      onChange={() => toggle(row.id)}
                      className="h-4 w-4 shrink-0 accent-[var(--color-primary)]"
                    />
                    {row.icon}
                    <span className={`min-w-0 flex-1 truncate text-[13.5px] ${row.parentId ? "text-foreground-soft" : "font-semibold text-foreground"}`}>{row.name}</span>
                  </label>
                </li>
              );
            })}
          </ul>

          <div className="flex items-center gap-3 border-t border-border p-3">
            <p className="min-w-0 flex-1 text-[11.5px] leading-snug text-foreground-muted">{t("note")}</p>
            <button
              type="button"
              onClick={() => setFilters(NO_FILTERS)}
              disabled={!count}
              className="rounded-full px-3 py-1.5 text-[13px] font-bold text-foreground-soft hover:bg-background-subtle disabled:opacity-40"
            >
              {t("reset")}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-full bg-primary px-4 py-1.5 text-[13px] font-extrabold text-card hover:bg-primary-dark">
              {t("done")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
