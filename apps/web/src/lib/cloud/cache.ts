"use client";

import type { TransferMeta } from "./relay";

/**
 * What this browser keeps between visits, in IndexedDB:
 *
 * - the link: the private room token and the key shared with the phone. The
 *   key is a non-extractable WebCrypto key, so it works here but no script can
 *   read its bytes back out.
 * - the last data the phone sent, still encrypted under that transfer's own
 *   non-extractable key, so the dashboard opens when the phone is not around.
 *   It is decrypted in memory each time and replaced whenever the phone sends
 *   again.
 * - links this browser unlinked while the phone was away, until the phone has
 *   heard about it.
 *
 * Unlinking clears the first two. A full backup runs to tens of megabytes,
 * well past localStorage.
 */

const DB_NAME = "money2time-web-dashboard";
const DB_VERSION = 1;
const LINK_STORE = "link";
const BACKUP_STORE = "backup";
const UNLINK_STORE = "unlinks";
const CURRENT = "current";

export type StoredLink = {
  roomId: string;
  key: CryptoKey;
  /** The phone that linked this browser, for the sidebar. */
  phoneName: string | null;
};

export type CachedBackup = {
  /** Includes `pro` as the phone last said, so an offline open shows the same views. */
  meta: TransferMeta;
  dataKey: CryptoKey;
  ivPrefix: Uint8Array<ArrayBuffer>;
  frames: Uint8Array<ArrayBuffer>[];
  receivedAt: string;
};

type PendingUnlink = { roomId: string; key: CryptoKey; unlinkedAt: string };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("indexeddb-unavailable"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore(LINK_STORE);
      db.createObjectStore(BACKUP_STORE);
      db.createObjectStore(UNLINK_STORE, { keyPath: "roomId" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("indexeddb-open"));
  });
}

function run<T>(
  storeName: string | string[],
  mode: IDBTransactionMode,
  action: (tx: IDBTransaction) => IDBRequest | void,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const request = action(tx);
        tx.oncomplete = () => {
          db.close();
          resolve((request ? request.result : undefined) as T);
        };
        tx.onerror = tx.onabort = () => {
          db.close();
          reject(tx.error ?? new Error("indexeddb-transaction"));
        };
      }),
  );
}

export async function readLink(): Promise<StoredLink | null> {
  try {
    return (await run<StoredLink | undefined>(LINK_STORE, "readonly", (tx) => tx.objectStore(LINK_STORE).get(CURRENT))) ?? null;
  } catch {
    return null;
  }
}

/**
 * Keeps the link for the next visit. False when the browser refuses storage
 * (private windows often do): the link then lasts only as long as the tab.
 */
export async function writeLink(link: StoredLink): Promise<boolean> {
  try {
    await run(LINK_STORE, "readwrite", (tx) => tx.objectStore(LINK_STORE).put(link, CURRENT));
    return true;
  } catch {
    return false;
  }
}

export async function readCache(): Promise<CachedBackup | null> {
  try {
    return (await run<CachedBackup | undefined>(BACKUP_STORE, "readonly", (tx) => tx.objectStore(BACKUP_STORE).get(CURRENT))) ?? null;
  } catch {
    // Private windows and blocked site data can refuse IndexedDB; the
    // dashboard then needs the phone on every visit.
    return null;
  }
}

export async function writeCache(entry: CachedBackup): Promise<boolean> {
  try {
    await run(BACKUP_STORE, "readwrite", (tx) => tx.objectStore(BACKUP_STORE).put(entry, CURRENT));
    return true;
  } catch {
    return false;
  }
}

/**
 * Takes back a copy written after the link it belonged to was unlinked (or
 * replaced), if it is still the one kept. Never touches the link: a new one
 * may have been stored meanwhile.
 */
export async function removeCache(entry: CachedBackup): Promise<void> {
  try {
    await run(BACKUP_STORE, "readwrite", (tx) => {
      const store = tx.objectStore(BACKUP_STORE);
      const request = store.get(CURRENT);
      request.onsuccess = () => {
        const kept = request.result as CachedBackup | undefined;
        if (kept && kept.meta.id === entry.meta.id && kept.receivedAt === entry.receivedAt) store.delete(CURRENT);
      };
    });
  } catch {
    // Nothing stored, or storage unavailable.
  }
}

/**
 * On unlink: neither the key nor the data stays on a shared computer. With
 * `pending`, the link waits in the unlink list until the phone hears of it.
 */
export async function clearAll(pending?: PendingUnlink): Promise<void> {
  try {
    await run([LINK_STORE, BACKUP_STORE, UNLINK_STORE], "readwrite", (tx) => {
      tx.objectStore(LINK_STORE).clear();
      tx.objectStore(BACKUP_STORE).clear();
      if (pending) tx.objectStore(UNLINK_STORE).put(pending);
    });
  } catch {
    // Nothing stored, or storage unavailable.
  }
}

/** As on the phone: an unlink the phone has not heard of in this long is dropped. */
const PENDING_UNLINK_TTL_MS = 180 * 24 * 60 * 60 * 1000;

export async function readPendingUnlinks(): Promise<PendingUnlink[]> {
  let pending: PendingUnlink[];
  try {
    pending = (await run<PendingUnlink[]>(UNLINK_STORE, "readonly", (tx) => tx.objectStore(UNLINK_STORE).getAll())) ?? [];
  } catch {
    return [];
  }
  // A phone gone for good (the app deleted) would otherwise keep this browser
  // holding its key and knocking on the relay forever.
  const cutoff = Date.now() - PENDING_UNLINK_TTL_MS;
  const expired = pending.filter((item) => !(Date.parse(item.unlinkedAt) > cutoff));
  for (const item of expired) await removePendingUnlink(item.roomId);
  return pending.filter((item) => Date.parse(item.unlinkedAt) > cutoff);
}

export async function removePendingUnlink(roomId: string): Promise<void> {
  try {
    await run(UNLINK_STORE, "readwrite", (tx) => tx.objectStore(UNLINK_STORE).delete(roomId));
  } catch {
    // Storage unavailable: it is tried again next visit.
  }
}
