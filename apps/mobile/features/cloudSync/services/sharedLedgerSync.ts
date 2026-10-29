// Shared ledgers' side of Cloud Sync: one engine per shared ledger, the list
// of them kept in step with the Worker, and the local work when a ledger is
// shared, joined, left or no longer shared. CloudSyncContext drives it.
// See README.md > Cloud Sync > Shared ledgers.

import AsyncStorage from '@react-native-async-storage/async-storage';

import { getSQLite } from '~/lib/db/client';
import { getActiveLedgerId } from '~/lib/db/ledgerScope';

import { CloudSyncApiError, ledgerMediaPath, type SyncCredentials } from './cloudSyncApi';
import {
  deleteLedgerLocally,
  enqueueLedgerRows,
  forgetChannel,
  recordedChannel,
} from './ledgerChannels';
import {
  acceptInvite,
  getLedgerCredentials,
  leaveLedger,
  listSharedLedgers as fetchSharedLedgers,
  previewInvite,
  type RemoteSharedLedger,
  shareLedger,
  stopSharing,
} from './sharedLedgersApi';
import {
  addPendingLedgerAction,
  clearDeferredLedgerDeletes,
  deferLedgerDelete,
  getDeferredLedgerDeletes,
  listPendingLedgerActions,
  listSharedLedgers,
  noteRemovedLedgers,
  removePendingLedgerAction,
  removeSharedLedger,
  saveSharedLedger,
  type SharedLedger,
  sharedLedgerFor,
} from './sharedLedgerStore';
import {
  deleteReplicaFiles,
  dropPersonalOutbox,
  pendingSharedChangeCount,
  runExclusive,
  SyncEngine,
} from './syncEngine';

/**
 * The list is asked for at most this often, unless something calls for it
 * (sign-in, launch, a removal of ledger rows from the user's own copy).
 * Rarely for a phone with no shared ledger, which is nearly every phone.
 */
const LIST_EVERY_MS = 60_000;
const LIST_EVERY_MS_NONE = 15 * 60_000;
/** The last signed-in user, kept across restarts (see `lastUserId`). */
const LAST_USER_KEY = 'm2t.sharedLedgers.lastUserId';
/** A ledger token is reused until it has this long left (they last a day). */
const TOKEN_REFRESH_MARGIN_MS = 6 * 60 * 60 * 1000;

export interface SharedSyncSession {
  userId: string;
  getSessionToken: () => Promise<string>;
  deviceName: string;
  /**
   * Whether the user's own data definitely has no cloud copy to go to (signed
   * in without Pro and never linked). Never true while linking.
   */
  personalInactive: () => boolean;
  /** A ledger's changes reached the cloud: tell the other people's phones. */
  announce?: (shareId: string) => void;
}

/** What a stop or leave does when the Worker cannot be told now. */
type WhenUnreachable = 'fail' | 'local';

export interface SharedSyncOutcome {
  appliedRows: number;
  /** Ledgers removed from this phone (access gone, or no longer shared). */
  removedLedgers: number;
  /** The first failure of the round (offline list read, a ledger's sync, a row), else null. */
  error: unknown;
}

function fromRemote(remote: RemoteSharedLedger): SharedLedger {
  return {
    ledgerId: remote.ledgerId,
    shareId: remote.id,
    role: remote.role,
    name: remote.name,
    ownerName: remote.ownerName,
    memberCount: remote.memberCount,
    active: remote.active,
  };
}

function ledgerExists(ledgerId: string): boolean {
  return !!getSQLite().getFirstSync('SELECT 1 FROM ledgers WHERE id = ?', [ledgerId]);
}

function localLedgerName(ledger: SharedLedger): string {
  const row = getSQLite().getFirstSync<{ name: string | null }>(
    'SELECT name FROM ledgers WHERE id = ?',
    [ledger.ledgerId],
  );
  return row?.name ?? ledger.name ?? '';
}

function isCode(error: unknown, ...codes: string[]): boolean {
  return error instanceof CloudSyncApiError && codes.includes(error.code);
}

/**
 * The Worker cannot be reached or cannot answer for this user any more: no
 * session, an expired session (an account deleted on another phone), or no
 * network.
 */
function isUnreachable(error: unknown): boolean {
  return isCode(error, 'unauthorized', 'network');
}

class SharedLedgerSync {
  private session: SharedSyncSession | null = null;
  /** The last signed-in user, whose replica files a later let-go removes. */
  private lastUserId: string | null = null;
  /** Shares this user left on another phone (live nudge): no notice for them. */
  private leftByUser = new Set<string>();
  private engines = new Map<string, SyncEngine>();
  private credentials = new Map<string, SyncCredentials>();
  /** Engines being opened, so two callers never open one replica twice. */
  private opening = new Map<string, Promise<SyncEngine>>();
  private listedAt = 0;
  private running: Promise<SharedSyncOutcome> | null = null;
  /** The last sync of some ledger failed: retry soon. */
  retry = false;

  constructor() {
    // Read once at launch: a stop or leave done signed out after a restart
    // still belongs to the account that was signed in last.
    void AsyncStorage.getItem(LAST_USER_KEY)
      .then((id) => {
        if (id && !this.lastUserId) this.lastUserId = id;
      })
      .catch(() => undefined);
  }

  /** Signed in (or switched account): engines of an earlier session close. */
  configure(session: SharedSyncSession | null): void {
    if (session?.userId !== this.session?.userId) this.closeAll();
    this.session = session;
    if (session) {
      this.lastUserId = session.userId;
      AsyncStorage.setItem(LAST_USER_KEY, session.userId).catch(() => undefined);
    }
    this.listedAt = 0;
  }

  closeAll(): void {
    for (const engine of this.engines.values()) engine.close();
    this.engines.clear();
    this.credentials.clear();
    this.opening.clear();
  }

  hasLedgers(): boolean {
    return listSharedLedgers().length > 0;
  }

  private requireSession(): SharedSyncSession {
    if (!this.session) throw new CloudSyncApiError('unauthorized', 401);
    return this.session;
  }

  private async token(): Promise<string> {
    return this.requireSession().getSessionToken();
  }

  // -------------------------------------------------------------------------
  // The list

  /**
   * Brings this phone's list in step with the Worker's: new and changed
   * ledgers are recorded, and (unless `letGo` is false) ledgers no longer
   * there are let go. Returns how many joined ledgers left this phone. Throws
   * when the list cannot be read, and then changes nothing. With `letGo`
   * false it may run inside a replica operation (it touches no replica).
   */
  async refreshList(
    force = false,
    opts: { letGo?: boolean; notice?: boolean } = {},
  ): Promise<number> {
    const every = listSharedLedgers().length ? LIST_EVERY_MS : LIST_EVERY_MS_NONE;
    if (!force && Date.now() - this.listedAt < every) return 0;
    const session = this.requireSession();
    const token = await session.getSessionToken();
    const remote = await fetchSharedLedgers(token);
    // Signed out (or into another account) while the list was in flight: it
    // is not this phone's list any more.
    if (this.session !== session) return 0;
    this.listedAt = Date.now();
    // Only this account's (another account's actions wait for its sign-in).
    const pendingActions = (await listPendingLedgerActions()).filter(
      (item) => item.userId === null || item.userId === session.userId,
    );
    const pending = new Map(pendingActions.map((item) => [item.shareId, item.action]));
    const seen = new Set<string>();
    for (const item of remote) {
      const action = pending.get(item.id);
      if (action) {
        // Given up on this phone while the Worker could not be told: tell it now.
        await this.finishPending(token, item.id, action);
        continue;
      }
      const known = sharedLedgerFor(item.ledgerId);
      // A member's ledger id that is already one of this phone's own ledgers
      // is never taken over, nor is one already synced under another share.
      // A copy that never synced as the user's own is not theirs: a backup
      // restored on this phone brought it, and it rejoins the share.
      if (
        item.role === 'member' &&
        !known &&
        ledgerExists(item.ledgerId) &&
        recordedChannel('ledgers', item.ledgerId) !== null
      ) {
        continue;
      }
      if (known && known.shareId !== item.id) continue;
      seen.add(item.ledgerId);
      saveSharedLedger(fromRemote(item));
    }
    // Pending actions the Worker no longer lists are done.
    // This account's actions the Worker no longer lists are done. One of
    // unknown account stays: its list is not this one.
    for (const item of pendingActions) {
      if (item.userId === session.userId && !remote.some((r) => r.id === item.shareId)) {
        await removePendingLedgerAction(item.shareId);
      }
    }
    if (opts.letGo === false || this.session !== session) return 0;
    const gone = listSharedLedgers().filter((local) => !seen.has(local.ledgerId));
    const removed = gone.filter((local) => local.role === 'member');
    // Names first: letting go deletes a member's copy.
    const names = removed.map(localLedgerName);
    for (const local of gone) await this.letGo(local, { requeue: false });
    // No notice for a ledger this user left themselves (on another phone).
    const ownDoing = this.leftByUser;
    this.leftByUser = new Set();
    // At sign-in a ledger let go may be another account's (signed in before):
    // nothing to tell this user about.
    if (opts.notice !== false) {
      noteRemovedLedgers(
        names.filter((name, index) => name && !ownDoing.has(removed[index].shareId)),
      );
    }
    return removed.length;
  }

  private async finishPending(
    token: string,
    shareId: string,
    action: 'stop' | 'leave',
  ): Promise<void> {
    try {
      if (action === 'stop') await stopSharing(token, shareId);
      else await leaveLedger(token, shareId);
      await removePendingLedgerAction(shareId);
    } catch (error) {
      if (isCode(error, 'not_found')) await removePendingLedgerAction(shareId);
      // Otherwise kept for the next list read.
    }
  }

  /**
   * A ledger this phone no longer syncs as shared. The owner keeps it as one
   * of their own ledgers; a member's copy is deleted from the phone. Only the
   * phone that stopped sharing (`requeue`) puts the ledger back into the
   * owner's cloud copy: the owner's other phones then take that copy (their
   * rows have no personal revision), rather than sending their own older one.
   */
  private letGo(ledger: SharedLedger, opts: { requeue: boolean }): Promise<void> {
    // Between replica operations: never under an engine mid-sync.
    return runExclusive(() => {
      this.closeEngine(ledger.shareId);
      removeSharedLedger(ledger.ledgerId);
      forgetChannel(ledger.shareId);
      if (ledger.role !== 'owner') {
        // The open ledger waits for the user to be back on the main screens
        // (LedgerProGuard), so no editor loses its ledger under it.
        if (ledger.ledgerId === getActiveLedgerId()) deferLedgerDelete(ledger.ledgerId);
        else deleteLedgerLocally(ledger.ledgerId);
      } else if (opts.requeue) enqueueLedgerRows(ledger.ledgerId);
      const userId = this.session?.userId ?? this.lastUserId;
      if (userId) deleteReplicaFiles(userId, ledger.shareId);
    });
  }

  private closeEngine(shareId: string): void {
    this.engines.get(shareId)?.close();
    this.engines.delete(shareId);
    this.credentials.delete(shareId);
  }

  // -------------------------------------------------------------------------
  // Syncing

  private async credentialsFor(shareId: string): Promise<SyncCredentials> {
    const current = this.credentials.get(shareId);
    if (current && current.expiresAt - Date.now() > TOKEN_REFRESH_MARGIN_MS) return current;
    const next = await getLedgerCredentials(await this.token(), shareId);
    this.credentials.set(shareId, next);
    return next;
  }

  private engineFor(ledger: SharedLedger): Promise<SyncEngine> {
    const existing = this.engines.get(ledger.shareId);
    if (existing) return Promise.resolve(existing);
    let opening = this.opening.get(ledger.shareId);
    if (!opening) {
      opening = this.openEngine(ledger).finally(() => this.opening.delete(ledger.shareId));
      this.opening.set(ledger.shareId, opening);
    }
    return opening;
  }

  /** `final`: a paused ledger's last download (see `stopSharing`), never kept. */
  private async openEngine(ledger: SharedLedger, final = false): Promise<SyncEngine> {
    const session = this.requireSession();
    const finalCredentials = final
      ? await getLedgerCredentials(await this.token(), ledger.shareId, { final: true })
      : null;
    const credentials = finalCredentials ?? (await this.credentialsFor(ledger.shareId));
    const engine = new SyncEngine({
      userId: session.userId,
      channel: ledger.shareId,
      ledgerId: ledger.ledgerId,
      url: credentials.url,
      getTursoToken: async () =>
        (finalCredentials ?? (await this.credentialsFor(ledger.shareId))).authToken,
      getSessionToken: session.getSessionToken,
      mediaPath: ledgerMediaPath(ledger.shareId),
      deviceName: session.deviceName,
    });
    await engine.open();
    if (this.session !== session) {
      engine.close();
      throw new Error('signed_out');
    }
    if (!final) this.engines.set(ledger.shareId, engine);
    return engine;
  }

  /** Syncs every shared ledger that is active. Concurrent calls share one run. */
  syncAll(opts: { forceList?: boolean } = {}): Promise<SharedSyncOutcome> {
    if (this.running) return this.running;
    this.running = this.runAll(opts.forceList ?? false).finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async runAll(forceList: boolean): Promise<SharedSyncOutcome> {
    const outcome: SharedSyncOutcome = { appliedRows: 0, removedLedgers: 0, error: null };
    const session = this.session;
    if (!session) return outcome;
    try {
      outcome.removedLedgers += await this.refreshList(forceList);
    } catch (error) {
      // A rejected session (account deleted elsewhere) signs the phone out.
      if (isCode(error, 'unauthorized')) {
        this.retry = false;
        throw error;
      }
      // Offline: sync what this phone knows of. With nothing shared yet,
      // there is no ledger to show failing.
      if (listSharedLedgers().length) outcome.error = error;
    }
    if (this.session === session && session.personalInactive()) {
      await runExclusive(() => getSQLite().withTransactionSync(dropPersonalOutbox));
    }
    for (const ledger of listSharedLedgers()) {
      if (!ledger.active) {
        this.closeEngine(ledger.shareId);
        continue;
      }
      try {
        const engine = await this.engineFor(ledger);
        const result = await engine.syncNow();
        outcome.appliedRows += result.appliedRows;
        outcome.error ??= result.applyError;
        if (result.pushed) session.announce?.(ledger.shareId);
      } catch (error) {
        // A token may have been revoked (a member was removed): ask again.
        this.credentials.delete(ledger.shareId);
        // Paused or gone is the ledger's new state, not a failure to show.
        if (isCode(error, 'ledger_paused')) {
          this.closeEngine(ledger.shareId);
          saveSharedLedger({ ...ledger, active: false });
        } else if (isCode(error, 'not_found')) {
          // Removed from it, or it is no longer shared: the list says which.
          outcome.removedLedgers += await this.refreshList(true).catch((listError: unknown) => {
            outcome.error ??= listError;
            return 0;
          });
        } else if (isCode(error, 'unauthorized')) {
          this.retry = false;
          throw error;
        } else {
          outcome.error ??= error;
        }
      }
    }
    this.retry = outcome.error !== null;
    return outcome;
  }

  /** A live nudge says this user left `shareId` themselves, on another phone. */
  noteLeftByUser(shareId: string): void {
    this.leftByUser.add(shareId);
  }

  /** Whether a round of shared syncs is in flight. */
  isRunning(): boolean {
    return this.running !== null;
  }

  /** Resolves when every engine has finished its work in flight. */
  async waitIdle(): Promise<void> {
    await this.running?.catch(() => undefined);
    for (const engine of this.engines.values()) await engine.waitIdle();
  }

  // -------------------------------------------------------------------------
  // Actions

  /** Shares one of the user's ledgers. Its rows move to the new database on the next sync. */
  async share(ledger: { id: string; name: string; emoji: string | null }): Promise<SharedLedger> {
    const remote = await shareLedger(await this.token(), {
      ledgerId: ledger.id,
      name: ledger.name,
      emoji: ledger.emoji,
    });
    const shared = fromRemote(remote);
    // Its rows route to the new channel now; its first sync uploads them.
    saveSharedLedger(shared);
    await this.syncAll().catch(() => undefined);
    return shared;
  }

  /**
   * Owner: everyone else loses the ledger, and its cloud database is deleted.
   * With `whenUnreachable: 'local'` (deleting the ledger) it also works
   * signed out, after the account was deleted elsewhere, or offline: the
   * ledger is let go here and the Worker is told after the next sign-in.
   */
  async stopSharing(
    ledgerId: string,
    opts: { whenUnreachable?: WhenUnreachable } = {},
  ): Promise<void> {
    const ledger = sharedLedgerFor(ledgerId);
    if (!ledger || ledger.role !== 'owner') return;
    const local = opts.whenUnreachable === 'local';
    // Members' latest entries first: the ledger's database is about to go.
    // A paused ledger takes them with a read-only token (nothing can go up).
    if (this.session) {
      try {
        if (ledger.active) await (await this.engineFor(ledger)).syncNow();
        else await this.takeFinalCopy(ledger);
      } catch (error) {
        // Gone on the Worker (or a Worker that refuses a paused ledger's last
        // download): nothing more to fetch from it.
        if (!local && !isCode(error, 'not_found', 'ledger_paused')) throw error;
      }
    }
    try {
      await stopSharing(await this.token(), ledger.shareId);
    } catch (error) {
      // Already gone on the Worker: finish the local half.
      if (!isCode(error, 'not_found')) {
        if (!local || !isUnreachable(error)) throw error;
        await addPendingLedgerAction({
          shareId: ledger.shareId,
          action: 'stop',
          userId: this.lastUserId,
        });
      }
    }
    await this.letGo(ledger, { requeue: true });
  }

  private async takeFinalCopy(ledger: SharedLedger): Promise<void> {
    const engine = await this.openEngine(ledger, true);
    try {
      await engine.pullAndApply();
    } finally {
      engine.close();
    }
  }

  /**
   * Member: leaves, and this phone's copy of the ledger goes. Entries not sent
   * yet go up first: when they cannot (offline), it refuses rather than lose
   * them. Otherwise, signed out or offline, it still leaves here and tells
   * the Worker after the next sign-in. A paused ledger's unsent entries could
   * never reach anyone, so they do not hold it.
   */
  async leave(ledgerId: string): Promise<void> {
    const ledger = sharedLedgerFor(ledgerId);
    if (!ledger || ledger.role !== 'member') return;
    if (ledger.active && pendingSharedChangeCount([ledgerId]) > 0) {
      const sent =
        !!this.session &&
        (await this.engineFor(ledger)
          .then((engine) => engine.syncNow())
          .then(
            () => true,
            () => false,
          ));
      if (!sent) throw new CloudSyncApiError('unsent_changes', 0);
    }
    try {
      await leaveLedger(await this.token(), ledger.shareId);
    } catch (error) {
      if (!isCode(error, 'not_found')) {
        if (!isUnreachable(error)) throw error;
        await addPendingLedgerAction({
          shareId: ledger.shareId,
          action: 'leave',
          userId: this.lastUserId,
        });
      }
    }
    await this.letGo(ledger, { requeue: false });
  }

  /** Joins with an invite code and downloads the ledger. Returns its id. */
  async join(code: string): Promise<string> {
    // Before taking a seat: a ledger whose id is already one of this phone's
    // own ledgers (or another share's) is never written into.
    const preview = await previewInvite(code);
    if (preview.ledgerId) this.assertJoinable(preview.ledgerId, null);
    const remote = await acceptInvite(await this.token(), code);
    this.assertJoinable(remote.ledgerId, remote.id);
    // Joined again after leaving offline: the queued leave no longer applies.
    await removePendingLedgerAction(remote.id);
    const shared = fromRemote(remote);
    saveSharedLedger(shared);
    try {
      await (await this.engineFor(shared)).syncNow();
    } catch (error) {
      // Joined, but nothing has come down yet. The screen says so and Join
      // again retries (the Worker answers a member with the same share).
      this.retry = true;
      throw error;
    }
    return shared.ledgerId;
  }

  private assertJoinable(ledgerId: string, shareId: string | null): void {
    const known = sharedLedgerFor(ledgerId);
    const conflict = known
      ? shareId !== null && known.shareId !== shareId
      : ledgerExists(ledgerId) && !getDeferredLedgerDeletes().includes(ledgerId);
    if (conflict) throw new CloudSyncApiError('own_ledger', 409);
  }

  /**
   * Deletes joined ledgers whose sharing ended while open (see `letGo`),
   * except the one still open. Run by LedgerProGuard on the main screens.
   */
  async finishDeferredDeletes(): Promise<boolean> {
    const open = getActiveLedgerId();
    const due = getDeferredLedgerDeletes().filter((id) => id !== open);
    if (!due.length) return false;
    await runExclusive(() => {
      // Joined again meanwhile: it is a shared ledger again, keep it.
      const gone = due.filter((id) => !sharedLedgerFor(id));
      for (const id of gone) deleteLedgerLocally(id);
    });
    clearDeferredLedgerDeletes(due);
    return true;
  }

  /**
   * Sign-out and account deletion: members' copies go (they are other
   * people's data), owners keep theirs as their own ledgers.
   */
  forgetAll(userId: string | undefined): void {
    this.closeAll();
    for (const ledger of listSharedLedgers()) {
      removeSharedLedger(ledger.ledgerId);
      forgetChannel(ledger.shareId);
      if (ledger.role === 'member') deleteLedgerLocally(ledger.ledgerId);
      if (userId) deleteReplicaFiles(userId, ledger.shareId);
    }
    this.session = null;
    this.listedAt = 0;
  }
}

export const sharedLedgerSync = new SharedLedgerSync();
