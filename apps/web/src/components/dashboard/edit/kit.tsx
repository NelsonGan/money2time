"use client";

import { useTranslations } from "next-intl";
import { createContext, Fragment, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import type { DashboardEditAction } from "@/lib/analytics";
import { dayKeyOf, parseLocalDate } from "@/lib/backup/dates";
import type { Account, Category, Model } from "@/lib/backup/model";
import type { RecurringRuleRow } from "@/lib/backup/types";
import type { EditError as EditErrorCode, EditOp, EditResult, Sentiment } from "@/lib/cloud/edits";

import { FREE_MAX_ACCOUNTS, FREE_MAX_LOANS, FREE_MAX_SAVINGS_GOALS } from "../pro-limits";
import { useDashboard, useFormat } from "../state";
import { usePaywall } from "../paywall";
import { AccountLogo, CategoryGlyph, ClayImg } from "../ui";

/*
 * The pieces every editor on the dashboard shares, drawn after the app's own:
 * its sheets, its two-column category grid with subcategories that open in
 * place, its grouped account picker with balances, its feeling face and its
 * calculator amount. Saving goes through the phone (`useEditRun`).
 */

/** Now on the phone's clock, as the app's dates read it. */
export function phoneNow(): Date {
  return parseLocalDate(new Date().toISOString()) ?? new Date();
}

/** The day part of a stored date, `YYYY-MM-DD`, or null. */
export function dayOf(value: string | null | undefined): string | null {
  const match = value ? /^(\d{4}-\d{2}-\d{2})/.exec(value) : null;
  return match ? match[1] : null;
}

/** Today on the phone's clock, `YYYY-MM-DD`. */
export function phoneToday(): string {
  return dayKeyOf(phoneNow());
}

/** The first and last day the phone takes (its isDayKey), for a date input's `min` and `max`. */
export const DAY_MIN = "1970-01-01";
export const DAY_MAX = "2200-12-31";

/** A real calendar day the phone takes, `YYYY-MM-DD` from 1970 to 2200, as its isDayKey checks it. */
export function isDayKey(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return y >= 1970 && y <= 2200 && date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** The largest amount the phone saves (its MAX_AMOUNT): anything above it is refused as invalid. */
export const MAX_AMOUNT = 1e12;

// -------------------------------------------------------------------- sheet --

/**
 * A sheet over the page, as the app's pickers and editors are: from the bottom
 * on a phone-sized screen, centred on a wide one. Focus moves in and stays in,
 * Escape closes, and focus goes back to what opened it.
 */
export function Sheet({
  title,
  onClose,
  children,
  footer,
  busy,
  wide,
  headerAction,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  busy?: boolean;
  wide?: boolean;
  headerAction?: ReactNode;
}) {
  const t = useTranslations("dashboard.edit");
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  useEffect(() => {
    closeRef.current = onClose;
    busyRef.current = busy;
  });
  useEffect(() => {
    const returnTo = document.activeElement as HTMLElement | null;
    // The field a sheet names first, else its first control.
    (
      ref.current?.querySelector<HTMLElement>("[data-autofocus]") ??
      ref.current?.querySelector<HTMLElement>("input, select, textarea, button:not([data-close])")
    )?.focus();
    const onKey = (event: KeyboardEvent) => {
      // Only the topmost sheet answers.
      const sheets = document.querySelectorAll("[data-sheet]");
      if (sheets[sheets.length - 1] !== ref.current) return;
      if (event.key === "Escape" && !busyRef.current) {
        event.stopPropagation();
        closeRef.current();
      }
      if (event.key !== "Tab" || !ref.current) return;
      const focusable = [...ref.current.querySelectorAll<HTMLElement>("input, select, textarea, button, [tabindex='0']")].filter(
        (el) => !el.hasAttribute("disabled") && el.offsetParent !== null,
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      returnTo?.focus();
    };
  }, []);
  // On the page itself: a sticky or blurred parent would hold a fixed sheet inside its own layer.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <button type="button" aria-label={t("close")} className="absolute inset-0 bg-[rgba(0,0,0,0.4)]" onClick={() => !busy && onClose()} tabIndex={-1} data-close />
      <div
        ref={ref}
        data-sheet
        role="dialog"
        aria-modal="true"
        // Named by its heading, whatever the title holds (text, a tab row, an icon and a name).
        aria-labelledby={titleId}
        className={`relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[28px] bg-card shadow-[var(--shadow-float-lg)] sm:rounded-[28px] ${wide ? "sm:max-w-[760px]" : "sm:max-w-[480px]"}`}
      >
        <header className="flex shrink-0 items-center gap-3 px-5 pb-3 pt-5">
          <h2 id={titleId} className="min-w-0 flex-1 truncate text-[18px] font-extrabold tracking-[-0.01em] text-foreground">{title}</h2>
          {headerAction}
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label={t("close")}
            data-close
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-background-subtle text-foreground-soft hover:text-foreground disabled:opacity-40"
          >
            <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
        {footer ? <footer className="shrink-0 border-t border-border px-5 py-3.5">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
}

/** A confirmation inside a sheet, as the app's alerts ask. */
export function Confirm({
  title,
  body,
  actions,
}: {
  title: string;
  /** A line, or several (each its own paragraph, never joined into one sentence). */
  body?: string | string[];
  actions: { label: string; onClick: () => void; tone?: "danger" | "primary" | "plain"; disabled?: boolean }[];
}) {
  return (
    <div role="alertdialog" aria-label={title} className="rounded-[20px] border border-border bg-background-subtle p-4">
      <p className="text-[14px] font-extrabold text-foreground">{title}</p>
      {(Array.isArray(body) ? body : body ? [body] : []).map((line) => (
        <p key={line} className="mt-1 text-[13px] leading-relaxed text-foreground-soft">
          {line}
        </p>
      ))}
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={action.onClick}
            disabled={action.disabled}
            className={`rounded-full px-4 py-2 text-[13px] font-extrabold disabled:opacity-50 ${
              action.tone === "danger"
                ? "bg-error text-card"
                : action.tone === "primary"
                  ? "bg-primary text-card hover:bg-primary-dark"
                  : "text-foreground-soft hover:bg-card"
            }`}
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------- fields --

/** A labelled field, as the app's forms lay one out. */
export function Field({ label, children, hint, error }: { label: ReactNode; children: ReactNode; hint?: ReactNode; error?: ReactNode }) {
  return (
    <div className="block">
      <span className="mb-1.5 block px-1 text-[12.5px] font-bold text-foreground-soft">{label}</span>
      {children}
      {error ? <span className="mt-1.5 block px-1 text-[12px] font-semibold text-error">{error}</span> : null}
      {!error && hint ? <span className="mt-1.5 block px-1 text-[12px] leading-snug text-foreground-muted">{hint}</span> : null}
    </div>
  );
}

export const INPUT =
  "h-12 w-full rounded-2xl border border-border bg-background-subtle/60 px-4 text-[14.5px] text-foreground outline-none transition-colors placeholder:text-foreground-muted focus:border-primary focus:bg-card disabled:text-foreground-muted";

/** A pressable row that opens a picker, as the app's form rows are. */
export function PickerRow({
  label,
  value,
  icon,
  onClick,
  placeholder,
  error,
}: {
  label?: ReactNode;
  value: ReactNode | null;
  icon?: ReactNode;
  onClick: () => void;
  placeholder: string;
  error?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-12 w-full items-center gap-3 rounded-2xl border bg-background-subtle/60 px-4 py-2.5 text-left transition-colors hover:bg-background-subtle ${
        error ? "border-error/60" : "border-border"
      }`}
    >
      {icon}
      <span className="min-w-0 flex-1">
        {label ? <span className="block text-[11.5px] font-bold text-foreground-muted">{label}</span> : null}
        <span className={`block truncate text-[14.5px] ${value ? "font-bold text-foreground" : "text-foreground-muted"}`}>{value ?? placeholder}</span>
      </span>
      <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true" className="shrink-0 text-foreground-muted">
        <path d="m9 6 6 6-6 6" />
      </svg>
    </button>
  );
}

/** Pill chips for one choice, as the app's type and option chips. */
export function Pills<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: ReactNode; icon?: ReactNode }[];
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-[13.5px] font-bold transition-colors ${
              active ? "border-primary/50 bg-primary/15 text-primary-dark" : "border-border bg-card text-foreground-soft hover:text-foreground"
            }`}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** The app's switch. */
export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (value: boolean) => void; label: ReactNode; hint?: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-border bg-background-subtle/60 px-4 py-3">
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-bold text-foreground">{label}</span>
        {hint ? <span className="mt-0.5 block text-[12px] leading-snug text-foreground-muted">{hint}</span> : null}
      </span>
      <span className="relative inline-flex shrink-0">
        <input type="checkbox" role="switch" checked={checked} onChange={(event) => onChange(event.target.checked)} className="peer sr-only" />
        <span className="h-7 w-12 rounded-full bg-border transition-colors peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40" />
        <span className="absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-card shadow transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

/** The app's square checkbox row, with an optional info line. */
export function CheckRow({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (value: boolean) => void; label: ReactNode; hint?: ReactNode; disabled?: boolean }) {
  return (
    <label className={`flex items-start gap-3 py-1.5 ${disabled ? "opacity-60" : "cursor-pointer"}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 rounded-md accent-[var(--color-primary)]" />
      <span className="min-w-0">
        <span className="block text-[14px] font-semibold text-foreground">{label}</span>
        {hint ? <span className="mt-0.5 block text-[12px] leading-snug text-foreground-muted">{hint}</span> : null}
      </span>
    </label>
  );
}

// ----------------------------------------------------------------- feeling --

const SENTIMENT_ICON: Record<Sentiment, string> = { happy: "sentiment/happy", neutral: "sentiment/neutral", sad: "sentiment/regret" };
const NEXT_SENTIMENT: Record<Sentiment, Sentiment> = { neutral: "happy", happy: "sad", sad: "neutral" };

/** The app's feeling face: each press moves neutral → happy → sad → neutral. */
export function SentimentButton({ value, onChange }: { value: Sentiment; onChange: (value: Sentiment) => void }) {
  const t = useTranslations("dashboard.edit");
  const tt = useTranslations("dashboard.transactions.feelings");
  return (
    <button
      type="button"
      onClick={() => onChange(NEXT_SENTIMENT[value])}
      aria-label={`${t("feeling")}: ${tt(value)}`}
      title={tt(value)}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background-subtle/60 transition hover:bg-background-subtle"
    >
      <ClayImg name={SENTIMENT_ICON[value]} size={24} />
    </button>
  );
}

export function SentimentIcon({ value, size = 18 }: { value: Sentiment; size?: number }) {
  return <ClayImg name={SENTIMENT_ICON[value]} size={size} />;
}

// ------------------------------------------------------------------- amount --

/**
 * An amount as typed, in this browser's decimal mark, with the app's
 * calculator: `12+3.5`, `30/3`, `4x2.5`. Null when it does not read as one.
 */
export function evaluateAmount(text: string, locale: string): number | null {
  const decimal = decimalMark(locale);
  const group = decimal === "," ? "." : ",";
  let clean = text.replace(/\s/g, "").replace(/×|x|X|\*/g, "*").replace(/÷|\//g, "/").replace(/−/g, "-");
  if (!clean) return null;
  // Group marks go; the decimal mark becomes a point. "1,500" in English is
  // fifteen hundred, "1,5" in German is one and a half.
  clean = clean.split(group).join("").split(decimal).join(".");
  if (!/^[\d.+\-*/]+$/.test(clean) || /[+\-*/]{2,}/.test(clean) || /^[*/]|[+\-*/]$/.test(clean)) return null;
  const tokens = clean.match(/\d*\.?\d+|[+\-*/]/g);
  if (!tokens || tokens.join("") !== clean) return null;
  // Multiplication and division first, as the app's calculator does.
  const terms: number[] = [];
  let sign = 1;
  let current: number | null = null;
  let op: string | null = null;
  for (const token of tokens) {
    if (/^[\d.]/.test(token)) {
      const value = Number(token);
      if (!Number.isFinite(value)) return null;
      current = current === null ? value : op === "*" ? current * value : op === "/" ? (value === 0 ? NaN : current / value) : value;
      op = null;
    } else if (token === "*" || token === "/") {
      op = token;
    } else {
      if (current !== null) terms.push(sign * current);
      sign = token === "-" ? -1 : 1;
      current = null;
    }
  }
  if (current !== null) terms.push(sign * current);
  const total = terms.reduce((sum, value) => sum + value, 0);
  return Number.isFinite(total) ? Math.round(total * 100) / 100 : null;
}

/** This browser's decimal mark: "." in English, "," in German. */
export function decimalMark(locale: string): string {
  return new Intl.NumberFormat(locale).formatToParts(1.1).find((part) => part.type === "decimal")?.value ?? ".";
}

/** A plain number as typed in this browser's decimal mark (a rate, a percentage), unrounded; null when it is not one. */
export function parseDecimal(text: string, locale: string): number | null {
  const decimal = decimalMark(locale);
  const clean = text.replace(/\s/g, "").split(decimal === "," ? "." : ",").join("").replace(decimal, ".");
  if (!/^\d*\.?\d+$/.test(clean)) return null;
  const value = Number(clean);
  return Number.isFinite(value) ? value : null;
}

/** A number as typed in this browser's decimal mark; NaN when it is not one, null when empty. */
export function readNumber(text: string, locale: string): number | null {
  return text.trim() ? (parseDecimal(text, locale) ?? NaN) : null;
}

/** A number in this browser's decimal mark, ungrouped, for an input to show. */
export function formatDecimal(value: number, locale: string, options: Intl.NumberFormatOptions = { maximumFractionDigits: 10 }): string {
  return new Intl.NumberFormat(locale, { useGrouping: false, ...options }).format(value);
}

/** The app's = key: an expression typed into an amount, as its result; null when there is nothing to work out. */
export function settledAmount(text: string, locale: string): string | null {
  if (!/[+\-×x*/÷]/.test(text.trim().replace(/^-/, ""))) return null;
  const amount = evaluateAmount(text, locale);
  return amount === null ? null : formatAmountInput(amount, locale);
}

/** Shows a stored amount for editing, in this browser's decimal mark. */
export function formatAmountInput(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { useGrouping: false, maximumFractionDigits: 2 }).format(value);
}

/**
 * An amount in its currency for an editor's own lines (a split's sum, what is
 * left to place). Never masked: the editor is working on these amounts, so
 * they show even with balances hidden.
 */
export function currencyAmount(value: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(value);
  } catch {
    return `${currency} ${formatDecimal(value, locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

/** An amount in another currency at the rates on screen, or null without one. */
export function convertAmount(model: Model, amount: number, from: string, to: string): number | null {
  if (from === to) return amount;
  const base = model.toBase(amount, from);
  const unit = model.toBase(1, to);
  return base == null || !unit ? null : base / unit;
}

/** An amount field with its currency in front, as the app's currency inputs. */
export function MoneyField({
  label,
  value,
  onChange,
  currency,
  error,
  hint,
  disabled,
  autoFocus,
}: {
  label?: ReactNode;
  value: string;
  onChange: (value: string) => void;
  currency: string;
  error?: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const { fullModel: model } = useDashboard();
  const f = useFormat();
  const field = (
    <span className={`flex h-12 items-center gap-2 rounded-2xl border bg-background-subtle/60 px-4 focus-within:border-primary focus-within:bg-card ${error ? "border-error/60" : "border-border"}`}>
      <span className="shrink-0 text-[14.5px] font-bold text-foreground-muted">{currency === model.currency ? model.symbol : currency}</span>
      <input
        data-autofocus={autoFocus || undefined}
        inputMode="decimal"
        autoComplete="off"
        value={value}
        placeholder="0"
        disabled={disabled}
        aria-invalid={Boolean(error)}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => {
          const settled = settledAmount(value, f.locale);
          if (settled !== null) onChange(settled);
        }}
        className="tabular h-full min-w-0 flex-1 bg-transparent text-[14.5px] text-foreground outline-none placeholder:text-foreground-muted disabled:text-foreground-muted"
      />
    </span>
  );
  return label ? (
    <Field label={label} error={error} hint={hint}>
      {field}
    </Field>
  ) : (
    field
  );
}

// --------------------------------------------------------------- categories --

/** Top-level categories of a type and their children, in the app's order. */
export function categoryTree(model: Model, type: "expense" | "income", keep?: string | null) {
  const live = [...model.categories.values()].filter((c) => c.type === type && (!c.deleted || c.id === keep));
  const order = (a: Category, b: Category) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
  return live
    .filter((c) => !c.parentId || !live.some((p) => p.id === c.parentId))
    .sort(order)
    .map((parent) => ({ parent, children: live.filter((c) => c.parentId === parent.id).sort(order) }));
}

/** "Parent / Child", the name the app gives a subcategory. */
export function categoryLabel(model: Model, id: string | null | undefined): string | null {
  const category = id ? model.categories.get(id) : null;
  if (!category) return null;
  const parent = category.parentId ? model.categories.get(category.parentId) : null;
  return parent ? `${parent.name} / ${category.name}` : category.name;
}

/**
 * The app's category grid: two columns of parents, a subcategory panel that
 * opens under a parent with children, and a tap on an open parent picking the
 * parent itself.
 */
export function CategoryGrid({ type, value, onChange, keep }: { type: "expense" | "income"; value: string | null; onChange: (id: string) => void; keep?: string | null }) {
  const t = useTranslations("dashboard.edit");
  const { fullModel: model } = useDashboard();
  const tree = useMemo(() => categoryTree(model, type, keep ?? value), [model, type, keep, value]);
  const selectedParent = useMemo(() => {
    const selected = value ? model.categories.get(value) : null;
    return selected?.parentId ?? selected?.id ?? null;
  }, [model, value]);
  const [open, setOpen] = useState<string | null>(() => (tree.find((node) => node.parent.id === selectedParent && node.children.length) ? selectedParent : null));

  if (!tree.length) return <p className="py-6 text-center text-[13px] text-foreground-muted">{t("noCategories")}</p>;

  // Rows of two, each followed by the panel of a parent in it that is open.
  const rows: (typeof tree)[] = [];
  for (let index = 0; index < tree.length; index += 2) rows.push(tree.slice(index, index + 2));
  return (
    <div className="space-y-2">
      {rows.map((row) => {
        const expanded = row.find((node) => node.parent.id === open && node.children.length);
        return (
          <div key={row[0].parent.id} className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              {row.map(({ parent, children }) => {
                const active = parent.id === selectedParent;
                const isOpen = open === parent.id;
                return (
                  <button
                    key={parent.id}
                    type="button"
                    aria-pressed={value === parent.id}
                    aria-expanded={children.length ? isOpen : undefined}
                    onClick={() => {
                      if (!children.length) {
                        onChange(parent.id);
                        return;
                      }
                      // An open parent picks itself; a closed one opens.
                      if (isOpen) onChange(parent.id);
                      else setOpen(parent.id);
                    }}
                    className={`flex min-w-0 items-center gap-2.5 rounded-2xl border px-3 py-3 text-left text-[14px] font-bold transition-colors ${
                      active ? "border-primary/30 bg-primary/15 text-primary-dark" : "border-transparent bg-background-subtle/70 text-foreground hover:bg-background-subtle"
                    }`}
                  >
                    <CategoryGlyph icon={parent.icon} name={parent.name} color={parent.color} size={22} />
                    <span className="min-w-0 flex-1 truncate">{parent.name}</span>
                    {value === parent.id ? (
                      <Check />
                    ) : children.length ? (
                      <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden="true" className={`shrink-0 text-foreground-muted transition-transform ${isOpen ? "rotate-180" : ""}`}>
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    ) : null}
                  </button>
                );
              })}
            </div>
            {expanded ? (
              <div className="grid grid-cols-2 gap-2 rounded-2xl bg-primary/[0.06] p-2">
                {expanded.children.map((child) => {
                  const active = value === child.id;
                  // A child draws its icon only where it differs from its parent's.
                  const ownIcon = child.icon && child.icon !== expanded.parent.icon;
                  return (
                    <button
                      key={child.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => onChange(child.id)}
                      className={`flex min-w-0 items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-[13.5px] font-semibold transition-colors ${
                        active ? "border-primary/40 bg-primary/20 text-primary-dark" : "border-border/60 bg-card text-foreground hover:bg-background-subtle"
                      }`}
                    >
                      {ownIcon ? <CategoryGlyph icon={child.icon} name={child.name} size={18} /> : null}
                      <span className="min-w-0 flex-1 truncate">{child.name}</span>
                      {active ? <Check /> : null}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function Check() {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
      <path d="m5 12 5 5 9-10" />
    </svg>
  );
}

/** The category grid in a sheet, as the app's category picker. */
export function CategoryPickerSheet({ type, value, onChange, onClose }: { type: "expense" | "income"; value: string | null; onChange: (id: string) => void; onClose: () => void }) {
  const t = useTranslations("dashboard.edit");
  return (
    <Sheet title={t("categories")} onClose={onClose}>
      <CategoryGrid
        type={type}
        value={value}
        onChange={(id) => {
          onChange(id);
          onClose();
        }}
      />
    </Sheet>
  );
}

// ----------------------------------------------------------------- accounts --

/** The account a new entry starts on, as the app's editors pick it: the first that is not a goal or an archived loan. */
export function firstAccount(accounts: Account[]): Account | null {
  return accounts.find((account) => account.type !== "goal" && !account.loan?.archived) ?? accounts[0] ?? null;
}

type RuleRow = RecurringRuleRow & { to_amount?: number | null };

/** Active transfers paying into an account, as stored. */
export function transfersInto(model: Model, accountId: string): RuleRow[] {
  return ((model.raw.recurring_rules ?? []) as RuleRow[]).filter(
    (row) => !row.deleted_at && row.is_active !== 0 && row.type === "transfer" && row.to_account_id === accountId,
  );
}

/**
 * The limit a free plan has reached for a new (or restored) goal or loan, as
 * the app's Save checks it: active goals; for a loan, accounts (goals aside)
 * then active loans.
 */
export function newGoalOrLoanLimit(model: Model, kind: "goal" | "loan"): "goals" | "loans" | "accounts" | null {
  if (kind === "goal") {
    const active = model.accounts.filter((item) => item.type === "goal" && !item.goal?.archived).length;
    return active >= FREE_MAX_SAVINGS_GOALS ? "goals" : null;
  }
  if (model.accounts.filter((item) => item.type !== "goal").length >= FREE_MAX_ACCOUNTS) return "accounts";
  const loans = model.accounts.filter((item) => item.type === "loan" && !item.loan?.archived).length;
  return loans >= FREE_MAX_LOANS ? "loans" : null;
}

/**
 * The account's balance on the phone now, when it is not the one an editor
 * opened on (an entry was added since). The phone records a corrected balance
 * against its own, so a correction worked out from the old one would record
 * the wrong difference. Null while they agree.
 */
export function movedBalance(model: Model, account: Account, opened: number): number | null {
  const live = model.accountById.get(account.id)?.balance;
  return live !== undefined && Math.abs(live - opened) > 0.000001 ? live : null;
}

/** Accounts in the app's picker order: each group in turn, then ungrouped, then goals. */
export function accountSections(model: Model, keep?: (string | null | undefined)[]) {
  const visible = model.accounts.filter(
    (account) => keep?.includes(account.id) || !((account.goal?.archived ?? false) || (account.loan?.archived ?? false)),
  );
  const goals = visible.filter((account) => account.type === "goal");
  const rest = visible.filter((account) => account.type !== "goal");
  const sections: { title: string | null; accounts: Account[] }[] = [];
  const named = new Set(model.groups.map((group) => group.name));
  for (const group of model.groups) {
    const list = rest.filter((account) => account.group === group.name);
    if (list.length) sections.push({ title: group.name, accounts: list });
  }
  // Groups that live only on accounts, with no group record.
  for (const name of [...new Set(rest.map((account) => account.group).filter((name) => name && !named.has(name)))]) {
    sections.push({ title: name, accounts: rest.filter((account) => account.group === name) });
  }
  const ungrouped = rest.filter((account) => !account.group);
  if (ungrouped.length) sections.push({ title: sections.length ? "" : null, accounts: ungrouped });
  if (goals.length) sections.push({ title: "\u0000goals", accounts: goals });
  return sections;
}

/** The app's account picker: grouped tiles with balances, an eye to hide them. */
export function AccountPickerSheet({
  value,
  onChange,
  onClose,
  disabledId,
  filter,
  title,
}: {
  value: string | null;
  onChange: (id: string) => void;
  onClose: () => void;
  disabledId?: string | null;
  filter?: (account: Account) => boolean;
  title?: string;
}) {
  const t = useTranslations("dashboard.edit");
  const { fullModel: model, hidden: masked } = useDashboard();
  const f = useFormat();
  const [hide, setHide] = useState(() => readHideBalances() || masked);
  const sections = useMemo(
    () =>
      accountSections(model, [value])
        .map((section) => ({ ...section, accounts: section.accounts.filter((account) => !filter || filter(account) || account.id === value) }))
        .filter((section) => section.accounts.length),
    [model, value, filter],
  );
  const toggleHide = () => {
    setHide((current) => {
      writeHideBalances(!current);
      return !current;
    });
  };
  return (
    <Sheet
      title={title ?? t("accounts")}
      onClose={onClose}
      headerAction={
        <button
          type="button"
          onClick={toggleHide}
          aria-label={hide ? t("showBalances") : t("hideBalances")}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-foreground-soft hover:bg-background-subtle"
        >
          <ClayImg name={hide ? "ui/eye-off" : "ui/eye"} size={20} />
        </button>
      }
    >
      {sections.length ? (
        <div className="space-y-4">
          {sections.map((section, index) => (
            <div key={`${section.title}-${index}`}>
              {section.title !== null ? (
                <p className="mb-2 px-1 text-[11.5px] font-extrabold uppercase tracking-[0.08em] text-foreground-muted">
                  {section.title === "\u0000goals" ? t("savingsGoals") : section.title || t("ungrouped")}
                </p>
              ) : null}
              <div className="grid grid-cols-2 gap-2">
                {section.accounts.map((account) => {
                  const active = account.id === value;
                  const disabled = account.id === disabledId;
                  const negative = account.netBase < 0;
                  return (
                    <button
                      key={account.id}
                      type="button"
                      disabled={disabled}
                      aria-pressed={active}
                      onClick={() => {
                        onChange(account.id);
                        onClose();
                      }}
                      className={`flex min-w-0 items-center gap-2.5 rounded-2xl border px-3 py-3 text-left transition-colors disabled:opacity-45 ${
                        active ? "border-primary/30 bg-primary/15" : "border-transparent bg-background-subtle/70 hover:bg-background-subtle"
                      }`}
                    >
                      <AccountLogo logoId={account.logoId} name={account.name} size={28} />
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-[14px] font-bold ${active ? "text-primary-dark" : "text-foreground"}`}>{account.name}</span>
                        <span className={`block truncate text-[12px] tabular ${negative ? "text-error" : "text-foreground-muted"}`}>
                          {hide ? "•••••" : f.foreign(account.balance, account.currency)}
                        </span>
                      </span>
                      {active ? <Check /> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="py-6 text-center text-[13px] text-foreground-muted">{t("noAccounts")}</p>
      )}
    </Sheet>
  );
}

const HIDE_KEY = "money2time-dashboard-picker-balances";
function readHideBalances(): boolean {
  try {
    return window.localStorage.getItem(HIDE_KEY) === "hidden";
  } catch {
    return false;
  }
}
function writeHideBalances(hide: boolean) {
  try {
    window.localStorage.setItem(HIDE_KEY, hide ? "hidden" : "shown");
  } catch {
    // A remembered eye is a convenience.
  }
}

/** The app's account chip: logo, name and a caret. */
export function AccountChip({ account, onClick, placeholder, disabled }: { account: Account | null; onClick: () => void; placeholder: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-9 max-w-[220px] items-center gap-2 rounded-full border border-border bg-background-subtle/60 px-3 text-[13px] font-bold text-foreground transition hover:bg-background-subtle disabled:opacity-60 disabled:hover:bg-background-subtle/60"
    >
      {account ? <AccountLogo logoId={account.logoId} name={account.name} size={16} /> : null}
      <span className={`min-w-0 truncate ${account ? "" : "text-foreground-muted"}`}>{account?.name ?? placeholder}</span>
      <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden="true" className="shrink-0 text-foreground-muted">
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>
  );
}

// -------------------------------------------------------------------- saving --

/** Reload for the editor around it, while the phone has a newer copy of its row than the one it opened on. */
const ReloadContext = createContext<(() => void) | null>(null);

/**
 * Keeps an editor on its row as it was when the sheet opened: the draft and
 * the `updated_at` sent with it are both taken from that copy, so a save never
 * overwrites a change made on the phone meanwhile; the phone refuses it as a
 * `conflict` instead. Once the phone's newer copy has arrived, the error line
 * offers Reload (`useEditRun().reload`), which starts the form over on it.
 * `fresh` finds the row in the data on screen (null when it is gone or new),
 * and `at` says which copy a row is; it may combine several rows' times when
 * the editor saves more than one (a goal and its auto-save).
 */
export function Reloadable<R>({ row, fresh, at, children }: { row: R; fresh: (row: R) => R | null | undefined; at: (row: R) => string | null | undefined; children: (row: R) => ReactNode }) {
  const [state, setState] = useState(() => ({ row, at: at(row) ?? null, generation: 0 }));
  const next = fresh(state.row);
  const newer = next != null && (at(next) ?? null) !== state.at ? next : null;
  const reload = newer ? () => setState((current) => ({ row: newer, at: at(newer) ?? null, generation: current.generation + 1 })) : null;
  return (
    <ReloadContext.Provider value={reload}>
      {/* A new generation remounts the form, so every field starts from the fresh row. */}
      <Fragment key={state.generation}>{children(state.row)}</Fragment>
    </ReloadContext.Provider>
  );
}

/**
 * Sends a batch to the phone and keeps what an editor shows meanwhile: busy
 * while it saves, and the phone's answer in words when it was not saved. A
 * refusal for a free-plan limit opens the Pro paywall instead. After a
 * `conflict`, `reload` starts the editor over on the phone's newer copy, once
 * it is here (see `Reloadable`).
 */
export function useEditRun() {
  const { link } = useDashboard();
  const t = useTranslations("dashboard.edit.errors");
  const paywall = usePaywall();
  const reloadLatest = useContext(ReloadContext);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<EditResult | null>(null);
  const inFlight = useRef(false);
  const run = useCallback(
    async (ops: EditOp[], action: DashboardEditAction): Promise<boolean> => {
      // A double click sends one change, not two.
      if (inFlight.current) return false;
      inFlight.current = true;
      setBusy(true);
      setResult(null);
      let outcome: EditResult;
      try {
        outcome = await link.edit(ops, action);
      } catch {
        // Sent or not, nothing confirmed it: the phone may have saved it.
        outcome = { ok: false, error: "unknown" };
      } finally {
        // Whatever happened, the editor is free again.
        inFlight.current = false;
        setBusy(false);
      }
      if (!outcome.ok && outcome.error === "pro_required") paywall(outcome.feature ?? "other");
      else setResult(outcome);
      return outcome.ok;
    },
    [link, paywall],
  );
  const error = result && !result.ok ? t(result.error) : null;
  const conflict = Boolean(result && !result.ok && result.error === "conflict");
  return {
    run,
    busy,
    error,
    ready: link.editing === "ready",
    clear: () => setResult(null),
    /** Shows a refusal found before sending, in the words the phone's would have. */
    fail: (code: EditErrorCode) => setResult({ ok: false, error: code }),
    reload: conflict ? reloadLatest : null,
  };
}

/** The line an editor shows when changes cannot reach the phone right now. */
export function EditBlocked() {
  const t = useTranslations("dashboard.edit");
  const { link } = useDashboard();
  const state = link.editing;
  if (state === "ready" || state === "saving") return null;
  const text = state === "syncing" ? t("statusSyncingBody") : state === "update" ? t("statusUpdateBody") : state === "off" ? t("statusOffBody") : t("awayHint");
  return (
    <p role="note" className="flex items-start gap-2 rounded-2xl bg-background-subtle px-3.5 py-2.5 text-[12.5px] leading-snug text-foreground-soft">
      <ClayImg name={state === "syncing" ? "ui/refresh" : "status/lock-closed"} size={18} className={state === "syncing" ? "animate-spin" : ""} />
      {text}
    </p>
  );
}

/** An editor's error line, with Reload after a conflict once the phone's newer copy is here. */
export function EditError({ message, onReload }: { message: string | null; onReload?: (() => void) | null }) {
  const t = useTranslations("dashboard.edit");
  if (!message) return null;
  return (
    <div role="alert" className="flex flex-wrap items-center gap-2 rounded-2xl bg-error-soft px-3.5 py-2.5 text-[13px] font-semibold text-error">
      <p className="min-w-0 flex-1">{message}</p>
      {onReload ? (
        <button type="button" onClick={onReload} className="shrink-0 rounded-full bg-card px-3 py-1.5 text-[12.5px] font-extrabold text-error hover:bg-background-subtle">
          {t("reloadLatest")}
        </button>
      ) : null}
    </div>
  );
}

/**
 * The primary save button. With `form` it submits that form (it sits in the
 * sheet's footer, outside it), so Enter in a field saves too; a disabled or
 * busy button blocks both.
 */
export function SaveButton({ label, busy, disabled, onClick, form }: { label: string; busy: boolean; disabled?: boolean; onClick?: () => void; form?: string }) {
  const t = useTranslations("dashboard.edit");
  return (
    <button
      type={form ? "submit" : "button"}
      form={form}
      onClick={onClick}
      disabled={disabled || busy}
      className="inline-flex h-12 min-w-[140px] flex-1 items-center justify-center gap-2 rounded-2xl bg-primary px-5 text-[15px] font-extrabold text-card shadow-[var(--shadow-soft)] transition hover:bg-primary-dark disabled:opacity-50"
    >
      {busy ? t("statusSaving") : label}
    </button>
  );
}

/** An editor footer's Cancel, beside its Save. */
export function CancelButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  const t = useTranslations("dashboard.edit");
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-12 items-center justify-center rounded-2xl border border-border px-5 text-[14px] font-extrabold text-foreground-soft hover:bg-background-subtle disabled:opacity-50"
    >
      {t("cancel")}
    </button>
  );
}

/** The round delete button an editor's header carries, as the app's. */
export function DeleteButton({ onClick, label, disabled }: { onClick: () => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-error-soft text-error hover:bg-error/15 disabled:opacity-40"
    >
      <ClayImg name="ui/trash" size={18} />
    </button>
  );
}
