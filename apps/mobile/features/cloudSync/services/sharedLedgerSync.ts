// Shared ledgers' side of Cloud Sync: one engine per shared ledger, the list
// of them kept in step with the Worker, and the local work when a ledger is
// shared, joined, left or no longer shared. CloudSyncContext drives it.
// See README.md > Cloud Sync > Shared ledgers.

import { getSQLite } from '~/lib/db/client';

import { CloudSyncApiError, ledgerMediaPath, type SyncCredentials } from './cloudSyncApi';
import { deleteLedgerLocally, enqueueLedgerRows, forgetChannel } from './ledgerChannels';
import {
  acceptInvite,
  getLedgerCredentials,
  leaveLedger,
  listSharedLedgers as fetchSharedLedgers,
  type RemoteSharedLedger,
  shareLedger,
  stopSharing,
} from './sharedLedgersApi';
import {
  listSharedLedgers,
  removeSharedLedger,
  saveSharedLedger,
  type SharedLedger,
  sharedLedgerFor,
} from './sharedLedgerStore';
import { deleteReplicaFiles, dropPersonalOutbox, runExclusive, SyncEngine } from './syncEngine';

/**
 * The list is asked for at most this often, unless something calls for it
 * (sign-in, launch, a removal of ledger rows from the user's own copy).
 * Rarely for a phone with no shared ledger, which is nearly every phone.
 */
const LIST_EVERY_MS = 60_000;
const LIST_EVERY_MS_NONE = 15 * 60_000;
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
}

export interface SharedSyncOutcome {
  appliedRows: number;
  /** Ledgers removed from this phone (access gone, or no longer shared). */
  removedLedgers: number;
  failed: boolean;
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

class SharedLedgerSync {
  private session: SharedSyncSession | null = null;
  private engines = new Map<string, SyncEngine>();
  private credentials = new Map<string, SyncCredentials>();
  /** Engines being opened, so two callers never open one replica twice. */
  private opening = new Map<string, Promise<SyncEngine>>();
  private listedAt = 0;
  private running: Promise<SharedSyncOutcome> | null = null;
  /** The last sync of some ledger failed: retry soon. */
  retry = false;

  /** Signed in (or switched account): engines of an earlier session close. */
  configure(session: SharedSyncSession | null): void {
    if (session?.userId !== this.session?.userId) this.closeAll();
    this.session = session;
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
  async refreshList(force = false, opts: { letGo?: boolean } = {}): Promise<number> {
    const every = listSharedLedgers().length ? LIST_EVERY_MS : LIST_EVERY_MS_NONE;
    if (!force && Date.now() - this.listedAt < every) return 0;
    const remote = await fetchSharedLedgers(await this.token());
    this.listedAt = Date.now();
    const seen = new Set<string>();
    for (const item of remote) {
      const known = sharedLedgerFor(item.ledgerId);
      // A member's ledger id that is already one of this phone's own ledgers
      // is never taken over, nor is one already synced under another share.
      if (item.role === 'member' && !known && ledgerExists(item.ledgerId)) continue;
      if (known && known.shareId !== item.id) continue;
      seen.add(item.ledgerId);
      saveSharedLedger(fromRemote(item));
    }
    if (opts.letGo === false) return 0;
    const gone = listSharedLedgers().filter((local) => !seen.has(local.ledgerId));
    for (const local of gone) await this.letGo(local, { requeue: false });
    return gone.filter((local) => local.role === 'member').length;
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
      if (ledger.role !== 'owner') deleteLedgerLocally(ledger.ledgerId);
      else if (opts.requeue) enqueueLedgerRows(ledger.ledgerId);
      if (this.session) deleteReplicaFiles(this.session.userId, ledger.shareId);
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

  private async openEngine(ledger: SharedLedger): Promise<SyncEngine> {
    const session = this.requireSession();
    const credentials = await this.credentialsFor(ledger.shareId);
    const engine = new SyncEngine({
      userId: session.userId,
      channel: ledger.shareId,
      ledgerId: ledger.ledgerId,
      url: credentials.url,
      getTursoToken: async () => (await this.credentialsFor(ledger.shareId)).authToken,
      getSessionToken: session.getSessionToken,
      mediaPath: ledgerMediaPath(ledger.shareId),
      deviceName: session.deviceName,
    });
    await engine.open();
    if (this.session !== session) {
      engine.close();
      throw new Error('signed_out');
    }
    this.engines.set(ledger.shareId, engine);
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
    const outcome: SharedSyncOutcome = { appliedRows: 0, removedLedgers: 0, failed: false };
    const session = this.session;
    if (!session) return outcome;
    try {
      outcome.removedLedgers += await this.refreshList(forceList);
    } catch {
      // Offline or signed out: sync what this phone knows of.
      outcome.failed = true;
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
        outcome.appliedRows += (await engine.syncNow()).appliedRows;
      } catch (error) {
        outcome.failed = true;
        // A token may have been revoked (a member was removed): ask again.
        this.credentials.delete(ledger.shareId);
        if (error instanceof CloudSyncApiError && error.code === 'owner_not_pro') {
          this.closeEngine(ledger.shareId);
          saveSharedLedger({ ...ledger, active: false });
        } else if (error instanceof CloudSyncApiError && error.code === 'not_found') {
          // Removed from it, or it is no longer shared: the list says which.
          outcome.removedLedgers += await this.refreshList(true).catch(() => 0);
        } else if (error instanceof CloudSyncApiError && error.code === 'unauthorized') {
          this.retry = false;
          throw error;
        }
      }
    }
    this.retry = outcome.failed;
    return outcome;
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

  /** Owner: everyone else loses the ledger, and its cloud database is deleted. */
  async stopSharing(ledgerId: string): Promise<void> {
    const ledger = sharedLedgerFor(ledgerId);
    if (!ledger || ledger.role !== 'owner') return;
    // Members' latest entries first: the ledger's database is about to go.
    if (ledger.active) await (await this.engineFor(ledger)).syncNow();
    await stopSharing(await this.token(), ledger.shareId).catch((error: unknown) => {
      // Already gone on the Worker: finish the local half.
      if (!(error instanceof CloudSyncApiError && error.code === 'not_found')) throw error;
    });
    await this.letGo(ledger, { requeue: true });
  }

  /** Member: leaves, and this phone's copy of the ledger goes. */
  async leave(ledgerId: string): Promise<void> {
    const ledger = sharedLedgerFor(ledgerId);
    if (!ledger || ledger.role !== 'member') return;
    await leaveLedger(await this.token(), ledger.shareId).catch((error: unknown) => {
      if (!(error instanceof CloudSyncApiError && error.code === 'not_found')) throw error;
    });
    await this.letGo(ledger, { requeue: false });
  }

  /** Joins with an invite code and downloads the ledger. Returns its id. */
  async join(code: string): Promise<string> {
    const remote = await acceptInvite(await this.token(), code);
    const known = sharedLedgerFor(remote.ledgerId);
    if (known ? known.shareId !== remote.id : ledgerExists(remote.ledgerId)) {
      // Its id is one of this phone's own ledgers, or another share's: never
      // write into that.
      throw new CloudSyncApiError('own_ledger', 409);
    }
    const shared = fromRemote(remote);
    saveSharedLedger(shared);
    try {
      await (await this.engineFor(shared)).syncNow();
    } catch {
      // Joined all the same (the invite is used up): it downloads on a later sync.
      this.retry = true;
    }
    return shared.ledgerId;
  }

  /**
   * Sign-out and account deletion: members' copies go (they are other
   * people's data), owners keep theirs as their own ledgers.
   */
  forgetAll(): void {
    const userId = this.session?.userId;
    this.closeAll();
    for (const ledger of listSharedLedgers()) {
      removeSharedLedger(ledger.ledgerId);
      forgetChannel(ledger.shareId);
      if (ledger.role === 'member') deleteLedgerLocally(ledger.ledgerId);
      if (userId) deleteReplicaFiles(userId, ledger.shareId);
    }
    this.session = null;
  }
}

export const sharedLedgerSync = new SharedLedgerSync();
