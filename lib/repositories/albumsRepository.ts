import { and, eq, inArray, isNull, sql } from 'drizzle-orm';

import { getDb, getSQLite } from '~/lib/db/client';
import { albumsTable, albumTransactionsTable } from '~/lib/db/schema';
import type { Album } from '~/types';
import { newId, nowIso } from '~/utils/id';

import { toAlbum } from './mappers';

interface CreateAlbumInput {
  name: string;
  coverPhotoUri?: string | null;
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
      .where(isNull(albumsTable.deletedAt))
      .orderBy(albumsTable.sortOrder, albumsTable.name)
      .all()
      .map(toAlbum);
  }

  getById(id: string): Album | null {
    const db = getDb();
    const row = db
      .select()
      .from(albumsTable)
      .where(and(eq(albumsTable.id, id), isNull(albumsTable.deletedAt)))
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
      .where(isNull(albumsTable.deletedAt))
      .get();
    const nextSortOrder = input.sortOrder ?? (minSort?.minSort ?? 0) - 1;

    db.insert(albumsTable)
      .values({
        id,
        name: input.name,
        coverPhotoUri: input.coverPhotoUri ?? null,
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
      .where(and(eq(albumsTable.isActive, true), isNull(albumsTable.deletedAt)))
      .run();
    if (id) {
      db.update(albumsTable)
        .set({ isActive: true, updatedAt: now })
        .where(and(eq(albumsTable.id, id), isNull(albumsTable.deletedAt)))
        .run();
    }
  }

  getActiveId(): string | null {
    const db = getDb();
    const row = db
      .select({ id: albumsTable.id })
      .from(albumsTable)
      .where(and(eq(albumsTable.isActive, true), isNull(albumsTable.deletedAt)))
      .get();
    return row?.id ?? null;
  }

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
       WHERE deleted_at IS NULL`,
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

  addTransactions(albumId: string, transactionIds: string[]) {
    if (transactionIds.length === 0) return;

    const db = getDb();
    const sqlite = getSQLite();
    const now = nowIso();
    const existing = new Set(this.getTransactionIds(albumId));
    const toAdd = transactionIds.filter((id) => !existing.has(id));
    if (toAdd.length === 0) return;

    const baseSort = existing.size;

    sqlite.execSync('BEGIN');
    try {
      toAdd.forEach((transactionId, index) => {
        db.insert(albumTransactionsTable)
          .values({
            id: newId(),
            albumId,
            transactionId,
            sortOrder: baseSort + index,
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

  removeTransactions(albumId: string, transactionIds: string[]) {
    if (transactionIds.length === 0) return;

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
