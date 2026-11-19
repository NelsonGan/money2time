import { and, eq, inArray, isNull, sql } from 'drizzle-orm';

import { getDb, getSQLite } from '~/lib/db/client';
import { getActiveLedgerId, inActiveLedger } from '~/lib/db/ledgerScope';
import { albumsTable, albumTransactionsTable } from '~/lib/db/schema';
import type { Album } from '~/types';
import { newId, nowIso } from '~/utils/id';

import { toAlbum } from './mappers';

interface CreateAlbumInput {
  name: string;
  coverPhotoUri?: string | null;
  icon?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  placeId?: string | null;
  placeName?: string | null;
  placeAdmin?: string | null;
  countryCode?: string | null;
  sortOrder?: number;
  deletedAt?: string | null;
}

class AlbumsRepository {
  list(): Album[] {
    const db = getDb();
    return db
      .select()
      .from(albumsTable)
      .where(and(isNull(albumsTable.deletedAt), inActiveLedger(albumsTable)))
      .orderBy(albumsTable.sortOrder, albumsTable.name)
      .all()
      .map(toAlbum);
  }

  getById(id: string): Album | null {
    const db = getDb();
    const row = db
      .select()
      .from(albumsTable)
      .where(
        and(eq(albumsTable.id, id), isNull(albumsTable.deletedAt), inActiveLedger(albumsTable)),
      )
      .get();
    return row ? toAlbum(row) : null;
  }

  create(input: CreateAlbumInput): string {
    const db = getDb();
    const id = newId();
    const now = nowIso();
    // New albums sort to the top of the list, so use one below the current
    // minimum sortOrder (the list is ordered ascending).
    const minSort = db
      .select({ minSort: sql<number>`coalesce(min(${albumsTable.sortOrder}), 0)` })
      .from(albumsTable)
      .where(and(isNull(albumsTable.deletedAt), inActiveLedger(albumsTable)))
      .get();
    const nextSortOrder = input.sortOrder ?? (minSort?.minSort ?? 0) - 1;

    db.insert(albumsTable)
      .values({
        id,
        ledgerId: getActiveLedgerId(),
        name: input.name,
        coverPhotoUri: input.coverPhotoUri ?? null,
        icon: input.icon ?? null,
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        placeId: input.placeId ?? null,
        placeName: input.placeName ?? null,
        placeAdmin: input.placeAdmin ?? null,
        countryCode: input.countryCode ?? null,
        sortOrder: nextSortOrder,
        createdAt: now,
        updatedAt: now,
        deletedAt: input.deletedAt ?? null,
      })
      .run();

    return id;
  }

  update(id: string, input: Partial<CreateAlbumInput>) {
    const db = getDb();
    // A cleared icon is kept as '' (none, but one the user removed, which
    // migration 096's flag backfill leaves), as `create` keeps it.
    db.update(albumsTable)
      .set({ ...input, updatedAt: nowIso() })
      .where(and(eq(albumsTable.id, id), isNull(albumsTable.deletedAt)))
      .run();
  }

  reorder(ids: string[]) {
    if (ids.length === 0) return;

    const sqlite = getSQLite();
    const db = getDb();
    const now = nowIso();

    sqlite.execSync('BEGIN');
    try {
      ids.forEach((id, index) => {
        db.update(albumsTable)
          .set({ sortOrder: index, updatedAt: now })
          .where(and(eq(albumsTable.id, id), isNull(albumsTable.deletedAt)))
          .run();
      });
      sqlite.execSync('COMMIT');
    } catch (error) {
      sqlite.execSync('ROLLBACK');
      throw error;
    }
  }

  /** Marks one album active (clearing any other), or clears all when id is null. */
  setActive(id: string | null) {
    const db = getDb();
    const now = nowIso();
    db.update(albumsTable)
      .set({ isActive: false, updatedAt: now })
      .where(
        and(
          eq(albumsTable.isActive, true),
          isNull(albumsTable.deletedAt),
          inActiveLedger(albumsTable),
        ),
      )
      .run();
    if (id) {
      // An archived album takes no new entries.
      db.update(albumsTable)
        .set({ isActive: true, updatedAt: now })
        .where(
          and(
            eq(albumsTable.id, id),
            isNull(albumsTable.deletedAt),
            isNull(albumsTable.archivedAt),
          ),
        )
        .run();
    }
  }

  /**
   * Archives an album (out of the Albums page's list, still a line in the
   * category lists; never the active album) or brings it back. A shared
   * album the user is no longer in stays archived (`shareEndedAt`).
   */
  setArchived(id: string, archived: boolean) {
    const now = nowIso();
    getDb()
      .update(albumsTable)
      .set(
        archived
          ? { archivedAt: now, isActive: false, updatedAt: now }
          : { archivedAt: null, updatedAt: now },
      )
      .where(
        and(
          eq(albumsTable.id, id),
          isNull(albumsTable.deletedAt),
          ...(archived ? [] : [isNull(albumsTable.shareEndedAt)]),
        ),
      )
      .run();
  }

  /** Whether an album is a shared album the user is no longer in: read-only. */
  isFrozen(id: string): boolean {
    const row = getSQLite().getFirstSync<{ ended: string | null }>(
      'SELECT share_ended_at AS ended FROM albums WHERE id = ?',
      [id],
    );
    return !!row?.ended;
  }

  getActiveId(): string | null {
    const db = getDb();
    const row = db
      .select({ id: albumsTable.id })
      .from(albumsTable)
      .where(
        and(
          eq(albumsTable.isActive, true),
          isNull(albumsTable.deletedAt),
          inActiveLedger(albumsTable),
        ),
      )
      .get();
    return row?.id ?? null;
  }

  /**
   * Deletes an album: its entries stay, back under their own categories. A
   * shared album is let go first (left, or ended by its owner; README: Album
   * members and shared albums > Deleting), so here it is one the user is no
   * longer in, deleted like any other. Its links are stamped with the
   * album's own time, which is how joining it again brings them back
   * (`ensureLocalAlbum`).
   */
  softDelete(id: string) {
    const db = getDb();
    const now = nowIso();

    db.update(albumsTable)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(albumsTable.id, id), isNull(albumsTable.deletedAt)))
      .run();

    db.update(albumTransactionsTable)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(albumTransactionsTable.albumId, id), isNull(albumTransactionsTable.deletedAt)))
      .run();
    this.clearAlbumCategories(id);
  }

  /**
   * A deleted album's entries go back under the user's own categories: a
   * shared album's bills and the parts paid on them drop the album category
   * they kept (`transactions.album_category`), which otherwise names them in
   * every list and keeps them out of other albums. The user's own category
   * is already on each (`personalCategoryFor`). Joining the album again
   * writes the album category back as the group is projected.
   */
  clearAlbumCategories(albumId: string) {
    getSQLite().runSync(
      `UPDATE transactions
       SET album_category = NULL, album_category_name = NULL, album_category_icon = NULL,
         updated_at = ?
       WHERE album_category IS NOT NULL
         AND id IN (SELECT transaction_id FROM album_transactions WHERE album_id = ?)
         AND id NOT IN (SELECT transaction_id FROM album_transactions WHERE deleted_at IS NULL)`,
      [nowIso(), albumId],
    );
  }

  getTransactionIds(albumId: string): string[] {
    const db = getDb();
    return db
      .select({ transactionId: albumTransactionsTable.transactionId })
      .from(albumTransactionsTable)
      .where(
        and(eq(albumTransactionsTable.albumId, albumId), isNull(albumTransactionsTable.deletedAt)),
      )
      .orderBy(albumTransactionsTable.sortOrder)
      .all()
      .map((row) => row.transactionId);
  }

  /**
   * Every album's member transaction ids, in one query, instead of a stats
   * query per album card. The album stats are summed from the loaded
   * transactions against this, so they always agree with what is on screen,
   * optimistic rows included, without re-reading the transactions table after
   * each write.
   */
  getAllTransactionIdsByAlbum(): Map<string, string[]> {
    const byAlbum = new Map<string, string[]>();
    getSQLite()
      .getAllSync<{ albumId: string; transactionId: string }>(
        `SELECT album_id AS albumId, transaction_id AS transactionId
       FROM album_transactions
       WHERE deleted_at IS NULL
         AND album_id IN (SELECT id FROM albums WHERE ledger_id = ? AND deleted_at IS NULL)`,
        [getActiveLedgerId()],
      )
      .forEach((row) => {
        const ids = byAlbum.get(row.albumId);
        if (ids) {
          ids.push(row.transactionId);
        } else {
          byAlbum.set(row.albumId, [row.transactionId]);
        }
      });
    return byAlbum;
  }

  /**
   * Puts entries in an album. An entry is in one album at most
   * (`idx_album_transactions_one_album`), so one in another album moves here,
   * on its own link row (one row changing albums, which syncs as any edit
   * does), except what belongs to a shared album, live or no longer shared
   * (its bills, the entries their payments made, and anything in one the
   * user is no longer in), which stays. An album no longer shared takes none.
   */
  addTransactions(albumId: string, transactionIds: string[]) {
    if (transactionIds.length === 0 || this.isFrozen(albumId)) return;

    const db = getDb();
    const sqlite = getSQLite();
    const now = nowIso();
    const existing = new Set(this.getTransactionIds(albumId));
    const wanted = [...new Set(transactionIds)].filter((id) => !existing.has(id));
    if (wanted.length === 0) return;
    const marks = wanted.map(() => '?').join(',');
    const groupBills = new Set(
      sqlite
        .getAllSync<{ id: string }>(
          `SELECT t.id FROM transactions t
           WHERE t.id IN (${marks})
             AND ((t.album_group_id IS NOT NULL AND t.album_group_id <> ?)
               OR (t.album_category IS NOT NULL AND t.album_group_id IS NULL)
               OR EXISTS (
                 SELECT 1 FROM album_transactions l JOIN albums a ON a.id = l.album_id
                 WHERE l.transaction_id = t.id AND l.deleted_at IS NULL
                   AND a.share_ended_at IS NOT NULL
               ))`,
          [...wanted, albumId],
        )
        .map((row) => row.id),
    );
    const linkByTransaction = new Map(
      sqlite
        .getAllSync<{ id: string; transactionId: string }>(
          `SELECT id, transaction_id AS transactionId FROM album_transactions
           WHERE deleted_at IS NULL AND transaction_id IN (${marks})`,
          wanted,
        )
        .map((row) => [row.transactionId, row.id]),
    );
    const toAdd = wanted.filter((id) => !groupBills.has(id));
    if (toAdd.length === 0) return;

    const baseSort = existing.size;

    sqlite.execSync('BEGIN');
    try {
      toAdd.forEach((transactionId, index) => {
        const sortOrder = baseSort + index;
        const linkId = linkByTransaction.get(transactionId);
        if (linkId) {
          db.update(albumTransactionsTable)
            .set({ albumId, sortOrder, updatedAt: now })
            .where(eq(albumTransactionsTable.id, linkId))
            .run();
          return;
        }
        db.insert(albumTransactionsTable)
          .values({
            id: newId(),
            albumId,
            transactionId,
            sortOrder,
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
          })
          .run();
      });
      sqlite.execSync('COMMIT');
    } catch (error) {
      sqlite.execSync('ROLLBACK');
      throw error;
    }
  }

  /** Takes entries out of an album; an album no longer shared keeps them. */
  removeTransactions(albumId: string, transactionIds: string[]) {
    if (transactionIds.length === 0 || this.isFrozen(albumId)) return;

    const db = getDb();
    const now = nowIso();
    db.update(albumTransactionsTable)
      .set({ deletedAt: now, updatedAt: now })
      .where(
        and(
          eq(albumTransactionsTable.albumId, albumId),
          inArray(albumTransactionsTable.transactionId, transactionIds),
          isNull(albumTransactionsTable.deletedAt),
        ),
      )
      .run();
  }
}

export const albumsRepository = new AlbumsRepository();
