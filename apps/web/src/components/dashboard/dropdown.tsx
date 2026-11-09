"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";

import type { Model } from "@/lib/backup/model";

import { accountSections, categoryTree } from "./edit/kit";
import { AccountLogo, CategoryGlyph, ClayImg } from "./ui";

/*
 * Dropdowns drawn by the dashboard rather than the browser, so each choice can
 * carry its icon (a category's glyph, an account's logo), subcategories can sit
 * under their parent, and long lists can be searched. A menu opens under its
 * button, closes on Escape or a click outside, and works from the keyboard:
 * the arrow keys move through the choices and Enter picks one.
 */

export type MenuOption = {
  value: string;
  label: string;
  icon?: ReactNode;
  /** 1 for a subcategory, drawn under its parent. */
  depth?: number;
  /** The parent's value, so a matching subcategory keeps its parent in view. */
  parent?: string;
  /** A heading above this choice and the ones after it, until the next. */
  section?: string;
  /** Extra words the search matches. */
  keywords?: string;
  /** Shown at the end of the row. */
  hint?: ReactNode;
  disabled?: boolean;
};

/**
 * Closes `open` things on Escape or a press outside `ref`. Escape from inside
 * also hands focus back to the button that opened it (the one in `ref` marked
 * expanded), so the keyboard does not lose its place to the page.
 */
export function useDismiss(ref: RefObject<HTMLElement | null>, open: boolean, close: () => void) {
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) closeRef.current();
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        // Handled: the page's own Escape (clearing a selection) leaves it.
        event.preventDefault();
        const trigger = ref.current?.querySelector<HTMLElement>('button[aria-expanded="true"]');
        const inside = Boolean(ref.current?.contains(document.activeElement));
        closeRef.current();
        if (inside) trigger?.focus();
      }
    };
    // Capture: Escape reaches the open menu before the page's own handlers (clearing a selection).
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open, ref]);
}

function Check() {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-primary">
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

export function Caret({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" width={14} height={14} aria-hidden="true" className={`shrink-0 text-foreground-muted ${className}`}>
      <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * The choices of a menu, with a search box over long lists. Used inside a
 * dropdown, or in a popover of its own (the bulk bar's).
 */
export function OptionMenu({
  options,
  value,
  onSelect,
  searchable,
  label,
}: {
  options: MenuOption[];
  value?: string | null;
  onSelect: (value: string) => void;
  searchable?: boolean;
  label: string;
}) {
  const t = useTranslations("dashboard.dropdown");
  const id = useId();
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const shown = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return options;
    const hits = new Set(options.filter((option) => `${option.label} ${option.keywords ?? ""}`.toLocaleLowerCase().includes(needle)).map((option) => option.value));
    // A matching subcategory brings its parent, so it reads in place.
    for (const option of options) if (option.parent && hits.has(option.value)) hits.add(option.parent);
    return options.filter((option) => hits.has(option.value));
  }, [options, query]);
  const choosable = shown.filter((option) => !option.disabled);
  const [active, setActive] = useState<string | null>(null);
  const activeValue = active && choosable.some((option) => option.value === active) ? active : (choosable.find((option) => option.value === value)?.value ?? choosable[0]?.value ?? null);

  useEffect(() => {
    if (searchable) inputRef.current?.focus();
    else listRef.current?.focus();
  }, [searchable]);
  useEffect(() => {
    if (!activeValue) return;
    listRef.current?.querySelector(`[data-value="${CSS.escape(activeValue)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activeValue]);

  const onKeyDown = (event: KeyboardEvent) => {
    const index = choosable.findIndex((option) => option.value === activeValue);
    const go = (next: number) => {
      event.preventDefault();
      const option = choosable[Math.max(0, Math.min(choosable.length - 1, next))];
      if (option) setActive(option.value);
    };
    if (event.key === "ArrowDown") go(index + 1);
    else if (event.key === "ArrowUp") go(index - 1);
    else if (event.key === "Home" && !searchable) go(0);
    else if (event.key === "End" && !searchable) go(choosable.length - 1);
    else if (event.key === "Enter" && activeValue) {
      event.preventDefault();
      onSelect(activeValue);
    }
  };

  const optionId = (option: string) => `${id}-${option}`;
  return (
    <div className="flex max-h-[min(420px,60dvh)] flex-col">
      {searchable ? (
        <div className="shrink-0 border-b border-border p-2">
          <div className="flex h-9 items-center gap-2 rounded-xl bg-background-subtle px-3">
            <ClayImg name="ui/search" size={15} />
            <input
              ref={inputRef}
              role="combobox"
              aria-expanded="true"
              aria-controls={`${id}-list`}
              aria-activedescendant={activeValue ? optionId(activeValue) : undefined}
              aria-label={label}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(null);
              }}
              onKeyDown={onKeyDown}
              placeholder={t("search")}
              className="h-full min-w-0 flex-1 bg-transparent text-[13.5px] text-foreground outline-none placeholder:text-foreground-muted"
            />
          </div>
        </div>
      ) : null}
      <ul
        ref={listRef}
        id={`${id}-list`}
        role="listbox"
        aria-label={label}
        tabIndex={searchable ? -1 : 0}
        aria-activedescendant={!searchable && activeValue ? optionId(activeValue) : undefined}
        onKeyDown={searchable ? undefined : onKeyDown}
        className="min-h-0 flex-1 overflow-y-auto p-1.5 outline-none"
      >
        {shown.length ? (
          sections(shown).map(({ section, items }, index) => {
            const rows = items.map((option) => {
              const selected = option.value === value;
              const isActive = option.value === activeValue;
              return (
                <div
                  key={option.value}
                  id={optionId(option.value)}
                  data-value={option.value}
                  role="option"
                  aria-selected={selected}
                  aria-disabled={option.disabled || undefined}
                  onPointerMove={() => !option.disabled && setActive(option.value)}
                  onClick={() => !option.disabled && onSelect(option.value)}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-xl py-2 pr-2.5 text-[13.5px] ${option.depth ? "pl-8" : "pl-2.5"} ${
                    option.disabled ? "cursor-default opacity-40" : isActive ? "bg-background-subtle" : ""
                  } ${selected ? "font-bold text-foreground" : "text-foreground"}`}
                >
                  {option.icon ? <span className="flex shrink-0 items-center">{option.icon}</span> : null}
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  {option.hint ? <span className="shrink-0 text-[12px] text-foreground-muted">{option.hint}</span> : null}
                  {selected ? <Check /> : null}
                </div>
              );
            });
            // A heading names its choices as a group; the visible text is its label, read once.
            return section ? (
              <li key={`${section}-${index}`} role="group" aria-label={section}>
                <p aria-hidden="true" className={`px-2.5 pb-1 text-[11px] font-extrabold uppercase tracking-[0.07em] text-foreground-muted ${index === 0 ? "pt-1" : "pt-2.5"}`}>
                  {section}
                </p>
                {rows}
              </li>
            ) : (
              <li key={items[0].value} role="none">
                {rows}
              </li>
            );
          })
        ) : (
          <li className="px-2.5 py-3 text-[13px] text-foreground-muted">{t("noMatch")}</li>
        )}
      </ul>
    </div>
  );
}

/** Consecutive choices under the same heading, in order; choices with no heading stand alone. */
function sections(options: MenuOption[]): { section: string | undefined; items: MenuOption[] }[] {
  const out: { section: string | undefined; items: MenuOption[] }[] = [];
  for (const option of options) {
    const last = out[out.length - 1];
    if (option.section && last && last.section === option.section) last.items.push(option);
    else out.push({ section: option.section, items: [option] });
  }
  return out;
}

/** A floating panel under its button, nudged sideways to stay on screen. */
export function Popover({ children, align = "left", width = 288 }: { children: ReactNode; align?: "left" | "right"; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  // Measured once it is drawn, before it shows.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const margin = 16;
    const right = window.innerWidth - margin;
    const nudge = rect.right > right ? Math.max(margin - rect.left, right - rect.right) : rect.left < margin ? margin - rect.left : 0;
    if (nudge) el.style.transform = `translateX(${nudge}px)`;
  }, []);
  return (
    <div
      ref={ref}
      style={{ width }}
      className={`absolute top-[calc(100%+6px)] z-40 max-w-[calc(100vw-32px)] overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-float-lg)] ${align === "right" ? "right-0" : "left-0"}`}
    >
      {children}
    </div>
  );
}

/** A filter's dropdown: a pill showing the choice and its icon, opening a menu of the choices. */
export function Dropdown({
  label,
  value,
  options,
  onChange,
  searchable,
  align,
  width,
  className = "",
}: {
  label: string;
  value: string;
  options: MenuOption[];
  onChange: (value: string) => void;
  searchable?: boolean;
  align?: "left" | "right";
  width?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  useDismiss(ref, open, () => setOpen(false));
  const current = options.find((option) => option.value === value) ?? options[0];
  const filtered = value !== options[0]?.value;
  return (
    <div ref={ref} className={`relative inline-flex max-w-full ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${current?.label ?? ""}`}
        onClick={() => setOpen((was) => !was)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={`inline-flex h-10 w-full min-w-0 items-center gap-2 rounded-full border bg-card pl-3 pr-3.5 text-[13.5px] font-semibold shadow-[var(--shadow-soft)] outline-none transition-colors hover:border-foreground/25 focus-visible:border-primary ${
          filtered ? "border-primary/40 text-foreground" : "border-border text-foreground"
        }`}
      >
        {current?.icon ? <span className="flex shrink-0 items-center">{current.icon}</span> : null}
        <span className="min-w-0 flex-1 truncate text-left">{current?.label}</span>
        <Caret className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <Popover align={align} width={width}>
          <OptionMenu
            options={options}
            value={value}
            label={label}
            searchable={searchable}
            onSelect={(next) => {
              onChange(next);
              setOpen(false);
              buttonRef.current?.focus();
            }}
          />
        </Popover>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ choices --

/** Categories as the app lists them: each type's parents in order, each followed by its subcategories in order. */
export function categoryOptions(model: Model, types: ("expense" | "income")[], titles: Record<"expense" | "income", string>): MenuOption[] {
  const out: MenuOption[] = [];
  for (const type of types) {
    for (const { parent, children } of categoryTree(model, type)) {
      out.push({ value: parent.id, label: parent.name, section: types.length > 1 ? titles[type] : undefined, icon: <CategoryGlyph icon={parent.icon} name={parent.name} color={parent.color} size={22} /> });
      for (const child of children) {
        out.push({
          value: child.id,
          label: child.name,
          depth: 1,
          parent: parent.id,
          keywords: parent.name,
          section: types.length > 1 ? titles[type] : undefined,
          icon: <CategoryGlyph icon={child.icon} name={child.name} color={child.color} size={18} />,
        });
      }
    }
  }
  return out;
}

/** Accounts in the app's picker order, under their group headings, with their logos. */
export function accountOptions(model: Model, titles: { ungrouped: string; goals: string }, filter?: (id: string) => boolean): MenuOption[] {
  return accountSections(model).flatMap((section) =>
    section.accounts
      .filter((account) => !filter || filter(account.id))
      .map((account) => ({
        value: account.id,
        label: account.name,
        section: section.title === "\u0000goals" ? titles.goals : section.title === "" ? titles.ungrouped : (section.title ?? undefined),
        keywords: section.title ?? "",
        icon: <AccountLogo logoId={account.logoId} name={account.name} size={22} />,
      })),
  );
}
