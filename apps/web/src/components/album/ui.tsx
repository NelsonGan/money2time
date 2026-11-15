"use client";

/* eslint-disable @next/next/no-img-element -- small clay art and mascots; this site serves pictures unoptimised (next.config.ts) */

import { useLocale, useTranslations } from "next-intl";
import { useCallback, useId, useState, type ButtonHTMLAttributes, type ReactNode } from "react";

import { CATEGORY_ICON_IDS } from "@/lib/backup/assets.generated";
import type { Member } from "@/lib/album/group";
import { media } from "@/lib/media";

export { Confirm, Sheet } from "@/components/dashboard/edit/kit";

// ------------------------------------------------------------------ money --

/**
 * An amount as the app writes it: in its own currency, never converted, the
 * symbol right against the number when it comes first ("RM48.00", "$12.50";
 * "48,00 €" keeps its space).
 */
function formatMoney(locale: string, amount: number, currency: string): string {
  try {
    const parts = new Intl.NumberFormat(locale, { style: "currency", currency, currencyDisplay: "narrowSymbol" }).formatToParts(amount);
    const symbolFirst = parts.findIndex((part) => part.type === "currency") < parts.findIndex((part) => part.type === "integer");
    return parts.filter((part, index) => !(symbolFirst && part.type === "literal" && /^\s+$/.test(part.value) && parts[index - 1]?.type === "currency")).map((part) => part.value).join("");
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/** A currency's symbol as the page's locale writes it ("RM", "$"), else its code. */
export function currencySymbol(locale: string, currency: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency, currencyDisplay: "narrowSymbol" }).formatToParts(0).find((part) => part.type === "currency")?.value ?? currency;
  } catch {
    return currency;
  }
}

export function useMoney() {
  const locale = useLocale();
  return useCallback((amount: number, currency: string) => formatMoney(locale, amount, currency), [locale]);
}

/** Currencies in the order the app lists an album's: the most used first. */
export function currencyOrder(currencies: Iterable<string>, counts: Map<string, number>): string[] {
  return [...new Set(currencies)].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || (a < b ? -1 : 1));
}

/** `2026-11-14` as the page's locale writes a day: "Nov 14", or "Nov 14, 2025" in another year. */
export function useDay() {
  const locale = useLocale();
  return useCallback(
    (day: string, options: { weekday?: boolean } = {}) => {
      const date = new Date(`${day}T12:00:00`);
      const thisYear = date.getFullYear() === new Date().getFullYear();
      return new Intl.DateTimeFormat(locale, {
        month: "short",
        day: "numeric",
        ...(thisYear ? {} : { year: "numeric" }),
        ...(options.weekday ? { weekday: "short" } : {}),
      }).format(date);
    },
    [locale],
  );
}

/** Today in the visitor's own time zone, as `YYYY-MM-DD`. */
export function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

// ----------------------------------------------------------------- people --

/** The app's person colours: each member keeps theirs by their place in the album. */
const PERSON_COLORS = ["#4E7BD1", "#1E9468", "#D9822B", "#8E6FD8", "#C8579A", "#2E9AA8", "#B88A2E", "#6B7A77"];

export function personColor(members: readonly Member[], id: string, selfId: string | null): string | null {
  if (id === selfId) return null;
  const others = members.filter((member) => member.id !== selfId);
  const index = others.findIndex((member) => member.id === id);
  return PERSON_COLORS[(index < 0 ? 0 : index) % PERSON_COLORS.length];
}

/** A person's initial in a circle: the user's own on the soft rose the app gives "Me". */
export function Avatar({ name, color, size = 32, ring = false }: { name: string; color: string | null; size?: number; ring?: boolean }) {
  const letter = Array.from(name.trim())[0]?.toUpperCase() ?? "?";
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-full font-bold ${ring ? "ring-2 ring-card" : ""}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.42),
        background: color ?? "var(--primary-soft)",
        color: color ? "#FFFFFF" : "var(--primary)",
      }}
    >
      {letter}
    </span>
  );
}

/** Up to four people, overlapping, as on the album's cover. */
export function AvatarStack({ people, size = 30 }: { people: { id: string; name: string; color: string | null }[]; size?: number }) {
  const shown = people.slice(0, 4);
  const more = people.length - shown.length;
  return (
    <span className="flex items-center">
      {shown.map((person, index) => (
        <span key={person.id} style={{ marginLeft: index ? -size * 0.3 : 0 }}>
          <Avatar name={person.name} color={person.color} size={size} ring />
        </span>
      ))}
      {more > 0 ? (
        <span
          className="inline-flex items-center justify-center rounded-full bg-background-subtle text-[11px] font-bold text-foreground-soft ring-2 ring-card"
          style={{ width: size, height: size, marginLeft: -size * 0.3 }}
        >
          +{more}
        </span>
      ) : null}
    </span>
  );
}

// ------------------------------------------------------------- categories --

/**
 * The app's default expense categories, which a bill made here carries by
 * name and icon: each phone files it under its own category of that name
 * (else that icon, else Other), as it does every shared bill.
 */
export const BILL_CATEGORIES = [
  { key: "food", name: "Food", icon: "meal" },
  { key: "groceries", name: "Groceries", icon: "grocery-basket" },
  { key: "transport", name: "Transport", icon: "car" },
  { key: "housing", name: "Housing", icon: "house" },
  { key: "bills", name: "Bills", icon: "light-bulb" },
  { key: "healthcare", name: "Healthcare", icon: "medicine" },
  { key: "shopping", name: "Shopping", icon: "shopping-bag" },
  { key: "other", name: "Other", icon: "invoice" },
] as const;

/** A bill's category as words: a default one in the page's language, anyone's own as they named it. */
export function useCategoryLabel() {
  const t = useTranslations("album.categories");
  return useCallback(
    (name: string | null, icon: string | null) => {
      const known = BILL_CATEGORIES.find((category) => category.name === name || (!name && category.icon === icon));
      return known ? t(known.key) : (name?.trim() ?? "");
    },
    [t],
  );
}

/** A category's clay icon, as the app draws it; its initial when this site has no such icon. */
export function CategoryIcon({ icon, name, size = 36 }: { icon: string | null; name: string; size?: number }) {
  const id = icon?.includes("/") ? icon.split("/").pop()! : icon;
  if (id && CATEGORY_ICON_IDS.has(id)) {
    return <img src={`/dashboard-assets/categories/${id}.webp`} alt="" width={size} height={size} className="block shrink-0 object-contain" style={{ width: size, height: size }} draggable={false} />;
  }
  if (icon?.startsWith("emoji:")) {
    return (
      <span aria-hidden="true" className="inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size, fontSize: size * 0.78, lineHeight: 1 }}>
        {icon.slice(6)}
      </span>
    );
  }
  return <img src="/dashboard-assets/categories/invoice.webp" alt="" width={size} height={size} className="block shrink-0 object-contain" style={{ width: size, height: size }} draggable={false} title={name} />;
}

export function Mascot({ pose, size = 112, className = "" }: { pose: "waving" | "love" | "thinking" | "searching" | "presenting" | "sleeping" | "laptop"; size?: number; className?: string }) {
  return <img src={media(`/mascots/${pose}.png`)} alt="" width={size} height={size} className={`block object-contain ${className}`} style={{ width: size, height: size }} draggable={false} />;
}

// ---------------------------------------------------------------- controls --

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "primary" | "soft" | "plain" | "danger" | "dark"; busy?: boolean; size?: "md" | "lg" | "sm" };

export function Button({ tone = "primary", busy, size = "md", className = "", children, disabled, ...props }: ButtonProps) {
  const tones = {
    primary: "bg-primary text-card shadow-[0_8px_20px_rgba(142,66,80,0.22)] hover:bg-primary-dark",
    soft: "bg-primary-soft text-primary hover:bg-primary-muted/60",
    plain: "border border-border bg-card text-foreground hover:bg-background-subtle",
    danger: "bg-error-soft text-error hover:bg-error/15",
    dark: "bg-foreground text-card hover:opacity-90",
  };
  const sizes = { sm: "h-9 px-4 text-[13.5px]", md: "h-12 px-5 text-[15px]", lg: "h-14 px-6 text-[16px]" };
  return (
    <button
      type="button"
      {...props}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-full font-bold tracking-[-0.01em] transition-[transform,background-color,opacity] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55 ${tones[tone]} ${sizes[size]} ${className}`}
    >
      {busy ? <Spinner /> : null}
      {children}
    </button>
  );
}

export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className="animate-spin" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** The app's switch: rosewood when on. */
export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (value: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-[30px] w-[52px] shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${checked ? "bg-primary" : "bg-border"}`}
    >
      <span className={`absolute h-[24px] w-[24px] rounded-full bg-card shadow transition-transform ${checked ? "translate-x-[25px]" : "translate-x-[3px]"}`} />
    </button>
  );
}

/** The app's segmented control: one rounded track, the chosen segment filled. */
export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: ReactNode; title?: string }[]; onChange: (value: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-[18px] border border-border bg-background-subtle p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          title={option.title}
          onClick={() => onChange(option.value)}
          className={`min-w-0 flex-1 rounded-[14px] px-2 py-2 text-[13.5px] font-bold transition-colors ${value === option.value ? "bg-primary text-card shadow-sm" : "text-foreground-soft hover:text-foreground"}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** An (i) that explains a setting on tap, as the app's info buttons do, instead of a caption under it. */
export function InfoTip({ text, label }: { text: string; label: string }) {
  const [open, setOpen] = useState<{ left: number; width: number } | null>(null);
  const id = useId();
  const show = (button: HTMLButtonElement) => {
    // Kept on screen whatever side of it the button is on.
    const rect = button.getBoundingClientRect();
    const width = Math.min(256, window.innerWidth - 32);
    const wanted = rect.left + rect.width / 2 - width / 2;
    const left = Math.min(Math.max(wanted, 16), window.innerWidth - 16 - width) - rect.left;
    setOpen({ left, width });
  };
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label={label}
        aria-expanded={!!open}
        aria-describedby={open ? id : undefined}
        onClick={(event) => (open ? setOpen(null) : show(event.currentTarget))}
        onBlur={() => setOpen(null)}
        className="inline-flex h-7 w-7 items-center justify-center rounded-full text-foreground-muted hover:text-foreground"
      >
        <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5M12 8h.01" strokeLinecap="round" />
        </svg>
      </button>
      {open ? (
        <span
          id={id}
          role="tooltip"
          style={{ left: open.left, width: open.width }}
          className="absolute top-8 z-20 whitespace-pre-line rounded-[14px] bg-foreground px-3 py-2 text-[12.5px] font-medium leading-snug text-card shadow-lg"
        >
          {text}
        </span>
      ) : null}
    </span>
  );
}

export function Icon({ name, size = 20 }: { name: "back" | "plus" | "people" | "chevron" | "close" | "check" | "arrow" | "copy" | "share" | "logout" | "mail" | "down"; size?: number }) {
  const paths: Record<typeof name, ReactNode> = {
    back: <path d="M15 5l-7 7 7 7" />,
    plus: <path d="M12 5v14M5 12h14" />,
    people: (
      <>
        <circle cx="9" cy="8" r="3.2" />
        <path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" />
        <path d="M15.5 5.2a3.2 3.2 0 0 1 0 5.8M17 14.2c1.9.6 3.1 2.2 3.5 4.8" />
      </>
    ),
    chevron: <path d="M9 5l7 7-7 7" />,
    down: <path d="M5 9l7 7 7-7" />,
    close: <path d="M6 6l12 12M18 6 6 18" />,
    check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
    arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
    copy: (
      <>
        <rect x="8" y="8" width="11" height="11" rx="2.5" />
        <path d="M5 15V7a2 2 0 0 1 2-2h8" />
      </>
    ),
    share: <path d="M12 4v11M7.5 8.5 12 4l4.5 4.5M5 13v4.5A2.5 2.5 0 0 0 7.5 20h9a2.5 2.5 0 0 0 2.5-2.5V13" />,
    logout: <path d="M15 4h2.5A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5H15M10 8l-4 4 4 4M6 12h10" />,
    mail: (
      <>
        <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
        <path d="M4.5 7l7.5 6 7.5-6" />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

/** The app's wordmark, small, for the top of the page. */
export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2 text-[19px] font-extrabold leading-none tracking-[-0.04em]">
      <img src={media("/icon.png")} alt="" width={28} height={28} className="h-7 w-7 rounded-[28%]" />
      <span>
        <span className="text-[var(--wordmark-money)]">Money</span>
        <span className="relative -top-[0.55em] text-[0.5em] text-[var(--wordmark-two)]">2</span>
        <span className="text-[var(--wordmark-time)]">Time</span>
      </span>
    </span>
  );
}
