"use client";

import { useTranslations } from "next-intl";
import { Activity, Component, useEffect, useRef, useState, type ReactNode } from "react";

import { Wordmark } from "@/components/brand";

import { FilterButton, HideAmountsButton } from "./controls";
import { EditStatusBadge } from "./editing";
import { NAV, PERIODLESS, VIEW_IDS, type ViewId } from "./nav";
import { PaywallProvider, usePaywall } from "./paywall";
import { PRESETS, isProPreset, presetEnd, stepPeriod, useDashboard, useFormat, useTransfer, type Preset } from "./state";
import { ClayImg, Segmented, TransferBar } from "./ui";
import { ViewSwitch } from "./views";

/** The dashboard once there is data: loaded on its own, after the link screen. */
export function DashboardShell({ view }: { view: ViewId }) {
  return (
    <PaywallProvider>
      <ShellLayout view={view} />
    </PaywallProvider>
  );
}

function ShellLayout({ view }: { view: ViewId }) {
  const t = useTranslations("dashboard");
  const { model } = useDashboard();
  const [menuOpen, setMenuOpen] = useState(false);
  const drawerRef = useRef<HTMLElement>(null);

  // The menu is a dialog: focus moves into it, Escape closes it, and focus
  // goes back to where it was (the menu button).
  useEffect(() => {
    if (!menuOpen) return;
    const returnTo = document.activeElement as HTMLElement | null;
    drawerRef.current?.querySelector<HTMLElement>("a, button")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      returnTo?.focus();
    };
  }, [menuOpen]);

  return (
    // `ph-no-capture` keeps every figure out of session replay even if a
    // recording was already running when the visitor arrived.
    <div className="ph-no-capture flex h-dvh overflow-hidden bg-background">
      <aside className="hidden w-[264px] shrink-0 border-r border-border bg-card lg:flex lg:flex-col">
        <Sidebar view={view} />
      </aside>

      {menuOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label={t("nav.menu")}>
          <button type="button" aria-label={t("nav.closeMenu")} className="absolute inset-0 bg-foreground/30" onClick={() => setMenuOpen(false)} />
          <aside ref={drawerRef} className="absolute inset-y-0 left-0 flex w-[290px] max-w-[85vw] flex-col bg-card shadow-[var(--shadow-float-lg)]">
            <Sidebar view={view} onNavigate={() => setMenuOpen(false)} />
          </aside>
        </div>
      ) : null}

      {/* Out of reach while the menu covers it, so Tab stays inside the menu. */}
      <div id="dashboard-main" className="min-w-0 flex-1 overflow-y-auto" inert={menuOpen}>
        <TopBar view={view} onMenu={() => setMenuOpen(true)} />
        <ConnectionBanner />
        <main className="mx-auto w-full max-w-[1400px] px-4 pb-16 pt-5 sm:px-8">
          {/* Every page stays rendered: the one showing first, the rest in the
              background at low priority, so switching pages only reveals one
              that is already drawn, its figures and images ready. */}
          {VIEW_IDS.map((id) => (
            <Activity key={id} mode={id === view ? "visible" : "hidden"}>
              <ViewBoundary resetOn={model}>
                <ViewSwitch view={id} />
              </ViewBoundary>
            </Activity>
          ))}
        </main>
      </div>
    </div>
  );
}

/**
 * On every page: the phone sending fresh data, a transfer that failed, or how
 * to bring the phone when Refresh found it away.
 */
function ConnectionBanner() {
  const t = useTranslations("dashboard.cloud");
  const { link } = useDashboard();
  const transfer = useTransfer();
  if (transfer.connection === "elsewhere") {
    return (
      <div className="mx-auto w-full max-w-[1400px] px-4 pt-4 sm:px-8">
        <div role="status" className="flex flex-col gap-3 rounded-[20px] border border-border bg-card px-4 py-3.5 text-[13.5px] leading-relaxed sm:flex-row sm:items-center">
          <p className="min-w-0 flex-1 text-foreground-soft">
            <span className="font-extrabold text-foreground">{t("elsewhereTitle")}</span> {t("elsewhereBody")}
          </p>
          <button type="button" onClick={link.takeOver} className="inline-flex h-10 shrink-0 items-center justify-center rounded-full bg-primary px-5 text-[13.5px] font-extrabold text-card hover:bg-primary-dark">
            {t("useHere")}
          </button>
        </div>
      </div>
    );
  }
  if (transfer.loading) {
    const title = t(`${transfer.loading}Title`);
    return (
      <div className="mx-auto w-full max-w-[1400px] px-4 pt-4 sm:px-8">
        <div role="status" className="flex items-center gap-3 rounded-[20px] border border-sky/60 bg-[#EAF4FF] px-4 py-3.5">
          <ClayImg name="ui/download" size={30} />
          <div className="min-w-0 flex-1 text-[13.5px] text-foreground">
            <p className="font-extrabold">{title}</p>
            <TransferBar label={title} progress={transfer.loading === "receiving" ? transfer.progress : null} className="mt-2 h-2 w-full bg-card" />
          </div>
        </div>
      </div>
    );
  }
  if (link.error) {
    return (
      <div className="mx-auto w-full max-w-[1400px] px-4 pt-4 sm:px-8">
        <div role="alert" className="rounded-2xl bg-error-soft px-4 py-3 text-[14px] font-semibold text-error">
          {t(`errors.${link.error}`)}
        </div>
      </div>
    );
  }
  if (link.needsPhone && transfer.connection !== "phone") {
    return (
      <div className="mx-auto w-full max-w-[1400px] px-4 pt-4 sm:px-8">
        <div role="status" className="flex items-start gap-3 rounded-[20px] border border-border bg-card px-4 py-3.5 text-[13.5px] leading-relaxed">
          <ClayImg name="status/info" size={26} className="mt-px" />
          <p className="text-foreground-soft">
            <span className="font-extrabold text-foreground">{t("needsPhoneTitle")}</span> {t("needsPhoneBody")}
          </p>
        </div>
      </div>
    );
  }
  return null;
}

function Sidebar({ view, onNavigate }: { view: ViewId; onNavigate?: () => void }) {
  const t = useTranslations("dashboard");
  const { navigate, link } = useDashboard();
  const f = useFormat();
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <div className="flex h-[68px] shrink-0 items-center gap-2 px-5">
        {/* The marketing site lives on another host; a full navigation. */}
        <a href="https://www.money2time.com" aria-label="Money2Time" className="shrink-0">
          <Wordmark className="text-[19px]" />
        </a>
      </div>
      <nav aria-label={t("nav.label")} className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {NAV.map((group) => (
          <div key={group.group} className="mt-3 first:mt-0">
            {group.group === "home" ? null : (
              <p className="px-3 pb-1.5 pt-2 text-[11px] font-bold uppercase tracking-[0.12em] text-foreground-muted">{t(`nav.groups.${group.group}`)}</p>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = item.id === view;
                return (
                  <li key={item.id}>
                    <a
                      href={`#/${item.id}`}
                      aria-current={active ? "page" : undefined}
                      onClick={(event) => {
                        event.preventDefault();
                        navigate(item.id);
                        onNavigate?.();
                      }}
                      className={`flex items-center gap-3 rounded-2xl px-3 py-2 text-[14.5px] font-bold transition-colors ${
                        active ? "bg-primary-soft text-primary-dark" : "text-foreground-soft hover:bg-background-subtle hover:text-foreground"
                      }`}
                    >
                      <ClayImg name={item.icon} size={26} />
                      <span className="min-w-0 flex-1 truncate">{t(`views.${item.id}.nav`)}</span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-border p-3">
        <div className="rounded-[20px] border border-border bg-background-subtle p-3">
          <div className="flex items-center gap-3 px-1">
            <ClayImg name="status/cloud-upload" size={34} className="shrink-0" />
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-[13px] font-extrabold text-foreground">{t("cloud.dataFrom", { date: f.instant(link.dataAt) })}</p>
              <p className="mt-0.5 truncate text-[12px] text-foreground-soft">{link.sourceDevice || link.phoneName || t("cloud.yourPhone")}</p>
              <PhoneStatus />
            </div>
          </div>
          <RefreshButton compact className="mt-3 w-full" />
          {confirming ? (
            <div className="mt-2 rounded-2xl bg-card p-3 text-[12.5px]">
              <p className="font-semibold text-foreground">{t("cloud.unlinkConfirm")}</p>
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={link.unlink} className="rounded-full bg-foreground px-3 py-1 font-bold text-card">
                  {t("cloud.unlink")}
                </button>
                <button type="button" onClick={() => setConfirming(false)} className="rounded-full px-3 py-1 font-bold text-foreground-soft hover:bg-background-subtle">
                  {t("cloud.stay")}
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirming(true)} className="mt-1.5 w-full rounded-full py-1 text-center text-[12px] font-semibold text-foreground-muted hover:text-foreground">
              {t("cloud.unlink")}
            </button>
          )}
        </div>
        <p className="mt-2.5 flex items-center gap-1.5 px-2 text-[11.5px] leading-snug text-foreground-muted">
          <ClayImg name="status/shield-check" size={16} className="shrink-0" />
          {t("cloud.sourceOfTruth")}
        </p>
      </div>
    </>
  );
}

/** Whether the phone is here: its own component, so a transfer redraws only this line of the sidebar. */
function PhoneStatus() {
  const t = useTranslations("dashboard.cloud");
  const { connection } = useTransfer();
  const here = connection === "phone" || connection === "receiving";
  return (
    <p className="mt-1 flex items-center gap-1.5 text-[11.5px] font-semibold text-foreground-muted">
      <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${here ? "bg-success" : "bg-foreground-muted/40"}`} />
      <span className="truncate">{t(here ? "phoneHere" : connection === "connecting" ? "connecting" : "phoneAway")}</span>
    </p>
  );
}

/** Asks the phone for its latest data now, or says how to bring it. */
function RefreshButton({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  const t = useTranslations("dashboard.cloud");
  const { link } = useDashboard();
  const { loading, progress } = useTransfer();
  return (
    <button
      type="button"
      disabled={loading !== null}
      onClick={link.refresh}
      className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full bg-primary font-extrabold text-card shadow-[var(--shadow-soft-lg)] transition hover:bg-primary-dark disabled:opacity-60 ${
        compact ? "h-10 px-4 text-[13.5px]" : "h-11 px-5 text-[14.5px]"
      } ${className}`}
    >
      <ClayImg name="ui/refresh" size={compact ? 18 : 22} className={`shrink-0 ${loading ? "animate-spin" : ""}`} />
      {loading === "receiving" ? t("receiving", { percent: Math.round((progress ?? 0) * 100) }) : loading ? t(loading) : t("refresh")}
    </button>
  );
}

function TopBar({ view, onMenu }: { view: ViewId; onMenu: () => void }) {
  const t = useTranslations("dashboard");
  const { mode, setMode, period, setPeriod, resolved, model, link } = useDashboard();
  const f = useFormat();
  const periodless = PERIODLESS.includes(view);
  const paywall = usePaywall();
  // The bar's height, for what sticks under it (the transaction list's selection toolbar).
  const bar = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = bar.current;
    if (!el) return;
    const root = document.documentElement;
    const observer = new ResizeObserver(() => root.style.setProperty("--dashboard-topbar", `${el.offsetHeight}px`));
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--dashboard-topbar");
    };
  }, []);

  const rangeLabel =
    resolved.months.length === 1
      ? f.monthLong(resolved.start)
      : `${f.monthYearShort(resolved.start)} – ${f.monthYearShort(resolved.end)}`;

  return (
    <header ref={bar} className="relative z-30 border-b border-border/70 bg-background/90 backdrop-blur-xl lg:sticky lg:top-0">
      <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:px-8">
        <button
          type="button"
          onClick={onMenu}
          aria-label={t("nav.openMenu")}
          className="card-surface inline-flex h-10 w-10 items-center justify-center rounded-full lg:hidden"
        >
          <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[26px] font-extrabold tracking-[-0.03em] text-foreground sm:text-[30px]">{t(`views.${view}.title`)}</h1>
          <p className="truncate text-[13px] text-foreground-soft">{t(`views.${view}.subtitle`)}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <EditStatusBadge />
          <div className="lg:hidden">
            <RefreshButton compact />
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center gap-x-3 gap-y-2 px-4 pb-3 sm:px-8">
        {periodless ? (
          <p className="text-[13px] font-semibold text-foreground-soft">{t("period.asOf", { date: f.instant(link.dataAt) })}</p>
        ) : (
          <>
            <div className="max-w-full overflow-x-auto">
              <Segmented<Preset>
                label={t("period.label")}
                value={period.preset}
                onChange={(preset) => setPeriod({ preset, end: presetEnd(preset, model) })}
                options={PRESETS.map((preset) => ({
                  value: preset,
                  label: t(`period.presets.${preset}`),
                  locked: !link.pro && isProPreset(preset),
                  lockedLabel: t("pro.lockedPeriod", { period: t(`period.presets.${preset}`) }),
                }))}
                onLocked={() => paywall("period")}
              />
            </div>
            <div className="flex items-center gap-1">
              <StepButton label={t("period.previous")} disabled={!resolved.canBack} onClick={() => setPeriod(stepPeriod(period, -1))} direction="left" />
              <span className="tabular min-w-[120px] text-center text-[14px] font-bold text-foreground">{rangeLabel}</span>
              <StepButton label={t("period.next")} disabled={!resolved.canForward} onClick={() => setPeriod(stepPeriod(period, 1))} direction="right" />
            </div>
          </>
        )}
        <div className="ml-auto flex items-center gap-2">
          <FilterButton />
          <HideAmountsButton />
          <Segmented
            label={t("mode.label")}
            value={mode}
            onChange={setMode}
            options={[
              { value: "money", label: model.symbol },
              { value: "hours", label: t("mode.hours") },
            ]}
          />
        </div>
      </div>
    </header>
  );
}

function StepButton({ label, disabled, onClick, direction }: { label: string; disabled: boolean; onClick: () => void; direction: "left" | "right" }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-[var(--shadow-soft)] transition hover:bg-background-subtle disabled:opacity-35"
    >
      <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {direction === "left" ? <path d="m15 6-6 6 6 6" /> : <path d="m9 6 6 6-6 6" />}
      </svg>
    </button>
  );
}

/**
 * One page failing to draw (a backup shape no one foresaw) must not blank the
 * whole dashboard: the page shows a short note and the rest keeps working.
 */
class ViewBoundary extends Component<{ children: ReactNode; resetOn: unknown }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  // New data or new filters get a fresh try.
  componentDidUpdate(previous: { resetOn: unknown }) {
    if (this.state.failed && previous.resetOn !== this.props.resetOn) this.setState({ failed: false });
  }

  render() {
    return this.state.failed ? <ViewFailed /> : this.props.children;
  }
}

function ViewFailed() {
  const t = useTranslations("dashboard.common");
  return (
    <div role="alert" className="rounded-[20px] border border-border bg-card px-5 py-6 text-[14px] text-foreground-soft">
      {t("viewFailed")}
    </div>
  );
}
