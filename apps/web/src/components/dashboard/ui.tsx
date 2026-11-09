"use client";

/* eslint-disable @next/next/no-img-element -- icons and user photos are tiny
   static files or in-memory object URLs; next/image adds nothing for either. */

import { useTranslations } from "next-intl";
import type { KeyboardEvent, ReactNode, SelectHTMLAttributes } from "react";

import { ACCOUNT_LOGOS, CATEGORY_ICON_IDS, ITEM_ICONS, SUBSCRIPTION_LOGOS } from "@/lib/backup/assets.generated";

import { useDashboard } from "./state";
import { media } from "@/lib/media";

export function Card({
  title,
  subtitle,
  action,
  children,
  className = "",
  icon,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  icon?: string;
}) {
  return (
    <section className={`card-surface min-w-0 rounded-[22px] ${className}`}>
      {title ? (
        <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-5 pt-5 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            {icon ? <ClayImg name={icon} size={28} /> : null}
            <div className="min-w-0">
              <h2 className="text-[17px] font-extrabold tracking-[-0.01em] text-foreground">{title}</h2>
              {subtitle ? <p className="mt-0.5 text-[13px] text-foreground-soft">{subtitle}</p> : null}
            </div>
          </div>
          {action ? <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">{action}</div> : null}
        </header>
      ) : null}
      {/* A container, so a card lays its content out by its own width. */}
      <div className="@container px-5 pb-5 pt-4 sm:px-6">{children}</div>
    </section>
  );
}

export function ClayImg({ name, size = 32, className = "" }: { name: string; size?: number; className?: string }) {
  return (
    <img
      src={media(`/clay-icons/${name}.png`)}
      alt=""
      width={size}
      height={size}
      className={`block shrink-0 object-contain ${className}`}
      draggable={false}
    />
  );
}

export function Delta({
  current,
  previous,
  invert = false,
  label,
  formatPercent,
}: {
  current: number;
  previous: number;
  /** For spending, going down is good. */
  invert?: boolean;
  label?: ReactNode;
  formatPercent: (value: number) => string;
}) {
  if (!previous || !Number.isFinite(previous)) return null;
  const change = (current - previous) / Math.abs(previous);
  if (!Number.isFinite(change)) return null;
  const up = change > 0;
  const good = invert ? !up : up;
  const flat = Math.abs(change) < 0.005;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-bold ${
        flat ? "bg-surface-muted text-foreground-soft" : good ? "bg-success-soft text-success" : "bg-error-soft text-error"
      }`}
    >
      <span aria-hidden="true">{flat ? "•" : up ? "▲" : "▼"}</span>
      {formatPercent(Math.abs(change))}
      {label ? <span className="font-semibold opacity-80">{label}</span> : null}
    </span>
  );
}

export function Kpi({
  icon,
  label,
  value,
  sub,
  delta,
  tone,
}: {
  icon: string;
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  delta?: ReactNode;
  tone?: "income" | "expense" | "neutral";
}) {
  const bar = tone === "income" ? "bg-success" : tone === "expense" ? "bg-primary" : "bg-accent";
  return (
    <section className="card-surface relative min-w-0 overflow-hidden rounded-[22px] px-5 py-4">
      <span aria-hidden="true" className={`absolute inset-x-0 top-0 h-1 ${bar} opacity-70`} />
      <div className="flex items-start gap-3">
        <ClayImg name={icon} size={44} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-foreground-soft">{label}</p>
          <p className="tabular mt-0.5 truncate text-[24px] font-extrabold leading-tight tracking-[-0.02em] text-foreground 2xl:text-[26px]" title={typeof value === "string" ? value : undefined}>{value}</p>
          {sub ? <div className="mt-1 text-[13px] font-semibold text-foreground-soft">{sub}</div> : null}
          {delta ? <div className="mt-2">{delta}</div> : null}
        </div>
      </div>
    </section>
  );
}

/**
 * A dropdown with the browser's caret replaced by one inset like the rest of
 * the pill, so the padding is even on both sides in every browser.
 */
export function Select({ className = "", children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className={`relative inline-flex max-w-full ${className}`}>
      <select
        {...props}
        className="h-10 w-full min-w-0 cursor-pointer appearance-none truncate rounded-full border border-border bg-card pl-4 pr-10 text-[13.5px] font-semibold text-foreground shadow-[var(--shadow-soft)] outline-none transition-colors hover:border-foreground/25 focus-visible:border-primary"
      >
        {children}
      </select>
      <svg
        viewBox="0 0 16 16"
        width={14}
        height={14}
        aria-hidden="true"
        className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-foreground-muted"
      >
        <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  onLocked,
}: {
  /** `locked`: shown with a lock; choosing it calls `onLocked` instead. */
  options: { value: T; label: ReactNode; locked?: boolean; lockedLabel?: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  onLocked?: (value: T) => void;
}) {
  // A radio group is one tab stop; the arrow keys move between its options,
  // choosing each open one and only landing on a locked one (Enter opens it).
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("[role=radio]")];
    const from = Math.max(0, buttons.indexOf(document.activeElement as HTMLButtonElement));
    const next = (from + step + options.length) % options.length;
    if (!options[next].locked) onChange(options[next].value);
    buttons[next]?.focus();
  };
  return (
    <div role="radiogroup" aria-label={label} onKeyDown={onKeyDown} className="inline-flex rounded-full border border-border bg-card p-1 shadow-[var(--shadow-soft)]">
      {options.map((option, i) => {
        const active = option.value === value;
        const focusable = active || (i === 0 && !options.some((o) => o.value === value));
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            data-value={option.value}
            aria-checked={active}
            aria-label={option.locked ? option.lockedLabel : undefined}
            tabIndex={focusable ? 0 : -1}
            onClick={() => (option.locked ? onLocked?.(option.value) : onChange(option.value))}
            className={`inline-flex items-center gap-1 rounded-full px-3.5 py-1.5 text-[13px] font-bold transition-colors ${
              active ? "bg-primary text-card shadow-[var(--shadow-soft)]" : option.locked ? "text-foreground-muted hover:text-foreground-soft" : "text-foreground-soft hover:text-foreground"
            }`}
          >
            {option.label}
            {option.locked ? (
              <svg viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="-mr-0.5">
                <rect x="5" y="11" width="14" height="10" rx="2" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
              </svg>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function Progress({ ratio, color, marker }: { ratio: number; color: string; marker?: number }) {
  const width = Math.max(0, Math.min(1, ratio)) * 100;
  return (
    <div className="relative h-2.5 w-full overflow-hidden rounded-full" style={{ background: "#F2EFE7" }}>
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${width}%`, background: color }} />
      {marker !== undefined ? (
        <span
          aria-hidden="true"
          className="absolute top-0 h-full w-0.5 bg-foreground/60"
          style={{ left: `${Math.max(0, Math.min(1, marker)) * 100}%` }}
        />
      ) : null}
    </div>
  );
}

/**
 * Fresh data on its way: the transfer's share while it arrives, and a moving
 * bar while there is no share to show (the phone building its export, or this
 * browser opening it).
 */
export function TransferBar({ label, progress, className = "" }: { label: string; progress: number | null; className?: string }) {
  const percent = progress === null ? null : Math.round(progress * 100);
  return (
    <div
      className={`relative overflow-hidden rounded-full ${className}`}
      role="progressbar"
      aria-label={label}
      aria-valuenow={percent ?? undefined}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      {percent === null ? (
        <div className="animate-indeterminate absolute inset-y-0 left-0 w-2/5 rounded-full bg-primary" />
      ) : (
        <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${Math.max(4, percent)}%` }} />
      )}
    </div>
  );
}

export function Empty({ title, body, mascot = "sleeping" }: { title: ReactNode; body?: ReactNode; mascot?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <img src={media(`/mascots/${mascot}.png`)} alt="" width={96} height={96} className="mb-1 h-24 w-24 object-contain" draggable={false} />
      <p className="text-[15px] font-bold text-foreground">{title}</p>
      {body ? <p className="max-w-[360px] text-[13px] text-foreground-soft">{body}</p> : null}
    </div>
  );
}

function Lettermark({ text, size, color = "#B1525F" }: { text: string; size: number; color?: string }) {
  const letter = Array.from(text.trim())[0]?.toUpperCase() ?? "?";
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-[30%] font-extrabold text-card"
      style={{ width: size, height: size, background: color, fontSize: size * 0.45 }}
    >
      {letter}
    </span>
  );
}

/**
 * A category's icon as the app draws it: a bundled pack icon, a literal
 * emoji, or a photo the user uploaded. Icons from the alternate packs fall
 * back to the same id in the default pack.
 */
export function CategoryGlyph({
  icon,
  name,
  color,
  size = 28,
}: {
  icon: string | null | undefined;
  name: string;
  color?: string;
  size?: number;
}) {
  const { asset } = useDashboard();
  if (icon) {
    if (icon.startsWith("emoji:")) {
      return <span aria-hidden="true" className="inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size, fontSize: size * 0.78, lineHeight: 1 }}>{icon.slice(6)}</span>;
    }
    if (icon.startsWith("custom:")) {
      const url = asset(icon);
      if (url) return <img src={url} alt="" width={size} height={size} className="shrink-0 rounded-[25%] object-cover" style={{ width: size, height: size }} />;
    } else {
      const id = icon.includes("/") ? icon.split("/").pop()! : icon;
      if (CATEGORY_ICON_IDS.has(id)) {
        return <img src={`/dashboard-assets/categories/${id}.webp`} alt="" width={size} height={size} className="block shrink-0 object-contain" style={{ width: size, height: size }} draggable={false} />;
      }
      // A bare non-ASCII value is an emoji from before icons were tagged.
      if (/[^\x00-\x7F]/.test(icon)) {
        return <span aria-hidden="true" className="inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size, fontSize: size * 0.78, lineHeight: 1 }}>{icon}</span>;
      }
    }
  }
  return <Lettermark text={name} size={size} color={color} />;
}

export function AccountLogo({ logoId, name, size = 32 }: { logoId: string | null; name: string; size?: number }) {
  const { asset } = useDashboard();
  if (logoId?.startsWith("custom:")) {
    const url = asset(logoId);
    if (url) return <img src={url} alt="" width={size} height={size} className="shrink-0 rounded-[28%] object-cover" style={{ width: size, height: size }} />;
  } else if (logoId && ACCOUNT_LOGOS.has(logoId)) {
    return <img src={`/dashboard-assets/accounts/${logoId}.webp`} alt="" width={size} height={size} className="shrink-0 rounded-[28%] object-cover" style={{ width: size, height: size }} draggable={false} />;
  }
  return <Lettermark text={name} size={size} color="#6B7A77" />;
}

export function SubscriptionLogo({ logoId, name, size = 32, fallbackIcon }: { logoId: string | null; name: string; size?: number; fallbackIcon?: string | null }) {
  const { asset } = useDashboard();
  if (logoId?.startsWith("custom:")) {
    const url = asset(logoId);
    if (url) return <img src={url} alt="" width={size} height={size} className="shrink-0 rounded-[28%] object-cover" style={{ width: size, height: size }} />;
  } else if (logoId && SUBSCRIPTION_LOGOS.has(logoId)) {
    return <img src={`/dashboard-assets/subscriptions/${logoId}.webp`} alt="" width={size} height={size} className="shrink-0 rounded-[28%] bg-card object-contain" style={{ width: size, height: size }} draggable={false} />;
  } else if (logoId && ACCOUNT_LOGOS.has(logoId)) {
    return <img src={`/dashboard-assets/accounts/${logoId}.webp`} alt="" width={size} height={size} className="shrink-0 rounded-[28%] object-cover" style={{ width: size, height: size }} draggable={false} />;
  }
  if (fallbackIcon) return <CategoryGlyph icon={fallbackIcon} name={name} size={size} />;
  return <Lettermark text={name} size={size} />;
}

export function ItemArt({ iconId, name, size = 40 }: { iconId: string | null; name: string; size?: number }) {
  const { asset } = useDashboard();
  if (iconId?.startsWith("custom:")) {
    const url = asset(iconId);
    if (url) return <img src={url} alt="" width={size} height={size} className="shrink-0 rounded-xl object-cover" style={{ width: size, height: size }} />;
  } else if (iconId && ITEM_ICONS.has(iconId)) {
    return <img src={`/dashboard-assets/items/${iconId}.webp`} alt="" width={size} height={size} className="shrink-0 object-contain" style={{ width: size, height: size }} draggable={false} />;
  }
  return <Lettermark text={name} size={size} color="#E39A1E" />;
}

/** One ranked row: icon, name, bar of its share, value and its other unit. */
export function RankRow({
  icon,
  name,
  meta,
  value,
  other,
  share,
  color,
  onClick,
  active,
}: {
  icon: ReactNode;
  name: ReactNode;
  meta?: ReactNode;
  value: ReactNode;
  other?: ReactNode;
  share?: number;
  color?: string;
  onClick?: () => void;
  active?: boolean;
}) {
  const body = (
    <>
      {icon}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate text-[14px] font-bold text-foreground">{name}</span>
          <span className="tabular shrink-0 text-[14px] font-extrabold text-foreground">{value}</span>
        </div>
        <div className="mt-0.5 flex items-baseline justify-between gap-3 text-[12px] text-foreground-soft">
          <span className="truncate">{meta}</span>
          {other ? <span className="tabular shrink-0">{other}</span> : null}
        </div>
        {share !== undefined && color ? (
          <div className="mt-1.5">
            <Progress ratio={share} color={color} />
          </div>
        ) : null}
      </div>
    </>
  );
  const className = `flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition-colors ${active ? "bg-primary-soft" : onClick ? "hover:bg-background-subtle" : ""}`;
  return onClick ? (
    <button type="button" onClick={onClick} className={className}>
      {body}
    </button>
  ) : (
    <div className={className}>{body}</div>
  );
}

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "bad" | "warn" | "brand" }) {
  const cls =
    tone === "good"
      ? "bg-success-soft text-success"
      : tone === "bad"
        ? "bg-error-soft text-error"
        : tone === "warn"
          ? "bg-accent-soft text-[#9A6A12]"
          : tone === "brand"
            ? "bg-primary-soft text-primary-dark"
            : "bg-surface-muted text-foreground-soft";
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-bold ${cls}`}>{children}</span>;
}

/** An account type's name ("Savings"), or the type as stored when this dashboard has no name for it. */
export function useAccountTypeLabel() {
  const tc = useTranslations("dashboard.common");
  return (type: string) => (tc.has(`accountTypes.${type}`) ? tc(`accountTypes.${type}`) : type);
}
