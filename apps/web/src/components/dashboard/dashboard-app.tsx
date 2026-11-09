"use client";

import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { EVENTS, identifyDashboardUser, resetDashboardUser, track, type DashboardEditAction } from "@/lib/analytics";
import { createAssetResolver } from "@/lib/backup/assets";
import { buildModel, type Model } from "@/lib/backup/model";
import { BackupParseError, parseBackup, readBackup } from "@/lib/backup/parse";
import type { BackupFile, UserAsset } from "@/lib/backup/types";
import {
  clearAll,
  readCache,
  removeCache,
  readLink,
  readPendingUnlinks,
  removePendingUnlink,
  writeCache,
  writeLink,
  type CachedBackup,
  type StoredLink,
} from "@/lib/cloud/cache";
import { browserSupported, gunzipText, sealForCache } from "@/lib/cloud/crypto";
import { editCount, type EditOp, type EditResult } from "@/lib/cloud/edits";
import { applyPatch } from "@/lib/cloud/patch";
import { BrowserSession, CHUNK_BYTES, phoneTakesBudgetCurrencies, phoneTakesCreditDueDaysAfter, reopen, type BrowserState, type LinkedPhone, type Received } from "@/lib/cloud/relay";

import { LinkScreen } from "./link-screen";
import { isViewId, type ViewId } from "./nav";
import { applyFilters, NO_FILTERS, readFilters, type Filters } from "./filters";
import {
  DashboardProvider,
  isProPreset,
  presetEnd,
  resolvePeriod,
  type EditAvailability,
  type LinkState,
  type Loading,
  type Mode,
  type Period,
  type Preset,
  type TransferState,
} from "./state";
import { media } from "@/lib/media";

/** The pages and their editors, fetched only once there is data to show: the QR screen needs none of it. */
const SHELL_RETRY = "m2t-dashboard-shell-retry";
/**
 * A chunk that fails to load (offline, or a deploy since this page opened,
 * which retires the old chunk's URL) reloads the page once for the current
 * build, instead of leaving the generic application error.
 */
const loadShell = () =>
  import("./shell").then(
    (module) => {
      try {
        sessionStorage.removeItem(SHELL_RETRY);
      } catch {
        // Storage can be unavailable; the retry guard just does not apply.
      }
      return module;
    },
    (error: unknown) => {
      try {
        if (!sessionStorage.getItem(SHELL_RETRY)) {
          sessionStorage.setItem(SHELL_RETRY, "1");
          window.location.reload();
          return new Promise<never>(() => undefined);
        }
      } catch {
        // No storage, so no way to stop a reload loop: fall through.
      }
      throw error;
    },
  );
const DashboardShell = dynamic(() => loadShell().then((module) => module.DashboardShell), { ssr: false, loading: () => <Checking /> });

/**
 * An open transfer: its encrypted copy, the backup it opens to (what the next
 * patch applies to), the model the views draw, and the photos they show.
 * `seal` is set while `cached` is a patched copy not yet sealed here: its
 * chunks are still the patch's, so it must be sealed before it is kept.
 */
type Ready = {
  cached: CachedBackup;
  backup: BackupFile;
  userAssets: UserAsset[];
  model: Model;
  seal: (() => Promise<CachedBackup>) | null;
};

type Phase =
  | { kind: "checking" }
  | { kind: "unlinked"; notice: "unlinked" | "unsupported" | null }
  | { kind: "linked"; link: StoredLink; ready: Ready | null };

const PREFS_KEY = "money2time-dashboard-prefs";
/** Tells this browser's other tabs that the link changed. */
const CHANNEL = "money2time-dashboard";
/** Progress updates re-render the dashboard; a few per second is plenty. */
const PROGRESS_STEP = 0.02;
/** After a saved change, how long to wait for the changed data before allowing another. */
const SYNC_WAIT_MS = 30_000;

/**
 * Bumped whenever the link changes (linked, unlinked here, unlinked by the
 * phone, or by another tab), so an operation that finishes afterwards (a
 * transfer still decrypting, a cache read) sees it is stale and does nothing.
 * One dashboard per page, so a module counter is enough.
 */
let generation = 0;

/**
 * This browser's view settings: the unit, the period, whether amounts are
 * hidden, and the filters (account and category ids only, never names).
 */
type Prefs = { mode?: Mode; preset?: Preset; hidden?: boolean; filters?: Filters };

function readPrefs(): Prefs {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    return raw ? (JSON.parse(raw) as Prefs) : {};
  } catch {
    return {};
  }
}

function writePrefs(patch: Prefs) {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify({ ...readPrefs(), ...patch }));
  } catch {
    // A remembered toggle is a convenience; losing it is fine.
  }
}

function viewFromHash(): ViewId {
  const id = window.location.hash.replace(/^#\/?/, "");
  return isViewId(id) ? id : "overview";
}

/** A transfer that arrived whole but would not open: undecryptable, not gzip, or not a backup. */
function loadErrorOf(error: unknown): "unsupported" | "corrupt" {
  if (error instanceof BackupParseError && error.code === "unsupported-version") return "unsupported";
  return "corrupt";
}

/** Inflates and parses what the phone sent, in memory, and builds the dashboard's model of it. */
async function openTransfer(cached: CachedBackup, gzipped?: Uint8Array<ArrayBuffer>): Promise<Ready> {
  const backup = parseBackup(await gunzipText(gzipped ?? (await reopen(cached))));
  const model = buildModel(backup, { timeZone: cached.meta.timeZone });
  return { cached, backup, userAssets: backup.userAssets ?? [], model, seal: null };
}

function sameAssets(a: UserAsset[], b: UserAsset[]): boolean {
  return a.length === b.length && a.every((asset, i) => asset.path === b[i].path && asset.base64 === b[i].base64);
}

/**
 * Applies a patch from the phone to the data on screen. The result can be
 * shown at once; `seal` then makes the copy to keep, gzipped and sealed here
 * in the phone's chunk format, so it reopens like one the phone sent.
 */
async function openPatch(current: Ready, incoming: Received): Promise<Ready> {
  const backup = readBackup(applyPatch(current.backup, await gunzipText(incoming.gzipped)));
  const model = buildModel(backup, { timeZone: incoming.meta.timeZone });
  // Whole data from here on, no longer a patch.
  const meta = { ...incoming.meta };
  delete meta.base;
  const receivedAt = new Date().toISOString();
  const userAssets = backup.userAssets ?? [];
  const seal = async (): Promise<CachedBackup> => {
    const sealed = await sealForCache(JSON.stringify(backup), meta.id, CHUNK_BYTES);
    return {
      meta: { ...meta, size: sealed.size, count: sealed.count },
      dataKey: sealed.dataKey,
      ivPrefix: sealed.ivPrefix,
      frames: sealed.frames,
      receivedAt,
    };
  };
  return {
    // Until sealed, only this copy's meta is read; its chunks are still the patch's.
    cached: { meta, dataKey: incoming.dataKey, ivPrefix: incoming.ivPrefix, frames: incoming.frames, receivedAt },
    backup,
    // Unchanged photos keep their object URLs.
    userAssets: sameAssets(userAssets, current.userAssets) ? current.userAssets : userAssets,
    model,
    seal,
  };
}

/**
 * Tells this browser's other tabs. Each message names the tab it came from:
 * a new channel object would otherwise deliver it to this tab's own listener.
 */
const TAB_ID = Math.random().toString(36).slice(2);

function broadcast(message: { type: "linked" | "unlinked" }) {
  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage({ ...message, from: TAB_ID });
    channel.close();
  } catch {
    // No BroadcastChannel: other tabs catch up on their next load.
  }
}

/** Also what the server renders: whether this browser is linked is only known once it has looked in its own storage. */
function Checking() {
  const t = useTranslations("dashboard");
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center" aria-busy="true">
      {/* eslint-disable-next-line @next/next/no-img-element -- static mascot art */}
      <img src={media("/mascots/laptop.png")} alt="" width={120} height={120} className="h-[120px] w-[120px] animate-pulse object-contain" />
      <h1 className="headline text-[clamp(26px,3vw,34px)]">{t("loadingTitle")}</h1>
      <p className="max-w-[440px] text-[15px] text-foreground-soft">{t("loading")}</p>
    </div>
  );
}

export function DashboardApp() {
  const [phase, setPhase] = useState<Phase>({ kind: "checking" });
  const [connection, setConnection] = useState<BrowserState>("connecting");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsPhone, setNeedsPhone] = useState(false);
  /** Transfers that arrived and are being decrypted and read. */
  const [opening, setOpening] = useState(0);
  /** A change on its way to the phone, or saved and waiting for the changed data. */
  const [editPhase, setEditPhase] = useState<"idle" | "saving" | "syncing">("idle");
  /** After a saved change: the phone's data version that has it. Data older than that is not it. */
  const awaitedVersion = useRef<number | null>(null);
  /**
   * Whether this browser has had data from the phone since the phone arrived:
   * a token from an earlier visit is no longer good, so changes wait for it.
   */
  const [heardThisVisit, setHeardThisVisit] = useState(false);
  /** Bumped to re-run the pending-unlink deliveries after a new one is added. */
  const [unlinksVersion, setUnlinksVersion] = useState(0);
  // Only the ready dashboard reads these, and the server never renders it, so
  // reading the hash and stored preferences on first render cannot mismatch.
  const [view, setView] = useState<ViewId>(() => (typeof window === "undefined" ? "overview" : viewFromHash()));
  const [mode, setModeState] = useState<Mode>(() => readPrefs().mode ?? "money");
  const [hidden, setHiddenState] = useState(() => readPrefs().hidden === true);
  const [filters, setFiltersState] = useState<Filters>(() => readFilters(readPrefs().filters));
  const [chosenPeriod, setPeriodState] = useState<Period | null>(null);
  /** The data on screen, for the next patch: set with every `ready` shown. */
  const readyRef = useRef<Ready | null>(null);
  /**
   * The transfer the data will be at once the transfers already here are
   * open: what this browser tells the phone it holds, so a patch made now
   * fits the data it will meet.
   */
  const acceptedId = useRef<string | null>(null);
  /** Transfers open one after another, so a patch meets the data the one before it left. */
  const receiving = useRef<Promise<void>>(Promise.resolve());
  // This tab's seat in the link's relay room; replacing it closes the old one.
  const [session, setSession] = useState<BrowserSession | null>(null);
  useEffect(() => () => session?.close(), [session]);
  /** Re-reads this browser's link from storage (on open, and when another tab changes it). */
  const [bootCount, setBootCount] = useState(0);
  const linkedElsewhere = useRef(false);

  useEffect(() => {
    const onHash = () => setView(viewFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  /**
   * Back to the QR code: neither the key nor the data stays behind. `pending`
   * keeps the link only to tell the phone, which may be away right now.
   */
  const forget = useCallback(async (notice: "unlinked" | null, pending?: StoredLink, fromOtherTab = false) => {
    generation++;
    setSession(null);
    // Whoever links this browser next is someone else as far as analytics knows.
    resetDashboardUser();
    if (!fromOtherTab) {
      await clearAll(pending ? { roomId: pending.roomId, key: pending.key, unlinkedAt: new Date().toISOString() } : undefined);
      broadcast({ type: "unlinked" });
    }
    setPeriodState(null);
    // The filters name this phone's accounts and categories: they go too.
    setFiltersState(NO_FILTERS);
    writePrefs({ filters: NO_FILTERS });
    setError(null);
    setProgress(null);
    setOpening(0);
    readyRef.current = null;
    acceptedId.current = null;
    setPhase({ kind: "unlinked", notice });
    if (pending) setUnlinksVersion((value) => value + 1);
  }, []);

  /**
   * The phone sent fresh data, or a patch to the data on screen: check it
   * opens, show it, keep it encrypted. A patch that does not fit the data
   * here asks the phone for everything instead. `started` is the generation
   * it arrived in: transfers wait their turn, and one that arrived before an
   * unlink must not come back after it.
   */
  const received = useCallback(async (link: StoredLink, incoming: Received, from: BrowserSession, started: number) => {
    if (started !== generation) return;
    const current = readyRef.current;
    const unusable = () => {
      if (acceptedId.current === incoming.meta.id) acceptedId.current = readyRef.current?.cached.meta.id ?? null;
      from.requestRepair();
      track(EVENTS.dashboardDataReceived, { result: "patch_unusable" });
    };
    // One build sent twice (two requests naming the same copy): the data is
    // here already, only the meta that came with this send is new.
    const again = !!current && incoming.meta.id === current.cached.meta.id;
    if (incoming.meta.base && !again && current?.cached.meta.id !== incoming.meta.base) {
      unusable();
      return;
    }
    setOpening((count) => count + 1);
    try {
      let ready: Ready;
      if (again) {
        const fresh = (cached: CachedBackup): CachedBackup => ({ ...cached, meta: { ...cached.meta, editToken: incoming.meta.editToken, pro: incoming.meta.pro, features: incoming.meta.features } });
        const reseal = current.seal;
        // A patched copy whose sealing failed still holds the patch's chunks:
        // it is sealed again rather than kept under the whole data's meta.
        ready = { ...current, cached: fresh(current.cached), seal: reseal ? async () => fresh(await reseal()) : null };
      } else if (incoming.meta.base) {
        try {
          ready = await openPatch(current!, incoming);
        } catch {
          if (started === generation) unusable();
          return;
        }
      } else {
        const cached: CachedBackup = {
          meta: incoming.meta,
          dataKey: incoming.dataKey,
          ivPrefix: incoming.ivPrefix,
          frames: incoming.frames,
          receivedAt: new Date().toISOString(),
        };
        ready = await openTransfer(cached, incoming.gzipped);
      }
      // Unlinked while it was opening: show nothing and keep nothing.
      if (started !== generation) return;
      readyRef.current = ready;
      setNeedsPhone(false);
      // Data that answers a change keeps the page as it was; other data opens
      // on the remembered period again.
      const awaited = awaitedVersion.current;
      if (awaited === null && !again) setPeriodState(null);
      // The changed data is here, or data made before it, which a newer copy follows.
      if (awaited === null || (incoming.meta.version ?? 0) >= awaited) {
        awaitedVersion.current = null;
        setEditPhase((current) => (current === "syncing" ? "idle" : current));
      }
      setHeardThisVisit(true);
      setPhase({ kind: "linked", link, ready });
      identifyDashboardUser(incoming.meta.analyticsId);
      track(EVENTS.dashboardDataReceived, { result: "success" });
      // Kept once it is on screen: sealing a patched copy takes a moment on a
      // large backup. A copy that could not be sealed is not kept at all.
      let stored = false;
      try {
        const cached = ready.seal ? await ready.seal() : ready.cached;
        // The next copy for this one to stand in for, if it comes again.
        if (readyRef.current === ready) readyRef.current = { ...ready, cached, seal: null };
        // Unlinked (or linked again) while it was sealing: keep nothing.
        if (started !== generation) return;
        stored = await writeCache(cached);
        // Unlinked while it was being written: take back only this copy. The
        // link store may already hold a new link, which must stay.
        if (started !== generation) {
          if (stored) await removeCache(cached);
          return;
        }
      } catch {
        stored = false;
      }
      if (started !== generation) return;
      setError(stored ? null : "storage");
    } catch (failure) {
      if (started !== generation) return;
      // What the phone was told this browser holds is still the data on screen.
      if (acceptedId.current === incoming.meta.id) acceptedId.current = readyRef.current?.cached.meta.id ?? null;
      const code = loadErrorOf(failure);
      setError(code);
      track(EVENTS.dashboardDataReceived, { result: code });
    } finally {
      // An unlink in between started the count again.
      if (started === generation) setOpening((count) => Math.max(0, count - 1));
    }
  }, []);

  /** A seat in the link's relay room for as long as the tab is open. */
  const connect = useCallback(
    (link: StoredLink, standby = false) => {
      setConnection(standby ? "elsewhere" : "connecting");
      let shown = -1;
      const next = new BrowserSession(link, {
        onState: (state) => {
          setConnection(state);
          // The phone left: its next visit brings new tokens.
          if (state !== "phone" && state !== "receiving") setHeardThisVisit(false);
          if (state !== "receiving") {
            shown = -1;
            setProgress(null);
          }
          if (state === "phone") setNeedsPhone(false);
        },
        onProgress: (ratio) => {
          if (ratio < 1 && ratio - shown < PROGRESS_STEP) return;
          shown = ratio;
          setProgress(ratio);
        },
        onReceived: (incoming) => {
          const started = generation;
          acceptedId.current = incoming.meta.id;
          receiving.current = receiving.current.then(() => received(link, incoming, next, started)).catch(() => undefined);
        },
        have: () => acceptedId.current,
        // The phone says this browser holds its latest copy, and the token that came with it is still good.
        onCurrent: () => setHeardThisVisit(true),
        onUnlinked: () => {
          track(EVENTS.dashboardUnlinked, { by: "phone" });
          void forget("unlinked");
        },
        onError: (code) => {
          setError(code);
          track(EVENTS.dashboardDataReceived, { result: code });
        },
      }, { standby });
      setSession(next);
    },
    [forget, received],
  );

  // On open (and when another tab links or unlinks): this browser's link, if
  // any, and the last data it received, shown at once; then wait for the
  // phone in the link's room.
  useEffect(() => {
    let cancelled = false;
    const started = ++generation;
    // A link made in another tab: that tab has the phone, so wait here.
    const standby = linkedElsewhere.current;
    linkedElsewhere.current = false;
    (async () => {
      // A transfer that was opening belongs to the generation just replaced,
      // and will not count itself down.
      setOpening(0);
      if (!browserSupported()) {
        setPhase({ kind: "unlinked", notice: "unsupported" });
        return;
      }
      const link = await readLink();
      if (cancelled || started !== generation) return;
      if (!link) {
        setPhase((current) => (current.kind === "unlinked" ? current : { kind: "unlinked", notice: null }));
        return;
      }
      // Linked: the pages will be needed, so fetch them while the data opens.
      void loadShell().catch(() => undefined);
      const cached = await readCache();
      let ready: Ready | null = null;
      if (cached) {
        try {
          ready = await openTransfer(cached);
        } catch (failure) {
          setError(loadErrorOf(failure));
        }
      }
      if (cancelled || started !== generation) return;
      readyRef.current = ready;
      acceptedId.current = ready?.cached.meta.id ?? null;
      setPhase({ kind: "linked", link, ready });
      identifyDashboardUser(cached?.meta.analyticsId);
      connect(link, standby);
    })();
    return () => {
      cancelled = true;
      setSession(null);
    };
  }, [connect, bootCount]);

  // Other tabs of this browser: an unlink there clears this one too, and a
  // link made there shows here.
  useEffect(() => {
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(CHANNEL);
    } catch {
      return;
    }
    channel.onmessage = (event: MessageEvent<{ type?: string; from?: string }>) => {
      if (event.data?.from === TAB_ID) return;
      if (event.data?.type === "unlinked") void forget(null, undefined, true);
      if (event.data?.type === "linked") {
        linkedElsewhere.current = true;
        setBootCount((value) => value + 1);
      }
    };
    return () => channel?.close();
  }, [forget]);

  // Unlinks the phone has not heard about yet: delivered whenever this tab and
  // the phone are open together, then forgotten.
  useEffect(() => {
    const sessions: BrowserSession[] = [];
    let cancelled = false;
    void readPendingUnlinks().then((pending) => {
      if (cancelled) return;
      for (const item of pending) {
        sessions.push(
          new BrowserSession(
            { roomId: item.roomId, key: item.key, phoneName: null },
            {
              onState: () => undefined,
              onProgress: () => undefined,
              onReceived: () => undefined,
              onError: () => undefined,
              onUnlinked: () => void removePendingUnlink(item.roomId),
            },
            { unlinking: true },
          ),
        );
      }
    });
    return () => {
      cancelled = true;
      for (const pendingSession of sessions) pendingSession.close();
    };
  }, [unlinksVersion]);

  // Another tab of this browser can take the seat; coming back here takes it back.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && session?.state === "elsewhere") session.reconnect();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [session]);

  const onLinked = useCallback(
    async (phone: LinkedPhone) => {
      generation++;
      setOpening(0);
      const link: StoredLink = phone;
      const stored = await writeLink(link);
      if (!stored) setError("storage");
      broadcast({ type: "linked" });
      track(EVENTS.dashboardLinked, {});
      readyRef.current = null;
      acceptedId.current = null;
      setPhase({ kind: "linked", link, ready: null });
      connect(link);
      void loadShell().catch(() => undefined);
    },
    [connect],
  );

  const unlink = useCallback(async () => {
    if (phase.kind !== "linked") return;
    const heard = (await session?.tellUnlinked()) ?? false;
    track(EVENTS.dashboardUnlinked, { by: "browser" });
    // If the phone was not here to hear it, tell it next time it is.
    await forget(null, heard ? undefined : phase.link);
  }, [phase, session, forget]);

  const refresh = useCallback(() => {
    setError(null);
    if (session?.state === "elsewhere") {
      session.reconnect();
      return;
    }
    const asked = session?.requestFresh() ?? false;
    setNeedsPhone(!asked);
  }, [session]);

  const takeOver = useCallback(() => session?.reconnect(), [session]);

  const editToken = phase.kind === "linked" ? (phase.ready?.cached.meta.editToken ?? null) : null;

  /**
   * Sends changes to the phone, which checks them against its own data and
   * saves them. Then the changed data comes back like any other transfer.
   */
  const edit = useCallback(
    async (ops: EditOp[], action: DashboardEditAction): Promise<EditResult> => {
      let result: EditResult;
      if (!session || !editToken || editPhase !== "idle" || !heardThisVisit || connection !== "phone") {
        result = { ok: false, error: editPhase === "idle" ? "away" : "busy" };
      } else {
        setEditPhase("saving");
        result = await session.edit(editToken, ops);
        if (result.ok) {
          // Every token is spent: no change until data with this one is here
          // (an older phone that names no version: the next copy).
          awaitedVersion.current = result.version ?? 0;
          setEditPhase("syncing");
        } else {
          // `stale` and `conflict`: the phone is sending its latest already.
          // `unknown`: it may have been saved; the next copy will tell.
          setEditPhase("idle");
        }
      }
      track(EVENTS.dashboardEdited, { action, result: result.ok ? "saved" : result.error, count: editCount(ops) });
      return result;
    },
    [session, editToken, editPhase, heardThisVisit, connection],
  );

  // Saved, but the changed data never came (the phone closed the screen):
  // stop waiting, so a refresh can bring it and a token with it.
  useEffect(() => {
    if (editPhase !== "syncing") return;
    const timer = setTimeout(() => {
      awaitedVersion.current = null;
      setEditPhase("idle");
    }, SYNC_WAIT_MS);
    return () => clearTimeout(timer);
  }, [editPhase]);

  const ready = phase.kind === "linked" ? phase.ready : null;
  const cached = ready?.cached ?? null;
  const fullModel = ready?.model ?? null;
  const model = useMemo(() => (fullModel ? applyFilters(fullModel, filters) : null), [fullModel, filters]);

  // The remembered preset, ending at the data's latest month, until one is chosen.
  // A free account falls back to a month when the remembered period is one only Pro shows.
  const pro = cached?.meta.pro === true;
  const period = useMemo<Period | null>(() => {
    if (!model) return null;
    if (chosenPeriod && (pro || !isProPreset(chosenPeriod.preset))) return chosenPeriod;
    const remembered = readPrefs().preset ?? "month";
    const preset = !pro && isProPreset(remembered) ? "month" : remembered;
    return { preset, end: presetEnd(preset, model) };
  }, [chosenPeriod, model, pro]);

  const setMode = useCallback((next: Mode) => {
    setModeState(next);
    writePrefs({ mode: next });
  }, []);
  const setPeriod = useCallback((next: Period) => {
    setPeriodState(next);
    writePrefs({ preset: next.preset });
  }, []);
  const setHidden = useCallback((next: boolean) => {
    setHiddenState(next);
    writePrefs({ hidden: next });
  }, []);
  const setFilters = useCallback((next: Filters) => {
    setFiltersState(next);
    writePrefs({ filters: next });
  }, []);

  const navigate = useCallback((next: string) => {
    if (!isViewId(next)) return;
    window.history.replaceState(null, "", `#/${next}`);
    setView(next);
    document.getElementById("dashboard-main")?.scrollTo({ top: 0 });
  }, []);

  // One event per dashboard page opened, including the one a refresh lands on.
  const showing = Boolean(ready);
  useEffect(() => {
    if (showing) track(EVENTS.dashboardViewOpened, { view });
  }, [showing, view]);

  // Object URLs for the backup's photos. A new set releases the last one's
  // URLs once it is on screen; the page's own unload releases the final set.
  const userAssets = ready?.userAssets;
  const assets = useMemo(() => createAssetResolver(userAssets ?? []), [userAssets]);
  const shownAssets = useRef<typeof assets | null>(null);
  useEffect(() => {
    if (shownAssets.current && shownAssets.current !== assets) shownAssets.current.dispose();
    shownAssets.current = assets;
  }, [assets]);

  const resolved = useMemo(() => (model && period ? resolvePeriod(period, model) : null), [model, period]);

  const loading: Loading | null =
    opening > 0 ? "opening" : connection === "receiving" ? (progress === null ? "preparing" : "receiving") : null;

  // An app that predates web edits sends no token at all; a newer one sends
  // null to a browser it has not allowed to make changes.
  const token = cached?.meta.editToken;
  const editing: EditAvailability =
    editPhase !== "idle"
      ? editPhase
      : loading
        ? "syncing"
        : connection !== "phone"
          ? "away"
          : token === undefined
            ? "update"
            : token === null
              ? "off"
              : heardThisVisit
                ? "ready"
                : "syncing";

  // Made from `editing` rather than the transfer's own steps (`progress`,
  // `loading`), which only `transfer` below carries: the pages redraw when a
  // transfer starts and ends, not at every step of it.
  const linkState: LinkState | null = useMemo(() => {
    if (phase.kind !== "linked" || !cached) return null;
    const exported = cached.meta.exportedAt ? Date.parse(cached.meta.exportedAt) : NaN;
    return {
      phoneName: phase.link.phoneName,
      dataAt: Number.isFinite(exported) ? exported : Date.parse(cached.receivedAt),
      sourceDevice: cached.meta.deviceName,
      pro: cached.meta.pro === true,
      budgetCurrencies: phoneTakesBudgetCurrencies(cached.meta),
      creditDueDaysAfter: phoneTakesCreditDueDaysAfter(cached.meta),
      error,
      needsPhone,
      refresh,
      takeOver,
      unlink: () => void unlink(),
      editing,
      edit,
    };
  }, [phase, cached, error, needsPhone, refresh, takeOver, unlink, editing, edit]);

  const transfer = useMemo<TransferState>(() => ({ connection, progress, loading }), [connection, progress, loading]);
  // The same element while only the transfer moves, so the pages are not drawn again for it.
  const shell = useMemo(() => <DashboardShell view={view} />, [view]);

  const context = useMemo(
    () =>
      model && fullModel && period && resolved && linkState
        ? {
            model,
            fullModel,
            filters,
            setFilters,
            hidden,
            setHidden,
            mode,
            setMode,
            period,
            setPeriod,
            resolved,
            asset: assets.resolve,
            navigate,
            link: linkState,
          }
        : null,
    [model, fullModel, filters, setFilters, hidden, setHidden, mode, setMode, period, setPeriod, resolved, assets, navigate, linkState],
  );

  if (phase.kind === "checking") return <Checking />;

  if (phase.kind === "unlinked") return <LinkScreen mode="qr" notice={phase.notice} onLinked={onLinked} />;

  if (!context) {
    return (
      <LinkScreen
        mode="waiting"
        phoneName={phase.link.phoneName}
        connection={connection}
        progress={progress}
        loading={loading}
        error={error}
        refresh={refresh}
        takeOver={takeOver}
        unlink={() => void unlink()}
      />
    );
  }

  return (
    <DashboardProvider value={context} transfer={transfer}>
      {shell}
    </DashboardProvider>
  );
}
