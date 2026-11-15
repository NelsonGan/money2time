"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

import { evenGroupRows, type GroupRowWrite } from "@/lib/album/writes";
import type { Bill, Group } from "@/lib/album/group";
import { EVENTS, track, type AlbumEditAction } from "@/lib/analytics";
import { media } from "@/lib/media";

import { useSite, type Tab } from "./site";
import { AlbumApiError, api } from "./api";
import { BalancesTab, type SettleTarget } from "./balances-tab";
import { BillEditor } from "./bill-editor";
import { BreakdownTab } from "./breakdown-tab";
import { AppBanner, GetTheApp } from "./get-app";
import { defaultMemberName, Page } from "./join-screen";
import { PeopleSheet } from "./people-sheet";
import { SettleSheet } from "./settle-sheet";
import { SignIn } from "./sign-in";
import { TransactionsTab } from "./transactions-tab";
import { AvatarStack, Button, Icon, Mascot, Sheet, Spinner, personColor, today, useDay } from "./ui";

/** How often an open album asks for what others changed, while the page is in view. */
const POLL_MS = 20_000;
/**
 * A background read asks only whether anything changed (the Worker's change
 * stamp), and reads everything at least this often anyway, in case a phone's
 * notice of its changes never reached the Worker.
 */
const FULL_READ_MS = 5 * 60_000;

export type AlbumActions = {
  /** Sends rows to the Worker; true when written. Says why on the page when not. */
  write: (rows: GroupRowWrite[], action: AlbumAction) => Promise<boolean>;
  /** Reads the album again, after a change made outside its rows (someone taken out). */
  reload: () => Promise<unknown>;
};

/** What a change did, for analytics: `bill_add`, `payment_record`, … */
export type AlbumAction = AlbumEditAction;

/**
 * The album, read now and kept current: every 20 seconds while the page is in
 * view and whenever it comes back. A background read joins one already on
 * its way and, between full reads, only asks whether anything changed;
 * `fresh` (after a change) always reads everything itself, so it never hands
 * back what was read before the change. Only the newest read's answer is kept.
 */
function useAlbum(shareId: string) {
  const [group, setGroup] = useState<Group | null>(null);
  const [error, setError] = useState<AlbumApiError | null>(null);
  const loading = useRef<Promise<Group | null> | null>(null);
  const latest = useRef(0);
  const current = useRef<{ group: Group; stamp: string | null; at: number } | null>(null);

  const load = useCallback(
    (options: { fresh?: boolean } = {}): Promise<Group | null> => {
      if (loading.current && !options.fresh) return loading.current;
      const seq = ++latest.current;
      const last = current.current;
      const since = !options.fresh && last?.stamp && Date.now() - last.at < FULL_READ_MS ? last.stamp : undefined;
      const request = api.group(shareId, since).then(
        (answer) => {
          // null: nothing changed since the last read, which stays.
          if (!answer) {
            if (seq === latest.current) setError(null);
            return current.current?.group ?? null;
          }
          if (seq === latest.current) {
            current.current = { ...answer, at: Date.now() };
            setGroup(answer.group);
            setError(null);
          }
          return answer.group;
        },
        (err: unknown) => {
          if (seq === latest.current) setError(err instanceof AlbumApiError ? err : new AlbumApiError("server_error", 500));
          return null;
        },
      );
      loading.current = request;
      void request.finally(() => {
        if (loading.current === request) loading.current = null;
      });
      return request;
    },
    [shareId],
  );

  useEffect(() => {
    const first = window.setTimeout(() => void load(), 0);
    const poll = window.setInterval(() => document.visibilityState === "visible" && void load(), POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [load]);

  return { group, error, load };
}

/** Why a change did not go, as the app says it (`groupWriteMessage`). */
export function writeErrorKey(error: unknown): string {
  const code = error instanceof AlbumApiError ? error.code : "";
  if (code === "network") return "errors.network";
  if (code === "not_member" || code === "not_found") return "errors.notMember";
  if (code === "unauthorized") return "errors.signedOut";
  if (code === "name_taken") return "people.nameTaken";
  if (code === "busy") return "errors.busy";
  return "errors.saveFailed";
}

type Sheet =
  | { kind: "bill"; bill: Bill | null }
  | { kind: "settle"; target: SettleTarget }
  | { kind: "people" }
  | { kind: "app" }
  | null;

type Toast = { text: string; undo?: () => void } | null;

/** An album: its sign-in for a signed-out visitor, else the album itself, which only then starts reading. */
export function AlbumScreen({ shareId, tab }: { shareId: string; tab: Tab }) {
  const t = useTranslations("album");
  const { user, setUser } = useSite();
  if (!user) {
    return (
      <Page>
        <section className="flex flex-col items-center pt-4 text-center">
          <Mascot pose="waving" size={120} />
          <h1 className="mt-3 text-[24px] font-extrabold tracking-[-0.03em]">{t("album.signInTitle")}</h1>
          <p className="mb-6 mt-1.5 max-w-[320px] text-[14.5px] text-foreground-soft">{t("album.signInBody")}</p>
        </section>
        <SignIn context="album" onSignedIn={setUser} />
      </Page>
    );
  }
  return <AlbumView shareId={shareId} tab={tab} />;
}

function AlbumView({ shareId, tab }: { shareId: string; tab: Tab }) {
  const t = useTranslations("album");
  const { user, setUser, go } = useSite();
  const { group, error, load } = useAlbum(shareId);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [toast, setToast] = useState<Toast>(null);
  const rejoined = useRef(false);

  // Joined, but the group has not put the user on its list (the join's
  // second step did not go): put them on it now, once.
  useEffect(() => {
    if (!group || !user || group.selfId || rejoined.current) return;
    rejoined.current = true;
    void api.rejoin(shareId, defaultMemberName(user) || t("people.unnamed")).then(() => load({ fresh: true }), () => undefined);
  }, [group, load, shareId, t, user]);

  // A session the Worker no longer knows (the server has cleared its cookie): sign in again.
  useEffect(() => {
    if (error?.code === "unauthorized") setUser(null);
  }, [error, setUser]);

  useEffect(() => {
    track(EVENTS.albumViewed, { tab });
  }, [tab]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), toast.undo ? 6000 : 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const write = useCallback(
    async (rows: GroupRowWrite[], action: AlbumAction): Promise<boolean> => {
      try {
        await api.write(shareId, rows);
        track(EVENTS.albumEdited, { action, result: "saved" });
      } catch (err) {
        track(EVENTS.albumEdited, { action, result: err instanceof AlbumApiError ? (err.code === "network" ? "offline" : err.code === "not_member" ? "not_member" : "failed") : "failed" });
        if (err instanceof AlbumApiError && err.code === "unauthorized") setUser(null);
        setToast({ text: t(writeErrorKey(err)) });
        return false;
      }
      const fresh = await load({ fresh: true });
      // With Simplify on, a group that came out even has its circle closed (the app's `evenGroupPayments`).
      const even = fresh ? evenGroupRows(fresh, today()) : [];
      if (even.length) {
        await api.write(shareId, even, "close_even").then(() => load({ fresh: true }), () => undefined);
      }
      return true;
    },
    [load, setUser, shareId, t],
  );

  if (!group) {
    if (error && error.code !== "network" && error.code !== "busy") {
      return (
        <Page>
          <section className="mt-6 flex flex-col items-center rounded-[28px] border border-border bg-card px-6 pb-7 pt-6 text-center shadow-[var(--shadow-soft)]">
            <Mascot pose="thinking" size={120} />
            <h1 className="mt-2 text-[22px] font-extrabold">{t("album.goneTitle")}</h1>
            <p className="mt-1.5 max-w-[320px] text-[14.5px] text-foreground-soft">{t("album.goneBody")}</p>
            <Button className="mt-5" onClick={() => go({ name: "home" })}>
              {t("home.title")}
            </Button>
          </section>
        </Page>
      );
    }
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 py-24 text-primary">
        <Spinner size={28} />
        {error ? (
          <Button tone="plain" size="sm" onClick={() => void load()}>
            {t("retry")}
          </Button>
        ) : null}
      </div>
    );
  }

  const actions: AlbumActions = { write, reload: () => load({ fresh: true }) };
  const setTab = (next: Tab) => go({ name: "album", shareId, tab: next }, { replace: true });

  return (
    <div className="flex flex-1 flex-col pb-28">
      <Cover group={group} shareId={shareId} onBack={() => go({ name: "home" })} onPeople={() => setSheet({ kind: "people" })} />
      {/* As in the app, the tabs rest on the cover's bottom edge on rounded corners. */}
      <div className="relative z-10 -mt-6 rounded-t-[28px] bg-background min-[900px]:mt-2 min-[900px]:rounded-none">
        <Tabs tab={tab} onChange={setTab} />
        <div className="mx-auto w-full max-w-[680px] px-4 pt-4">
          <AppBanner onOpen={() => setSheet({ kind: "app" })} />
          {tab === "transactions" ? (
            <div className="mt-5">
              <TransactionsTab group={group} onOpen={(bill) => setSheet({ kind: "bill", bill })} onAdd={() => setSheet({ kind: "bill", bill: null })} />
            </div>
          ) : tab === "breakdown" ? (
            <div className="mt-4">
              <BreakdownTab group={group} />
            </div>
          ) : (
            <div className="mt-2">
              <BalancesTab group={group} onSettle={(target) => setSheet({ kind: "settle", target })} />
            </div>
          )}
        </div>
      </div>

      {group.selfId ? (
        <button
          type="button"
          onClick={() => setSheet({ kind: "bill", bill: null })}
          aria-label={t("bill.add")}
          title={t("bill.add")}
          className="fixed bottom-[max(18px,env(safe-area-inset-bottom))] right-[max(14px,calc((100vw-680px)/2+14px))] min-[900px]:right-[calc((100vw-680px)/2-92px)] z-30 h-[68px] w-[68px] rounded-full drop-shadow-[0_10px_18px_rgba(201,74,46,0.35)] transition-transform hover:scale-105 active:scale-95"
        >
          {/* The app's own add button. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- clay art from the media bucket, drawn at its size */}
          <img src={media("/clay-icons/nav/add-active.png")} alt="" width={68} height={68} className="h-full w-full" draggable={false} />
        </button>
      ) : null}

      {toast ? (
        <div role="status" className="fixed inset-x-4 bottom-[max(92px,calc(env(safe-area-inset-bottom)+72px))] z-40 mx-auto flex max-w-[420px] items-center gap-3 rounded-[18px] bg-foreground px-4 py-3 text-[14px] font-semibold text-card shadow-lg">
          <span className="min-w-0 flex-1">{toast.text}</span>
          {toast.undo ? (
            <button
              type="button"
              onClick={() => {
                toast.undo?.();
                setToast(null);
              }}
              className="shrink-0 font-bold text-primary-muted"
            >
              {t("undo")}
            </button>
          ) : null}
        </div>
      ) : null}

      {sheet?.kind === "bill" ? <BillEditor group={group} bill={sheet.bill} actions={actions} onClose={() => setSheet(null)} onSaved={(text) => setToast({ text })} /> : null}
      {sheet?.kind === "settle" ? (
        <SettleSheet
          group={group}
          target={sheet.target}
          actions={actions}
          onClose={() => setSheet(null)}
          onRecorded={(text, undo) => setToast({ text, undo: undo ? () => void write(undo, "payment_undo") : undefined })}
        />
      ) : null}
      {sheet?.kind === "people" ? <PeopleSheet group={group} actions={actions} onClose={() => setSheet(null)} onLeft={() => go({ name: "home" }, { replace: true })} /> : null}
      {sheet?.kind === "app" ? (
        <Sheet title={t("app.title")} onClose={() => setSheet(null)}>
          <GetTheApp placement="album_sheet" />
        </Sheet>
      ) : null}
    </div>
  );
}

/** The cover, as the app's album page opens: the photo (or the name's letter), Back, the people, the name and the trip's days. */
function Cover({ group, shareId, onBack, onPeople }: { group: Group; shareId: string; onBack: () => void; onPeople: () => void }) {
  const t = useTranslations("album");
  const day = useDay();
  const name = group.album.name || t("untitled");
  const [broken, setBroken] = useState(false);
  const days = group.bills.filter((bill) => !bill.deleted).map((bill) => bill.date).sort();
  const range = days.length ? (days[0] === days.at(-1) ? day(days[0]) : `${day(days[0])} – ${day(days.at(-1)!)}`) : null;
  const people = group.members
    .filter((member) => member.userId)
    .sort((a, b) => Number(b.id === group.selfId) - Number(a.id === group.selfId))
    .map((member) => ({ id: member.id, name: member.name, color: personColor(group.members, member.id, group.selfId) }));
  const cover = group.cover && !broken ? api.coverUrl(shareId, group.cover) : null;
  return (
    <header className="relative h-[240px] overflow-hidden bg-[linear-gradient(165deg,#F8E7EA_0%,#EDD2D7_50%,#DDB9C0_100%)] sm:h-[270px] min-[900px]:mx-auto min-[900px]:mt-6 min-[900px]:w-[680px] min-[900px]:rounded-[28px]">
      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element -- a private picture from the album's API, never optimised
        <img src={cover} alt="" onError={() => setBroken(true)} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <span aria-hidden="true" className="absolute inset-x-0 top-[22%] text-center text-[76px] font-extrabold leading-none tracking-[-0.04em] text-[#5E7D6E]/80">
          {Array.from(name)[0]?.toUpperCase()}
        </span>
      )}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.18)_0%,rgba(0,0,0,0)_35%,rgba(0,0,0,0)_50%,rgba(26,46,42,0.62)_100%)]" />
      <div className="relative mx-auto flex h-full max-w-[680px] flex-col justify-between px-4 pb-10 pt-[max(14px,env(safe-area-inset-top))] min-[900px]:px-6 min-[900px]:pb-6">
        <div className="flex items-center justify-between">
          <button type="button" onClick={onBack} aria-label={t("home.title")} className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-md hover:bg-black/40">
            <Icon name="back" />
          </button>
        </div>
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-[28px] font-extrabold leading-tight tracking-[-0.03em] text-white drop-shadow-sm">{name}</h1>
            {range ? <p className="mt-0.5 text-[14px] font-semibold text-white/85">{range}</p> : null}
          </div>
          <button type="button" onClick={onPeople} aria-label={t("people.title")} className="flex shrink-0 items-center gap-1.5 rounded-full bg-black/30 p-1.5 pr-3 text-white backdrop-blur-md hover:bg-black/40">
            <AvatarStack people={people} size={30} />
            <Icon name="people" size={18} />
          </button>
        </div>
      </div>
    </header>
  );
}

function Tabs({ tab, onChange }: { tab: Tab; onChange: (tab: Tab) => void }) {
  const t = useTranslations("album");
  const tabs: Tab[] = ["transactions", "breakdown", "balances"];
  return (
    <nav className="sticky top-0 z-20 rounded-t-[28px] border-b border-border bg-background/95 backdrop-blur-md min-[900px]:mx-auto min-[900px]:w-[680px] min-[900px]:rounded-none">
      <div role="tablist" aria-label={t("album.sections")} className="mx-auto flex max-w-[680px] gap-6 px-5 pt-1">
        {tabs.map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => onChange(value)}
            className={`relative py-3.5 text-[16px] font-bold tracking-[-0.01em] transition-colors ${tab === value ? "text-primary" : "text-foreground-soft hover:text-foreground"}`}
          >
            {t(`tabs.${value}`)}
            {tab === value ? <span className="absolute inset-x-0 bottom-0 h-[3px] rounded-full bg-primary" /> : null}
          </button>
        ))}
      </div>
    </nav>
  );
}
