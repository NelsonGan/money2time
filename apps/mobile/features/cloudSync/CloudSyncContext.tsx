// Cloud Sync state for the app: who is signed in, whether this phone's data
// and the cloud copy are linked, and when syncs run. See README.md > Cloud Sync.
//
// Linking happens once per sign-in on a phone (lib/linking.ts decides how).
// Once linked, syncs run on the schedule in hooks/useSyncScheduler.ts.
// Shared ledgers (services/sharedLedgerSync.ts) sync on the same schedule,
// and also for a signed-in user who is not Pro (a member).

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

import { useApp } from '~/context/AppContext';
import { usePro } from '~/context/ProContext';
import { DEFAULT_LEDGER_ID, getActiveLedgerId } from '~/lib/db/ledgerScope';
import { ledgersRepository } from '~/lib/repositories/ledgersRepository';
import { AnalyticsEvents, trackEvent } from '~/services/analytics';
import { runAutoBackupIfDue } from '~/services/autoBackup';
import { reportError } from '~/services/errorReporting';
import { FEATURE_FLAGS, useFeatureFlag } from '~/services/featureFlags';
import { runUserAssetGc } from '~/services/userAssetGc';

import { useSyncScheduler } from './hooks/useSyncScheduler';
import { PERSONAL_CHANNEL } from './lib/ledgerRows';
import { decideLink } from './lib/linking';
import {
  CloudSyncApiError,
  type CloudUser,
  deleteAccount as apiDeleteAccount,
  getSyncCredentials,
  PERSONAL_MEDIA_PATH,
  sendAppleAuthorization,
  sendEmailCode as apiSendEmailCode,
  signInWithEmailCode,
  signInWithIdToken,
  signOutSession,
  type SyncCredentials,
} from './services/cloudSyncApi';
import {
  clearSession,
  loadSession,
  saveSession,
  type StoredSession,
} from './services/cloudSyncSession';
import { NATIVE_PROVIDERS, type NativeProvider } from './services/nativeSignIn';
import { type SharedLedger, subscribeSharedLedgers } from './services/sharedLedgerStore';
import { sharedLedgerSync } from './services/sharedLedgerSync';
import {
  type DataSummary,
  deleteReplicaFiles,
  disableCapture,
  enableCapture,
  isCloudSyncAvailable,
  pendingChangeCount,
  resetLocalSyncState,
  runExclusive,
  summarizeLocal,
  SyncEngine,
} from './services/syncEngine';

const TOKEN_REFRESH_MARGIN_MS = 24 * 60 * 60 * 1000;

export type CloudSyncStatus =
  /** Feature flag off, or a build without the native sync module. */
  | 'unavailable'
  | 'loading'
  | 'signedOut'
  /** Signed in; bringing this phone and the cloud copy together (retried while offline). */
  | 'linking'
  /** Both have data: waiting for the user to pick one. */
  | 'needsChoice'
  | 'ready'
  /** Signed in, but the account is not Pro: nothing syncs. */
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
  signInWithNative: (provider: NativeProvider) => Promise<'ok' | 'cancelled'>;
  sendEmailCode: (email: string) => Promise<void>;
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
  /** Owner: stop sharing; members lose the ledger and its cloud database goes. */
  stopSharingLedger: (ledgerId: string) => Promise<void>;
  /** Member: leave; this phone's copy goes. */
  leaveLedger: (ledgerId: string) => Promise<void>;
  /** Joins with an invite code; returns the ledger's id, now on this phone. */
  joinLedger: (code: string) => Promise<string>;
  /** The Worker session token, for the shared-ledger screens' own calls. */
  getSessionToken: () => Promise<string>;
}

const CloudSyncContext = createContext<CloudSyncContextValue | null>(null);

export function useCloudSyncEnabled(): boolean {
  const flag = useFeatureFlag(FEATURE_FLAGS.cloudSync, { sendEvent: false });
  // Flags never load in development builds, so the feature is on there.
  return (__DEV__ || flag === true) && isCloudSyncAvailable();
}

function isNotPro(error: unknown): boolean {
  return error instanceof CloudSyncApiError && error.code === 'not_pro';
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
  const { isPro, isStatusKnown } = usePro();
  const appUserId = settings?.appUserId ?? null;

  const [status, setStatus] = useState<CloudSyncStatus>(enabled ? 'loading' : 'unavailable');
  const statusRef = useRef(status);
  statusRef.current = status;
  const [user, setUser] = useState<CloudUser | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [lastError, setLastError] = useState<CloudSyncErrorKind | null>(null);
  const [choice, setChoice] = useState<CloudSyncChoice | null>(null);

  const sessionRef = useRef<StoredSession | null>(null);
  const engineRef = useRef<SyncEngine | null>(null);
  /** The engine being opened, so concurrent callers share it. */
  const openingRef = useRef<Promise<SyncEngine> | null>(null);
  const credentialsRef = useRef<SyncCredentials | null>(null);
  /** Bumped on every sign-out: work started before it is discarded. */
  const generationRef = useRef(0);
  /** The last sync failed; its changes may already be in the replica, so retry soon. */
  const retryRef = useRef(false);
  /** A failure streak is reported once, not on every retry. */
  const reportedRef = useRef(false);
  const linkingRef = useRef(false);
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
   * lets go of shared ledgers (a member's copies are deleted); an expired
   * session keeps them for the next sign-in.
   */
  const forgetSession = useCallback(
    async (opts: { deleteReplica: boolean }) => {
      generationRef.current += 1;
      const userId = sessionRef.current?.user.id;
      sessionRef.current = null;
      // Between replica operations, so no engine is closed mid-sync.
      await runExclusive(() => {
        if (opts.deleteReplica) sharedLedgerSync.forgetAll();
        bindShared(null);
        closeEngine();
        resetLocalSyncState();
        if (opts.deleteReplica && userId) deleteReplicaFiles(userId);
      });
      retryRef.current = false;
      reportedRef.current = false;
      await clearSession();
      setUser(null);
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
    if (openingRef.current) return openingRef.current;
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
      openingRef.current = null;
    });
    openingRef.current = opening;
    return opening;
  }, [closeEngine, fetchCredentials, sessionToken]);

  /** Syncs the shared ledgers; failures are retried on the next tick, not shown. */
  const runSharedSync = useCallback(
    async (opts: { forceList?: boolean } = {}) => {
      if (!sessionRef.current) return;
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

  const runSync = useCallback(async () => {
    if (!sessionRef.current?.linked) {
      await runSharedSync();
      return;
    }
    const generation = generationRef.current;
    setIsSyncing(true);
    try {
      // Which ledgers are shared decides where rows go, so learn of a ledger
      // shared from another phone before its rows leave the user's own copy.
      const removed = await sharedLedgerSync.refreshList().catch(() => 0);
      if (removed > 0) reloadAfterApply();
      const engine = await openEngine();
      const outcome = await engine.syncNow();
      if (generation !== generationRef.current) return;
      retryRef.current = false;
      reportedRef.current = false;
      setStatus('ready');
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
  }, [handleError, openEngine, reloadAfterApply, runSharedSync]);

  const markLinked = useCallback(async (mode: LinkMode) => {
    const session = sessionRef.current;
    if (!session) return;
    const next = { ...session, linked: true };
    sessionRef.current = next;
    await saveSession(next);
    setChoice(null);
    setLastError(null);
    setStatus('ready');
    setLastSyncedAt(Date.now());
    void trackEvent(AnalyticsEvents.CLOUD_SYNC_ENABLED, { mode });
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
  }, [adoptCloudCopy, closeEngine, forgetSession, markLinked, openEngine, report]);

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
      // A fresh sign-in always links again, whoever was here before.
      resetLocalSyncState();
      const session: StoredSession = { token, user: signedIn, linked: false };
      sessionRef.current = session;
      bindShared(session);
      await saveSession(session);
      setUser(signedIn);
      setLastError(null);
      void trackEvent(AnalyticsEvents.CLOUD_SYNC_SIGNED_IN, { method });
      // Which ledgers are shared decides what linking compares and replaces.
      await sharedLedgerSync.refreshList(true, { letGo: false }).catch(() => 0);
      await link();
      // Shared ledgers this account already belongs to come down too.
      void runSharedSync({ forceList: true });
    },
    [bindShared, link, runSharedSync],
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

  const sendEmailCode = useCallback(async (email: string) => {
    await apiSendEmailCode(email.trim().toLowerCase());
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
    // Pro may have been restored since the last answer.
    if (status === 'notPro') credentialsRef.current = null;
    if (session.linked) await runSync();
    else await link();
  }, [link, runSync, status]);

  const signOut = useCallback(async () => {
    const wasLinked = sessionRef.current?.linked ?? false;
    // Let work in flight finish, then push what is waiting, before the
    // replica is closed and deleted.
    const engine = engineRef.current;
    if (engine) {
      await engine.waitIdle();
      if (pendingChangeCount() > 0) await engine.syncNow().catch(() => undefined);
    }
    await sharedLedgerSync.waitIdle();
    if (pendingChangeCount() > 0) await sharedLedgerSync.syncAll().catch(() => undefined);
    const token = sessionRef.current?.token;
    if (token) void signOutSession(token).catch(() => undefined);
    await forgetSession({ deleteReplica: true });
    if (wasLinked) void trackEvent(AnalyticsEvents.CLOUD_SYNC_SIGNED_OUT);
  }, [forgetSession]);

  const deleteAccount = useCallback(async () => {
    const token = await sessionToken();
    await engineRef.current?.waitIdle();
    await sharedLedgerSync.waitIdle();
    await apiDeleteAccount(token);
    await forgetSession({ deleteReplica: true });
    void trackEvent(AnalyticsEvents.CLOUD_SYNC_ACCOUNT_DELETED);
  }, [forgetSession, sessionToken]);

  // Restore the session at launch; stop capturing changes when the feature is off.
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
      const session = await loadSession();
      if (cancelled) return;
      sessionRef.current = session;
      bindShared(session);
      if (!session) {
        setStatus('signedOut');
        return;
      }
      setUser(session.user);
      // Not linked: the app closed during linking, so start it again.
      if (!session.linked) {
        await sharedLedgerSync.refreshList(true, { letGo: false }).catch(() => 0);
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
    if (!isPro) closeEngine();
    void syncNow();
    // A shared ledger of this user's resumes (or pauses) with it.
    void runSharedSync({ forceList: true });
    // Only a change of Pro matters here, not every new callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPro, isStatusKnown]);

  const scheduledSync = useCallback(() => void runSync(), [runSync]);
  const syncWanted = useCallback(() => retryRef.current || pendingChangeCount() > 0, []);
  useSyncScheduler(status === 'ready', scheduledSync, syncWanted);

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
  const sharedWanted = useCallback(() => sharedLedgerSync.retry || pendingChangeCount() > 0, []);
  useSyncScheduler(
    hasShared && user !== null && status !== 'ready' && status !== 'unavailable',
    scheduledShared,
    sharedWanted,
  );

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
    async (ledgerId: string) => {
      await sharedLedgerSync.stopSharing(ledgerId);
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

  const value = useMemo<CloudSyncContextValue>(
    () => ({
      status,
      user,
      isSyncing,
      lastSyncedAt,
      lastError,
      choice,
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
    }),
    [
      status,
      user,
      isSyncing,
      lastSyncedAt,
      lastError,
      choice,
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
