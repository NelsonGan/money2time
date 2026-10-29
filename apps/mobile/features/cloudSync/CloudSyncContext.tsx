// Cloud Sync state for the app: who is signed in, whether this phone's data
// and the cloud copy are linked, and when syncs run. See README.md > Cloud Sync.
//
// Linking happens once per sign-in on a phone (lib/linking.ts decides how).
// Once linked, syncs run on the schedule in hooks/useSyncScheduler.ts.
// Shared ledgers (services/sharedLedgerSync.ts) sync on the same schedule,
// and also for a signed-in user who is not Pro (a member). Anyone can sign
// in: the account's Pro (any of its phones) unlocks Pro on this phone too
// (services/accountPro.ts), and a live socket (services/liveSync.ts) tells
// this phone when another one changed something.

import * as Device from 'expo-device';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';

import { useApp } from '~/context/AppContext';
import { usePro } from '~/context/ProContext';
import { DEFAULT_LEDGER_ID, getActiveLedgerId } from '~/lib/db/ledgerScope';
import { ledgersRepository } from '~/lib/repositories/ledgersRepository';
import { clearAccountPro, getAccountProAnswer, setAccountPro } from '~/services/accountPro';
import { AnalyticsEvents, trackEvent } from '~/services/analytics';
import { runAutoBackupIfDue } from '~/services/autoBackup';
import { reportError } from '~/services/errorReporting';
import { runUserAssetGc } from '~/services/userAssetGc';

import { useSyncScheduler } from './hooks/useSyncScheduler';
import { PERSONAL_CHANNEL } from './lib/ledgerRows';
import { decideLink } from './lib/linking';
import {
  CloudSyncApiError,
  type CloudUser,
  deleteAccount as apiDeleteAccount,
  getAccountStatus,
  getSyncCredentials,
  notifyChanged,
  PERSONAL_MEDIA_PATH,
  sendAppleAuthorization,
  sendEmailCode as apiSendEmailCode,
  signInWithEmailCode,
  signInWithIdToken,
  type SyncCredentials,
} from './services/cloudSyncApi';
import {
  clearSession,
  getLastLinkedUser,
  loadSession,
  saveSession,
  setLastLinkedUser,
  type StoredSession,
} from './services/cloudSyncSession';
import { LIVE_DEVICE_ID, startLiveSync } from './services/liveSync';
import { NATIVE_PROVIDERS, type NativeProvider } from './services/nativeSignIn';
import { finishPendingSignOut, unlinkAndEndSession } from './services/pendingSignOut';
import { type SharedLedger, subscribeSharedLedgers } from './services/sharedLedgerStore';
import { sharedLedgerSync } from './services/sharedLedgerSync';
import {
  type DataSummary,
  deleteReplicaFiles,
  disableCapture,
  enableCapture,
  isCloudSyncAvailable,
  pendingChangeCount,
  pendingSharedChangeCount,
  resetLocalSyncState,
  runExclusive,
  summarizeLocal,
  SyncEngine,
} from './services/syncEngine';

const TOKEN_REFRESH_MARGIN_MS = 24 * 60 * 60 * 1000;
/** The account's Pro is asked again at most this often, unless something calls for it. */
const ACCOUNT_PRO_EVERY_MS = 5 * 60_000;

export type CloudSyncStatus =
  /** A build without the native sync module. */
  | 'unavailable'
  | 'loading'
  | 'signedOut'
  /** Signed in; bringing this phone and the cloud copy together (retried while offline). */
  | 'linking'
  /** Both have data: waiting for the user to pick one. */
  | 'needsChoice'
  | 'ready'
  /** Signed in, but the account is not Pro: nothing syncs (see `linked`). */
  | 'notPro';

type SignInMethod = NativeProvider | 'email';

export interface CloudSyncChoice {
  local: DataSummary;
  cloud: DataSummary;
}

export type CloudSyncErrorKind = 'offline' | 'session_expired' | 'server' | 'unknown';

type LinkMode = 'uploaded' | 'downloaded' | 'kept_cloud' | 'kept_phone';

interface CloudSyncContextValue {
  status: CloudSyncStatus;
  user: CloudUser | null;
  isSyncing: boolean;
  lastSyncedAt: number | null;
  lastError: CloudSyncErrorKind | null;
  choice: CloudSyncChoice | null;
  /**
   * This phone's data has been linked to the cloud copy in this sign-in. A
   * `notPro` phone that never linked has not started syncing, as opposed to
   * one whose Pro ended.
   */
  linked: boolean;
  /** The account is Pro, but this phone is past the 5 phones its Pro reaches. */
  phoneLimited: boolean;
  signInWithNative: (provider: NativeProvider) => Promise<'ok' | 'cancelled'>;
  sendEmailCode: (email: string, captchaToken?: string) => Promise<void>;
  verifyEmailCode: (email: string, code: string) => Promise<void>;
  resolveChoice: (keep: 'cloud' | 'phone') => Promise<void>;
  syncNow: () => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  /** Shares one of the user's ledgers (Pro, signed in). */
  shareLedger: (ledger: {
    id: string;
    name: string;
    emoji: string | null;
  }) => Promise<SharedLedger>;
  /**
   * Owner: stop sharing; members lose the ledger and its cloud database goes.
   * `whenUnreachable: 'local'` also stops it with no session or network (the
   * Worker is told after the next sign-in), as deleting the ledger needs.
   */
  stopSharingLedger: (
    ledgerId: string,
    opts?: { whenUnreachable?: 'fail' | 'local' },
  ) => Promise<void>;
  /** Member: leave; this phone's copy goes. */
  leaveLedger: (ledgerId: string) => Promise<void>;
  /** Joins with an invite code; returns the ledger's id, now on this phone. */
  joinLedger: (code: string) => Promise<string>;
  /** The Worker session token, for the shared-ledger screens' own calls. */
  getSessionToken: () => Promise<string>;
  /** Re-reads the shared-ledger list now; ledgers no longer shared leave the phone. */
  refreshSharedLedgers: () => Promise<void>;
}

const CloudSyncContext = createContext<CloudSyncContextValue | null>(null);

/** Whether this build can sync (it has the native Turso module). */
export function useCloudSyncEnabled(): boolean {
  return isCloudSyncAvailable();
}

/** The Worker refused this phone Pro: the account has none, or this phone is past its limit. */
function isNotPro(error: unknown): boolean {
  return (
    error instanceof CloudSyncApiError && (error.code === 'not_pro' || error.code === 'phone_limit')
  );
}

function isPhoneLimit(error: unknown): boolean {
  return error instanceof CloudSyncApiError && error.code === 'phone_limit';
}

function errorKind(error: unknown): CloudSyncErrorKind {
  if (error instanceof CloudSyncApiError) {
    if (error.code === 'network') return 'offline';
    if (error.code === 'unauthorized') return 'session_expired';
    return 'server';
  }
  const message = error instanceof Error ? error.message : String(error);
  // Turso's IO errors when the network is down.
  if (/network|fetch|offline|timed out|abort/i.test(message)) return 'offline';
  return 'unknown';
}

export function CloudSyncProvider({ children }: { children: React.ReactNode }) {
  const enabled = useCloudSyncEnabled();
  const { settings, refreshAll, switchLedger } = useApp();
  const { isPro, isStorePro, isStatusKnown } = usePro();
  const appUserId = settings?.appUserId ?? null;

  const [status, setStatus] = useState<CloudSyncStatus>(enabled ? 'loading' : 'unavailable');
  const statusRef = useRef(status);
  statusRef.current = status;
  const [user, setUser] = useState<CloudUser | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [lastError, setLastError] = useState<CloudSyncErrorKind | null>(null);
  const [choice, setChoice] = useState<CloudSyncChoice | null>(null);
  const [linked, setLinked] = useState(false);
  /** The account is Pro, but this phone is past the 5 phones its Pro reaches. */
  const [phoneLimited, setPhoneLimited] = useState(false);

  const sessionRef = useRef<StoredSession | null>(null);
  const engineRef = useRef<SyncEngine | null>(null);
  /** The engine being opened, so concurrent callers share it. */
  const openingRef = useRef<Promise<SyncEngine> | null>(null);
  /** The sign-in generation the engine being opened belongs to. */
  const openingGenerationRef = useRef(-1);
  const credentialsRef = useRef<SyncCredentials | null>(null);
  /** Bumped on every sign-out: work started before it is discarded. */
  const generationRef = useRef(0);
  /** The last sync failed; its changes may already be in the replica, so retry soon. */
  const retryRef = useRef(false);
  /** A failure streak is reported once, not on every retry. */
  const reportedRef = useRef(false);
  const linkingRef = useRef(false);
  /** Signing out or deleting the account: no new sync may start. */
  const closingRef = useRef(false);
  /** The personal sync in flight, and whether another was asked for meanwhile. */
  const syncingRef = useRef<Promise<void> | null>(null);
  const syncAgainRef = useRef(false);
  const accountCheckedAtRef = useRef(0);
  const accountAskRef = useRef(0);
  const appUserIdRef = useRef(appUserId);
  appUserIdRef.current = appUserId;
  const refreshAllRef = useRef(refreshAll);
  refreshAllRef.current = refreshAll;
  const switchLedgerRef = useRef(switchLedger);
  switchLedgerRef.current = switchLedger;

  /**
   * Reloads the app after rows came from the cloud. If the ledger open on this
   * phone is gone (deleted on another phone, or not in a cloud copy just
   * taken), the default ledger opens instead.
   */
  const reloadAfterApply = useCallback(() => {
    const open = getActiveLedgerId();
    if (open !== DEFAULT_LEDGER_ID && !ledgersRepository.getById(open)) {
      switchLedgerRef.current(DEFAULT_LEDGER_ID);
    } else {
      refreshAllRef.current();
    }
  }, []);

  const sessionToken = useCallback(async () => {
    const token = sessionRef.current?.token;
    if (!token) throw new CloudSyncApiError('unauthorized', 401);
    return token;
  }, []);

  /** Tells the other phones that `channel` changed. Best effort. */
  const announce = useCallback((channel: string) => {
    const token = sessionRef.current?.token;
    if (!token) return;
    void notifyChanged(token, channel, LIVE_DEVICE_ID).catch(() => undefined);
  }, []);
  const announceRef = useRef(announce);
  announceRef.current = announce;

  /**
   * Asks the Worker whether the account is Pro (any of its phones), and links
   * this install if it is Pro itself. The answer makes this phone Pro too,
   * but only once its data is linked to the account: a phone that just signed
   * in, or is waiting on the keep-which-data choice, is not Pro through it.
   * Sharing a sign-in to share Pro would mean sharing one's money data.
   * A failed read keeps the last answer (offline keeps Pro for a while), and
   * is asked again at the next sync after 5 minutes or on the next event.
   */
  const refreshAccountPro = useCallback(async (force = false) => {
    const session = sessionRef.current;
    if (!session) return;
    if (!force && Date.now() - accountCheckedAtRef.current < ACCOUNT_PRO_EVERY_MS) return;
    accountCheckedAtRef.current = Date.now();
    const asked = ++accountAskRef.current;
    try {
      // The install is linked to the account only once its data is: a Pro
      // phone signing in to someone else's account and backing out lends it
      // nothing.
      const { isPro: accountIsPro, limited } = await getAccountStatus(
        session.token,
        session.linked ? appUserIdRef.current : null,
      );
      const current = sessionRef.current;
      // Signed out meanwhile, or a newer answer is on its way.
      if (current?.user.id !== session.user.id || asked !== accountAskRef.current) return;
      setAccountPro(session.user.id, accountIsPro && current.linked);
      setPhoneLimited(limited);
    } catch {
      // Offline, or a Worker without the route: the last answer stands.
    }
  }, []);

  const refreshAccountProRef = useRef(refreshAccountPro);
  refreshAccountProRef.current = refreshAccountPro;

  /** Points the shared-ledger side at the session (or at none). */
  const bindShared = useCallback(
    (session: StoredSession | null) => {
      sharedLedgerSync.configure(
        session
          ? {
              userId: session.user.id,
              getSessionToken: sessionToken,
              deviceName: deviceName(),
              personalInactive: () =>
                statusRef.current === 'notPro' && sessionRef.current?.linked !== true,
              announce: (shareId) => announceRef.current(shareId),
            }
          : null,
      );
    },
    [sessionToken],
  );

  const fetchCredentials = useCallback(async (): Promise<SyncCredentials> => {
    const current = credentialsRef.current;
    if (current && current.expiresAt - Date.now() > TOKEN_REFRESH_MARGIN_MS) return current;
    const id = appUserIdRef.current;
    if (!id) throw new Error('no_app_user_id');
    const next = await getSyncCredentials(await sessionToken(), id);
    credentialsRef.current = next;
    return next;
  }, [sessionToken]);

  const closeEngine = useCallback(() => {
    engineRef.current?.close();
    engineRef.current = null;
    credentialsRef.current = null;
  }, []);

  /**
   * Drops the session but keeps this phone's data. A deliberate sign-out also
   * lets go of shared ledgers (a member's copies are deleted), the sync
   * bookkeeping and the account's Pro. An expired session keeps all three:
   * edits made meanwhile stay queued, Pro stays for its offline grace, and
   * signing in again to the same account carries on without relinking.
   */
  const forgetSession = useCallback(
    async (opts: { deleteReplica: boolean }) => {
      generationRef.current += 1;
      const userId = sessionRef.current?.user.id;
      sessionRef.current = null;
      // Between replica operations, so no engine is closed mid-sync.
      await runExclusive(() => {
        if (opts.deleteReplica) sharedLedgerSync.forgetAll(userId);
        bindShared(null);
        closeEngine();
        if (opts.deleteReplica) {
          resetLocalSyncState();
          if (userId) deleteReplicaFiles(userId);
        }
      });
      retryRef.current = false;
      reportedRef.current = false;
      accountCheckedAtRef.current = 0;
      if (opts.deleteReplica) {
        // The account's Pro was this account's; the phone keeps its own.
        clearAccountPro();
        await setLastLinkedUser(null);
      }
      await clearSession();
      setUser(null);
      setLinked(false);
      setPhoneLimited(false);
      setChoice(null);
      setLastSyncedAt(null);
      setLastError(null);
      setStatus('signedOut');
      if (opts.deleteReplica) reloadAfterApply();
    },
    [bindShared, closeEngine, reloadAfterApply],
  );

  const report = useCallback((error: unknown, stage: string, kind: CloudSyncErrorKind) => {
    if (kind === 'offline' || reportedRef.current) return;
    reportedRef.current = true;
    void trackEvent(AnalyticsEvents.CLOUD_SYNC_FAILED, { stage, error_kind: kind });
    reportError(error, { scope: 'cloud_sync', stage });
  }, []);

  const handleError = useCallback(
    async (error: unknown, stage: string, generation: number) => {
      if (generation !== generationRef.current) return;
      if (isNotPro(error)) {
        closeEngine();
        setPhoneLimited(isPhoneLimit(error));
        setStatus('notPro');
        return;
      }
      const kind = errorKind(error);
      if (kind === 'session_expired') {
        await forgetSession({ deleteReplica: false });
        setLastError(kind);
        return;
      }
      setLastError(kind);
      // At launch the status waits for the first sync, so a failure still
      // shows the signed-in screen with its error.
      setStatus((current) => (current === 'loading' ? 'ready' : current));
      report(error, stage, kind);
    },
    [closeEngine, forgetSession, report],
  );

  const openEngine = useCallback((): Promise<SyncEngine> => {
    const session = sessionRef.current;
    if (!session) return Promise.reject(new CloudSyncApiError('unauthorized', 401));
    if (engineRef.current?.userId === session.user.id) return Promise.resolve(engineRef.current);
    // An opening from before a sign-out belongs to that session: never reuse it.
    if (openingRef.current && openingGenerationRef.current === generationRef.current) {
      return openingRef.current;
    }
    closeEngine();
    const generation = generationRef.current;
    const opening = (async () => {
      const credentials = await fetchCredentials();
      const engine = new SyncEngine({
        userId: session.user.id,
        channel: PERSONAL_CHANNEL,
        url: credentials.url,
        getTursoToken: async () => (await fetchCredentials()).authToken,
        getSessionToken: sessionToken,
        mediaPath: PERSONAL_MEDIA_PATH,
        beforeLedgerRemovals: async () => {
          await sharedLedgerSync.refreshList(true, { letGo: false });
        },
        deviceName: deviceName(),
      });
      await engine.open();
      if (generation !== generationRef.current) {
        engine.close();
        throw new Error('signed_out');
      }
      engineRef.current = engine;
      return engine;
    })().finally(() => {
      if (openingRef.current === opening) openingRef.current = null;
    });
    openingRef.current = opening;
    openingGenerationRef.current = generation;
    return opening;
  }, [closeEngine, fetchCredentials, sessionToken]);

  /** Syncs the shared ledgers; failures are retried on the next tick, not shown. */
  const runSharedSync = useCallback(
    async (opts: { forceList?: boolean } = {}) => {
      if (!sessionRef.current || closingRef.current) return;
      const generation = generationRef.current;
      try {
        const outcome = await sharedLedgerSync.syncAll(opts);
        if (generation !== generationRef.current) return;
        if (outcome.appliedRows > 0 || outcome.removedLedgers > 0) reloadAfterApply();
      } catch (error) {
        if (generation !== generationRef.current) return;
        if (errorKind(error) === 'session_expired') {
          await forgetSession({ deleteReplica: false });
          setLastError('session_expired');
        }
      }
    },
    [forgetSession, reloadAfterApply],
  );

  const runSyncOnce = useCallback(async () => {
    if (closingRef.current) return;
    if (!sessionRef.current?.linked) {
      await runSharedSync();
      return;
    }
    const generation = generationRef.current;
    setIsSyncing(true);
    try {
      void refreshAccountPro();
      // Which ledgers are shared decides where rows go, so learn of a ledger
      // shared from another phone before its rows leave the user's own copy.
      // A failed read is retried later, but a rejected session is not: the
      // account may have been deleted on another phone, while the cached
      // Turso token would keep syncing for days.
      const removed = await sharedLedgerSync.refreshList().catch((error: unknown) => {
        if (errorKind(error) === 'session_expired') throw error;
        return 0;
      });
      if (removed > 0) reloadAfterApply();
      const engine = await openEngine();
      const outcome = await engine.syncNow();
      if (generation !== generationRef.current) return;
      if (outcome.pushed) announce(PERSONAL_CHANNEL);
      retryRef.current = false;
      reportedRef.current = false;
      setStatus('ready');
      setPhoneLimited(false);
      setLastSyncedAt(Date.now());
      setLastError(null);
      // No image sweep here: a photo just picked in an editor is not in a
      // row yet, and the sweep would delete it.
      if (outcome.appliedRows > 0) reloadAfterApply();
    } catch (error) {
      retryRef.current = true;
      await handleError(error, 'sync', generation);
    } finally {
      setIsSyncing(false);
    }
    await runSharedSync();
  }, [announce, handleError, openEngine, refreshAccountPro, reloadAfterApply, runSharedSync]);

  /**
   * One personal sync at a time. A call while one runs (an edit, a live
   * nudge) is not dropped: one more sync follows, which picks up everything
   * asked for meanwhile.
   */
  const runSync = useCallback((): Promise<void> => {
    if (syncingRef.current) {
      syncAgainRef.current = true;
      return syncingRef.current;
    }
    const run = (async () => {
      try {
        do {
          syncAgainRef.current = false;
          await runSyncOnce();
        } while (syncAgainRef.current && !closingRef.current);
      } finally {
        // In the same tick as the last check, so no request falls between.
        syncingRef.current = null;
      }
    })();
    syncingRef.current = run;
    return run;
  }, [runSyncOnce]);

  const markLinked = useCallback(async (mode: LinkMode) => {
    const session = sessionRef.current;
    if (!session) return;
    const next = { ...session, linked: true };
    sessionRef.current = next;
    await saveSession(next);
    await setLastLinkedUser(session.user.id);
    setLinked(true);
    setChoice(null);
    setLastError(null);
    setStatus('ready');
    setPhoneLimited(false);
    setLastSyncedAt(Date.now());
    void trackEvent(AnalyticsEvents.CLOUD_SYNC_ENABLED, { mode });
    // This phone's data replaced the cloud copy: the other phones take it now.
    if (mode === 'uploaded' || mode === 'kept_phone') announceRef.current(PERSONAL_CHANNEL);
    // Linked: the account's Pro now counts on this phone too.
    void refreshAccountProRef.current(true);
  }, []);

  /** Replaces this phone's data with the cloud copy and finishes linking. */
  const adoptCloudCopy = useCallback(
    async (engine: SyncEngine, mode: 'downloaded' | 'kept_cloud') => {
      await engine.replaceLocalWithCloud();
      reloadAfterApply();
      runUserAssetGc();
      await markLinked(mode);
      void runSync();
    },
    [markLinked, reloadAfterApply, runSync],
  );

  /** Brings this phone and the cloud copy together after a sign-in. */
  const link = useCallback(async () => {
    if (linkingRef.current) return;
    linkingRef.current = true;
    const generation = generationRef.current;
    setStatus('linking');
    try {
      await refreshAccountPro(true);
      const engine = await openEngine();
      await engine.pullLatest();
      const cloud = await engine.summarizeCloud();
      const local = summarizeLocal();
      if (generation !== generationRef.current) return;
      const decision = decideLink(cloud, local);
      if (decision === 'upload') {
        await engine.uploadAllReplacingCloud();
        await markLinked('uploaded');
      } else if (decision === 'download') {
        await adoptCloudCopy(engine, 'downloaded');
      } else {
        setChoice({ local, cloud });
        setStatus('needsChoice');
      }
    } catch (error) {
      if (generation !== generationRef.current) return;
      if (isNotPro(error)) {
        closeEngine();
        setPhoneLimited(isPhoneLimit(error));
        setStatus('notPro');
        return;
      }
      const kind = errorKind(error);
      if (kind === 'offline') {
        // Keep the sign-in: linking starts again once the phone is online.
        closeEngine();
        setLastError(kind);
        return;
      }
      // Start over from the sign-in screen, with the reason shown there.
      report(error, 'link', kind);
      await forgetSession({ deleteReplica: true });
      setLastError(kind);
    } finally {
      linkingRef.current = false;
    }
  }, [
    adoptCloudCopy,
    closeEngine,
    forgetSession,
    markLinked,
    openEngine,
    refreshAccountPro,
    report,
  ]);

  const resolveChoice = useCallback(
    async (keep: 'cloud' | 'phone') => {
      const generation = generationRef.current;
      // The choice screen stays up (with its own progress) so a failure can
      // be shown on it.
      try {
        const engine = await openEngine();
        if (keep === 'cloud') {
          // A copy of this phone's data first, so it can be restored later.
          const backup = await runAutoBackupIfDue({ force: true });
          if (!backup.written.length) throw new Error('backup_failed');
          await adoptCloudCopy(engine, 'kept_cloud');
        } else {
          await engine.uploadAllReplacingCloud();
          await markLinked('kept_phone');
        }
      } catch (error) {
        await handleError(error, 'choice', generation);
        throw error;
      }
    },
    [adoptCloudCopy, handleError, markLinked, openEngine],
  );

  const completeSignIn = useCallback(
    async (token: string, signedIn: CloudUser, method: SignInMethod) => {
      // An earlier sign-out that could not unlink this phone does so first,
      // whichever account this is: then linking below starts from a clean slate.
      await finishPendingSignOut();
      // Signing in again to the account this phone was linked to when its
      // session expired carries on: its queued edits and sync bookkeeping are
      // still here. Anyone else (or after a sign-out) links afresh.
      const resume = (await getLastLinkedUser()) === signedIn.id;
      if (!resume) {
        resetLocalSyncState();
        await setLastLinkedUser(null);
      }
      closingRef.current = false;
      retryRef.current = false;
      reportedRef.current = false;
      // Another account's Pro does not carry over.
      if (getAccountProAnswer()?.userId !== signedIn.id) clearAccountPro();
      accountCheckedAtRef.current = 0;
      const session: StoredSession = { token, user: signedIn, linked: resume };
      sessionRef.current = session;
      bindShared(session);
      await saveSession(session);
      setUser(signedIn);
      setLastError(null);
      void trackEvent(AnalyticsEvents.CLOUD_SYNC_SIGNED_IN, { method });
      // Which ledgers are shared decides what linking compares and replaces.
      // Ledgers this account no longer shares (stopped on another phone, or
      // shared by an account since deleted) are let go first, so an owner's
      // ledger goes into their own copy with the rest of their data.
      await sharedLedgerSync.refreshList(true, { notice: false }).catch(() => 0);
      if (resume) {
        setLinked(true);
        enableCapture();
        setStatus('loading');
        void refreshAccountPro(true);
        await runSync();
      } else {
        await link();
      }
      // Shared ledgers this account already belongs to come down too.
      void runSharedSync({ forceList: true });
    },
    [bindShared, link, refreshAccountPro, runSharedSync, runSync],
  );

  const signInWithNative = useCallback(
    async (provider: NativeProvider): Promise<'ok' | 'cancelled'> => {
      const result = await NATIVE_PROVIDERS[provider].signIn();
      if (!result.ok) {
        if (result.reason === 'cancelled') return 'cancelled';
        throw new Error(result.message ?? result.reason);
      }
      const signedIn = await signInWithIdToken(result);
      if (result.authorizationCode) {
        // Apple only, best effort: without it, deleting the account cannot
        // revoke Apple's tokens.
        void sendAppleAuthorization(signedIn.token, result.authorizationCode).catch(
          () => undefined,
        );
      }
      await completeSignIn(signedIn.token, signedIn.user, provider);
      return 'ok';
    },
    [completeSignIn],
  );

  const sendEmailCode = useCallback(async (email: string, captchaToken?: string) => {
    await apiSendEmailCode(email.trim().toLowerCase(), captchaToken);
  }, []);

  const verifyEmailCode = useCallback(
    async (email: string, code: string) => {
      const signedIn = await signInWithEmailCode(email.trim().toLowerCase(), code.trim());
      await completeSignIn(signedIn.token, signedIn.user, 'email');
    },
    [completeSignIn],
  );

  const syncNow = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) return;
    // Pro may have been restored since the last answer, here or on another phone.
    if (status === 'notPro') {
      credentialsRef.current = null;
      await refreshAccountPro(true);
    }
    if (session.linked) await runSync();
    else await link();
  }, [link, refreshAccountPro, runSync, status]);

  const signOut = useCallback(async () => {
    const wasLinked = sessionRef.current?.linked ?? false;
    // Let work in flight finish, then push what is waiting, before the
    // replica is closed and deleted. No scheduled sync starts meanwhile.
    closingRef.current = true;
    await syncingRef.current?.catch(() => undefined);
    const engine = engineRef.current;
    if (engine) {
      await engine.waitIdle();
      if (pendingChangeCount() > 0) await engine.syncNow().catch(() => undefined);
    }
    await sharedLedgerSync.waitIdle();
    if (pendingChangeCount() > 0) await sharedLedgerSync.syncAll().catch(() => undefined);
    const token = sessionRef.current?.token;
    // This phone no longer makes the account Pro (before the session goes);
    // offline, that is retried later and the user is signed out here anyway.
    if (token) await unlinkAndEndSession(token, appUserIdRef.current);
    try {
      await forgetSession({ deleteReplica: true });
    } finally {
      closingRef.current = false;
    }
    if (wasLinked) void trackEvent(AnalyticsEvents.CLOUD_SYNC_SIGNED_OUT);
  }, [forgetSession]);

  const deleteAccount = useCallback(async () => {
    const token = await sessionToken();
    // Nothing may start while the account goes: a list read in flight would
    // otherwise write the deleted account's shared ledgers back afterwards.
    closingRef.current = true;
    try {
      await syncingRef.current?.catch(() => undefined);
      await engineRef.current?.waitIdle();
      await sharedLedgerSync.waitIdle();
      await apiDeleteAccount(token);
    } catch (error) {
      closingRef.current = false;
      throw error;
    }
    try {
      await forgetSession({ deleteReplica: true });
    } finally {
      closingRef.current = false;
    }
    void trackEvent(AnalyticsEvents.CLOUD_SYNC_ACCOUNT_DELETED);
  }, [forgetSession, sessionToken]);

  // Restore the session at launch; stop capturing changes on a build that cannot sync.
  useEffect(() => {
    if (!enabled) {
      closeEngine();
      disableCapture();
      setStatus('unavailable');
      return;
    }
    if (!appUserId) return;
    let cancelled = false;
    void (async () => {
      void finishPendingSignOut();
      const session = await loadSession();
      if (cancelled) return;
      sessionRef.current = session;
      bindShared(session);
      if (!session) {
        // An answer kept for an expired session of the account this phone
        // was linked to stays for its grace; any other is stale.
        const answer = getAccountProAnswer();
        if (answer && answer.userId !== (await getLastLinkedUser())) clearAccountPro();
        setStatus('signedOut');
        return;
      }
      if (getAccountProAnswer() && getAccountProAnswer()?.userId !== session.user.id) {
        clearAccountPro();
      }
      if (session.linked) void setLastLinkedUser(session.user.id);
      setUser(session.user);
      setLinked(session.linked);
      void refreshAccountPro(true);
      // Not linked: the app closed during linking, or the account is not Pro
      // yet. Start linking again (it stops at notPro if so).
      if (!session.linked) {
        await sharedLedgerSync.refreshList(true).catch(() => 0);
        await link();
        void runSharedSync({ forceList: true });
        return;
      }
      // Record edits even if this launch cannot sync (offline, Pro ended):
      // they go up with the next sync that can.
      enableCapture();
      await runSync();
    })();
    return () => {
      cancelled = true;
    };
    // Runs once per enable / app user id; the callbacks are stable enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, appUserId]);

  // When Pro ends on this phone, drop the cached access so the next sync asks
  // the Worker (the account may still be Pro through another phone) instead of
  // syncing on until the issued token expires. When it comes back, resume at
  // once: edits made while paused are still in the outbox.
  const wasProRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (!isStatusKnown) return;
    const was = wasProRef.current;
    wasProRef.current = isPro;
    if (was === null || was === isPro) return;
    if (status !== 'ready' && status !== 'notPro') return;
    // Between replica operations: a sync may be running on the engine.
    if (!isPro) void runExclusive(closeEngine);
    void syncNow();
    // A shared ledger of this user's resumes (or pauses) with it.
    void runSharedSync({ forceList: true });
    // Only a change of Pro matters here, not every new callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPro, isStatusKnown]);

  // A sign-out that could not unlink this phone (offline) is retried on
  // every return to the app until the Worker hears it.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void finishPendingSignOut();
    });
    return () => subscription.remove();
  }, []);

  // A purchase or restore on this phone (or its Pro ending) changes what the
  // account is worth to every phone: ask again at once. A restore here may
  // also have moved the purchase away from another phone, which then stays
  // Pro through the account because this install is linked now.
  const wasStoreProRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (!isStatusKnown) return;
    const was = wasStoreProRef.current;
    wasStoreProRef.current = isStorePro;
    if (was === null || was === isStorePro || !sessionRef.current) return;
    void refreshAccountPro(true);
    // Only a change of the store's answer matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStorePro, isStatusKnown]);

  const scheduledSync = useCallback(() => void runSync(), [runSync]);
  const syncWanted = useCallback(() => retryRef.current || pendingChangeCount() > 0, []);
  // An edit goes up within about 2 s, unless a sync is running (it follows
  // that one) or the last failed (the 15 s retry has it).
  // A shared ledger whose sync keeps failing leaves rows in the outbox too:
  // then this waits for the 15 s retry rather than syncing every 2 s.
  const pushSoon = useCallback(
    () =>
      !syncingRef.current &&
      !retryRef.current &&
      !sharedLedgerSync.retry &&
      pendingChangeCount() > 0,
    [],
  );
  useSyncScheduler(status === 'ready', scheduledSync, syncWanted, { pushSoon });

  // Paused: check again on return to the app and every few minutes, so a
  // renewal on another phone resumes this one without a tap.
  const scheduledResume = useCallback(() => void syncNow(), [syncNow]);
  const never = useCallback(() => false, []);
  useSyncScheduler(status === 'notPro', scheduledResume, never);

  const scheduledLink = useCallback(() => void link(), [link]);
  const always = useCallback(() => true, []);
  useSyncScheduler(status === 'linking' && lastError === 'offline', scheduledLink, always);

  // Shared ledgers when the user's own data does not sync (a member without
  // Pro, or Pro paused): on their own schedule. Ready runs them with runSync.
  const hasShared = useHasSharedLedgers();
  const scheduledShared = useCallback(() => void runSharedSync(), [runSharedSync]);
  const sharedWanted = useCallback(
    () => sharedLedgerSync.retry || pendingSharedChangeCount() > 0,
    [],
  );
  const sharedPushSoon = useCallback(
    () =>
      !sharedLedgerSync.isRunning() && !sharedLedgerSync.retry && pendingSharedChangeCount() > 0,
    [],
  );
  useSyncScheduler(
    hasShared && user !== null && status !== 'ready' && status !== 'unavailable',
    scheduledShared,
    sharedWanted,
    { pushSoon: sharedPushSoon },
  );

  // Live updates while signed in: another phone (this user's, or someone in a
  // shared ledger) pushed, so sync that channel now.
  const runSyncRef = useRef(runSync);
  runSyncRef.current = runSync;
  const runSharedSyncRef = useRef(runSharedSync);
  runSharedSyncRef.current = runSharedSync;
  const userId = user?.id ?? null;
  useEffect(() => {
    if (!enabled || !userId) return;
    return startLiveSync({
      getSessionToken: sessionToken,
      onChange: ({ channel, reason, actor }) => {
        if (closingRef.current) return;
        if (reason === 'access' && actor === userId) sharedLedgerSync.noteLeftByUser(channel);
        if (channel === PERSONAL_CHANNEL) {
          // Also how a deletion of the account on another phone is learned:
          // the sync finds the session gone and signs this phone out.
          void runSyncRef.current();
        } else {
          void runSharedSyncRef.current({ forceList: reason === 'access' });
        }
      },
      onReconnect: () => {
        if (closingRef.current) return;
        void runSyncRef.current();
      },
    });
  }, [enabled, sessionToken, userId]);

  const shareLedger = useCallback(
    async (ledger: { id: string; name: string; emoji: string | null }) => {
      const shared = await sharedLedgerSync.share(ledger);
      void trackEvent(AnalyticsEvents.SHARED_LEDGER_CREATED);
      // The personal sync takes the ledger's rows out of the user's own copy.
      void runSync();
      return shared;
    },
    [runSync],
  );

  const stopSharingLedger = useCallback(
    async (ledgerId: string, opts?: { whenUnreachable?: 'fail' | 'local' }) => {
      await sharedLedgerSync.stopSharing(ledgerId, opts);
      void trackEvent(AnalyticsEvents.SHARED_LEDGER_STOPPED);
      reloadAfterApply();
      void runSync();
    },
    [reloadAfterApply, runSync],
  );

  const leaveLedger = useCallback(
    async (ledgerId: string) => {
      await sharedLedgerSync.leave(ledgerId);
      void trackEvent(AnalyticsEvents.SHARED_LEDGER_LEFT);
      reloadAfterApply();
    },
    [reloadAfterApply],
  );

  const joinLedger = useCallback(
    async (code: string) => {
      const ledgerId = await sharedLedgerSync.join(code);
      void trackEvent(AnalyticsEvents.SHARED_LEDGER_JOINED, {
        is_pro: isPro,
      });
      refreshAllRef.current();
      return ledgerId;
    },
    [isPro],
  );

  const refreshSharedLedgers = useCallback(async () => {
    if (!sessionRef.current || closingRef.current) return;
    const removed = await sharedLedgerSync.refreshList(true);
    if (removed > 0) reloadAfterApply();
  }, [reloadAfterApply]);

  const value = useMemo<CloudSyncContextValue>(
    () => ({
      status,
      user,
      isSyncing,
      lastSyncedAt,
      lastError,
      choice,
      linked,
      phoneLimited,
      signInWithNative,
      sendEmailCode,
      verifyEmailCode,
      resolveChoice,
      syncNow,
      signOut,
      deleteAccount,
      shareLedger,
      stopSharingLedger,
      leaveLedger,
      joinLedger,
      getSessionToken: sessionToken,
      refreshSharedLedgers,
    }),
    [
      status,
      user,
      isSyncing,
      lastSyncedAt,
      lastError,
      choice,
      linked,
      phoneLimited,
      signInWithNative,
      sendEmailCode,
      verifyEmailCode,
      resolveChoice,
      syncNow,
      signOut,
      deleteAccount,
      shareLedger,
      stopSharingLedger,
      leaveLedger,
      joinLedger,
      sessionToken,
      refreshSharedLedgers,
    ],
  );

  return <CloudSyncContext.Provider value={value}>{children}</CloudSyncContext.Provider>;
}

function deviceName(): string {
  return Device.modelName ?? Device.deviceName ?? 'Phone';
}

/** Whether this phone has any shared ledger, kept current as the list changes. */
function useHasSharedLedgers(): boolean {
  return React.useSyncExternalStore(subscribeSharedLedgers, () => sharedLedgerSync.hasLedgers());
}

export function useCloudSync(): CloudSyncContextValue {
  const value = useContext(CloudSyncContext);
  if (!value) throw new Error('useCloudSync must be used inside CloudSyncProvider');
  return value;
}
