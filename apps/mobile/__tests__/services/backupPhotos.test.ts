/**
 * Photos stored once beside the automatic backups: named by content, uploaded
 * only when the target lacks them, found again on restore, and deleted only
 * when no remaining backup lists them.
 */
import type { BackupPhotoRecord, BackupRecord } from '~/services/autoBackup.shared';
import {
  type BackupPhotoStore,
  BackupPhotoVanishedError,
  describeBackupPhotos,
  pruneBackupPhotos,
  rememberBackupPhotos,
  resetBackupPhotoMemory,
  resolveBackupPhotos,
  STORED_PHOTO_GRACE_MS,
  uploadMissingPhotos,
} from '~/services/backupPhotos';
import type { BackupData } from '~/services/dataManagementService';

const saved = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => saved.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => {
    saved.set(key, value);
  }),
}));

// Files by uri: their content stands in for bytes, and the digest is derived
// from it, so equal content gives an equal name.
const files = new Map<string, string>();
const deletedDirs: string[] = [];

jest.mock('expo-file-system/next', () => {
  class File {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/');
    }
    get exists() {
      return files.has(this.uri);
    }
    delete() {
      files.delete(this.uri);
    }
    async digest() {
      const content = files.get(this.uri);
      if (content === undefined) throw new Error('no such file');
      return content.padEnd(32, '0').slice(0, 32).toUpperCase();
    }
  }
  class Directory {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/');
    }
    get exists() {
      return true;
    }
    create() {}
    delete() {
      deletedDirs.push(this.uri);
    }
  }
  return { File, Directory, Paths: { cache: 'cache' } };
});

const HASH_A = 'aaaa'.padEnd(32, '0');
const HASH_B = 'bbbb'.padEnd(32, '0');
const photoName = (hash: string, ext = 'jpg') => `money2time_PHOTO_${hash}.${ext}`;

/** A target's photo half, in memory. */
function memoryStore(initial: BackupPhotoRecord[] = []) {
  const photos = new Map(initial.map((photo) => [photo.name, photo]));
  const store: BackupPhotoStore & { photos: typeof photos } = {
    listsUploadsAtOnce: true,
    photos,
    listPhotos: jest.fn(async () => [...photos.values()]),
    uploadPhoto: jest.fn(async (name: string) => {
      photos.set(name, { name, ref: `ref-${name}`, createdAt: Date.now() });
    }),
    downloadPhoto: jest.fn(async (photo: BackupPhotoRecord, destination: { uri: string }) => {
      files.set(destination.uri, `bytes of ${photo.name}`);
    }) as BackupPhotoStore['downloadPhoto'],
    deletePhoto: jest.fn(async (photo: BackupPhotoRecord) => {
      photos.delete(photo.name);
    }),
  };
  return store;
}

const OLD = Date.parse('2026-11-01T00:00:00Z');
const NOW = OLD + 30 * STORED_PHOTO_GRACE_MS;

function backupRecord(id: string): BackupRecord {
  return { id, target: 'local', createdAt: '', sizeBytes: 1, ref: id };
}

beforeEach(() => {
  saved.clear();
  files.clear();
  deletedDirs.length = 0;
  resetBackupPhotoMemory();
});

describe('describeBackupPhotos', () => {
  it('names each file by its content and keeps its extension', async () => {
    files.set('a', 'aaaa');
    files.set('b', 'aaaa');
    files.set('c', 'bbbb');
    const photos = await describeBackupPhotos([
      { path: 'album-covers/1.jpg', uri: 'a' },
      { path: 'avatars/2.JPG', uri: 'b' },
      { path: 'account-logos/3.png', uri: 'c' },
    ]);
    expect(photos).toEqual([
      { path: 'album-covers/1.jpg', photo: photoName(HASH_A), uri: 'a' },
      { path: 'avatars/2.JPG', photo: photoName(HASH_A), uri: 'b' },
      { path: 'account-logos/3.png', photo: photoName(HASH_B, 'png'), uri: 'c' },
    ]);
  });

  it('leaves out a file that vanished since the listing', async () => {
    const photos = await describeBackupPhotos([{ path: 'album-covers/gone.jpg', uri: 'gone' }]);
    expect(photos).toEqual([]);
  });

  it('stores a file with any extension, or none, rather than leaving it out', async () => {
    files.set('gif', 'aaaa');
    files.set('bare', 'bbbb');
    files.set('odd', 'aaaa');
    const photos = await describeBackupPhotos([
      { path: 'album-covers/x.gif', uri: 'gif' },
      { path: 'receipts/no-extension', uri: 'bare' },
      { path: 'receipts/x.not-an-ext!', uri: 'odd' },
    ]);
    expect(photos.map((photo) => photo.photo)).toEqual([
      photoName(HASH_A, 'gif'),
      photoName(HASH_B, 'bin'),
      photoName(HASH_A, 'bin'),
    ]);
  });
});

describe('uploadMissingPhotos', () => {
  it('uploads only what the target lacks, once per content', async () => {
    const store = memoryStore([{ name: photoName(HASH_A), ref: 'r', createdAt: OLD }]);
    await uploadMissingPhotos(store, [
      { path: 'album-covers/1.jpg', photo: photoName(HASH_A), uri: 'a' },
      { path: 'avatars/2.jpg', photo: photoName(HASH_B), uri: 'b' },
      { path: 'avatars/3.jpg', photo: photoName(HASH_B), uri: 'b2' },
    ]);
    expect(store.uploadPhoto).toHaveBeenCalledTimes(1);
    expect(store.uploadPhoto).toHaveBeenCalledWith(photoName(HASH_B), 'b');
  });

  it('stores several at once, and keeps those that landed when one fails', async () => {
    const store = memoryStore();
    let active = 0;
    let peak = 0;
    (store.uploadPhoto as jest.Mock).mockImplementation(async (name: string) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      if (name === photoName('dddd'.padEnd(32, '0'))) throw new Error('quota');
      store.photos.set(name, { name, ref: name, createdAt: OLD });
    });
    const photos = ['aaaa', 'bbbb', 'cccc', 'dddd', 'eeee'].map((hash, i) => ({
      path: `album-covers/${i}.jpg`,
      photo: photoName(hash.padEnd(32, '0')),
      uri: `u${i}`,
    }));
    photos.forEach((photo) => files.set(photo.uri, 'x'));
    await expect(uploadMissingPhotos(store, photos)).rejects.toThrow('quota');
    expect(peak).toBe(3);
    // Every photo but the refused one landed, the one in flight beside it too.
    expect(store.photos.size).toBe(4);
    expect(store.photos.has(photoName('dddd'.padEnd(32, '0')))).toBe(false);
  });

  it('fails the backup when an upload reported success but the photo is not there', async () => {
    const store = memoryStore();
    (store.uploadPhoto as jest.Mock).mockResolvedValue(undefined);
    await expect(
      uploadMissingPhotos(store, [{ path: 'avatars/2.jpg', photo: photoName(HASH_B), uri: 'b' }]),
    ).rejects.toThrow('1 stored photo(s) missing after upload');
  });

  it('trusts a store whose listing lags its uploads', async () => {
    const store = { ...memoryStore(), listsUploadsAtOnce: false };
    (store.uploadPhoto as jest.Mock).mockResolvedValue(undefined);
    await expect(
      uploadMissingPhotos(store, [{ path: 'avatars/2.jpg', photo: photoName(HASH_B), uri: 'b' }]),
    ).resolves.toBeUndefined();
    expect(store.listPhotos).toHaveBeenCalledTimes(1);
  });

  it('fails the backup when a photo cannot be stored', async () => {
    const store = memoryStore();
    (store.uploadPhoto as jest.Mock).mockRejectedValueOnce(new Error('Drive is full'));
    files.set('b', 'bbbb');
    await expect(
      uploadMissingPhotos(store, [{ path: 'avatars/2.jpg', photo: photoName(HASH_B), uri: 'b' }]),
    ).rejects.toThrow('Drive is full');
  });
});

describe('resolveBackupPhotos', () => {
  const data = (photos: BackupData['photos']): BackupData => ({
    version: 3,
    exportedAt: '',
    tables: {} as BackupData['tables'],
    photos,
  });

  it('downloads each listed photo once, from the first store that has it', async () => {
    const first = memoryStore([{ name: photoName(HASH_A), ref: 'ra', createdAt: OLD }]);
    const second = memoryStore([
      { name: photoName(HASH_A), ref: 'ra2', createdAt: OLD },
      { name: photoName(HASH_B), ref: 'rb', createdAt: OLD },
    ]);
    const resolved = await resolveBackupPhotos(
      data([
        { path: 'album-covers/1.jpg', photo: photoName(HASH_A) },
        { path: 'avatars/me.jpg', photo: photoName(HASH_A) },
        { path: 'avatars/2.jpg', photo: photoName(HASH_B) },
      ]),
      [first, second],
    );
    expect(resolved.missing).toBe(0);
    expect(resolved.backup.assetFiles).toEqual([
      { path: 'album-covers/1.jpg', uri: `cache/backup-photos/${photoName(HASH_A)}` },
      { path: 'avatars/me.jpg', uri: `cache/backup-photos/${photoName(HASH_A)}` },
      { path: 'avatars/2.jpg', uri: `cache/backup-photos/${photoName(HASH_B)}` },
    ]);
    expect(first.downloadPhoto).toHaveBeenCalledTimes(1);
    expect(second.downloadPhoto).toHaveBeenCalledTimes(1);
  });

  it('restores without, and counts, a photo no reachable store has', async () => {
    const store = memoryStore([{ name: photoName(HASH_A), ref: 'ra', createdAt: OLD }]);
    const resolved = await resolveBackupPhotos(
      data([
        { path: 'album-covers/1.jpg', photo: photoName(HASH_A) },
        { path: 'avatars/2.jpg', photo: photoName(HASH_B) },
        { path: 'avatars/3.jpg', photo: photoName(HASH_B) },
      ]),
      [store],
    );
    expect(resolved.backup.assetFiles?.map((file) => file.path)).toEqual(['album-covers/1.jpg']);
    expect(resolved.missing).toBe(2);
  });

  it('refuses to restore when a store could not be read or a download failed', async () => {
    const refs = [{ path: 'avatars/2.jpg', photo: photoName(HASH_B) }];
    const broken = memoryStore();
    (broken.listPhotos as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    await expect(resolveBackupPhotos(data(refs), [broken])).rejects.toThrow(
      'backup_restore.photos_unavailable',
    );

    const flaky = memoryStore([{ name: photoName(HASH_B), ref: 'rb', createdAt: OLD }]);
    (flaky.downloadPhoto as jest.Mock).mockRejectedValueOnce(new Error('timeout'));
    await expect(resolveBackupPhotos(data(refs), [flaky])).rejects.toThrow(
      'backup_restore.photos_unavailable',
    );
  });

  it('does not refuse when an unreadable store was not needed', async () => {
    const store = memoryStore([{ name: photoName(HASH_B), ref: 'rb', createdAt: OLD }]);
    const broken = memoryStore();
    (broken.listPhotos as jest.Mock).mockRejectedValueOnce(new Error('signed out'));
    const resolved = await resolveBackupPhotos(
      data([{ path: 'avatars/2.jpg', photo: photoName(HASH_B) }]),
      [store, broken],
    );
    expect(resolved.missing).toBe(0);
    expect(broken.listPhotos).not.toHaveBeenCalled();
  });

  it('leaves a backup without listed photos as it is', async () => {
    const plain = data(undefined);
    await expect(resolveBackupPhotos(plain, [memoryStore()])).resolves.toEqual({
      backup: plain,
      missing: 0,
    });
  });
});

describe('pruneBackupPhotos', () => {
  const stored = (hash: string, createdAt: number | null = OLD) => ({
    name: photoName(hash),
    ref: hash,
    createdAt,
  });
  const HASH_C = 'cccc'.padEnd(32, '0');

  it('deletes old photos no kept backup lists, reading only backups it has not seen', async () => {
    const store = memoryStore([stored(HASH_A), stored(HASH_B), stored(HASH_C)]);
    const mine = backupRecord('money2time_AUTO_2026-11-20T00-00-00.json.gz');
    const other = backupRecord('money2time_AUTO_2026-11-19T00-00-00.json.gz');
    const legacy = backupRecord('money2time_AUTO_2026-11-18T00-00-00.json');
    rememberBackupPhotos(mine, [{ path: 'a.jpg', photo: photoName(HASH_A) }]);
    const readPhotos = jest.fn(async () => [photoName(HASH_B)]);

    await expect(
      pruneBackupPhotos(store, mine, [mine, other, legacy], readPhotos, NOW),
    ).resolves.toBe(1);
    expect(readPhotos).toHaveBeenCalledTimes(1);
    expect(readPhotos).toHaveBeenCalledWith(other);
    expect([...store.photos.keys()]).toEqual([photoName(HASH_A), photoName(HASH_B)]);
  });

  it('reads nothing when every stored photo is in a backup it knows', async () => {
    const store = memoryStore([stored(HASH_A)]);
    const mine = backupRecord('money2time_AUTO_2026-11-20T00-00-00.json.gz');
    rememberBackupPhotos(mine, [{ path: 'a.jpg', photo: photoName(HASH_A) }]);
    const readPhotos = jest.fn();
    const unseen = backupRecord('money2time_AUTO_2026-11-19T00-00-00.json.gz');
    await expect(pruneBackupPhotos(store, mine, [mine, unseen], readPhotos, NOW)).resolves.toBe(0);
    expect(readPhotos).not.toHaveBeenCalled();
  });

  it('deletes nothing when a kept backup cannot be read', async () => {
    const store = memoryStore([stored(HASH_A)]);
    const unreadable = backupRecord('money2time_AUTO_2026-11-19T00-00-00.json.gz');
    const readPhotos = jest.fn(async () => {
      throw new Error('offline');
    });
    await expect(pruneBackupPhotos(store, unreadable, [unreadable], readPhotos, NOW)).resolves.toBe(
      0,
    );
    expect(store.deletePhoto).not.toHaveBeenCalled();
  });

  it('keeps a photo stored within the last day, or of unknown age', async () => {
    const store = memoryStore([stored(HASH_A, NOW - 60_000), stored(HASH_B, null)]);
    const mine = backupRecord('money2time_AUTO_2026-11-20T00-00-00.json.gz');
    rememberBackupPhotos(mine, []);
    await expect(pruneBackupPhotos(store, mine, [mine], jest.fn(), NOW)).resolves.toBe(0);
    expect(store.deletePhoto).not.toHaveBeenCalled();
  });

  it('remembers what a backup it read lists', async () => {
    const store = memoryStore([stored(HASH_A), stored(HASH_B)]);
    const other = backupRecord('money2time_AUTO_2026-11-19T00-00-00.json.gz');
    const readPhotos = jest.fn(async () => [photoName(HASH_A)]);
    await pruneBackupPhotos(store, other, [other], readPhotos, NOW);
    store.photos.set(photoName(HASH_C), stored(HASH_C));
    // A later run, as a background task, starts with nothing in memory.
    resetBackupPhotoMemory();
    await pruneBackupPhotos(store, other, [other], readPhotos, NOW);
    expect(readPhotos).toHaveBeenCalledTimes(1);
    expect([...store.photos.keys()]).toEqual([photoName(HASH_A)]);
  });

  it('keeps what the backup just written lists when the listing lags behind it', async () => {
    // Drive's listing can miss a file uploaded seconds ago.
    const store = memoryStore([stored(HASH_A), stored(HASH_B)]);
    const mine = backupRecord('money2time_AUTO_2026-11-20T00-00-00.json.gz');
    const older = backupRecord('money2time_AUTO_2026-11-19T00-00-00.json.gz');
    rememberBackupPhotos(mine, [{ path: 'a.jpg', photo: photoName(HASH_A) }]);
    rememberBackupPhotos(older, []);
    await expect(pruneBackupPhotos(store, mine, [older], jest.fn(), NOW)).resolves.toBe(1);
    expect([...store.photos.keys()]).toEqual([photoName(HASH_A)]);
  });

  it('deletes every copy of an unlisted photo, duplicates too', async () => {
    const store = memoryStore();
    const copies = [
      { name: photoName(HASH_B), ref: 'one', createdAt: OLD },
      { name: photoName(HASH_B), ref: 'two', createdAt: OLD },
    ];
    (store.listPhotos as jest.Mock).mockResolvedValue(copies);
    const mine = backupRecord('money2time_AUTO_2026-11-20T00-00-00.json.gz');
    rememberBackupPhotos(mine, []);
    await expect(pruneBackupPhotos(store, mine, [mine], jest.fn(), NOW)).resolves.toBe(2);
    expect((store.deletePhoto as jest.Mock).mock.calls.map(([photo]) => photo.ref)).toEqual([
      'one',
      'two',
    ]);
  });
});

describe('uploadMissingPhotos when a copy fails', () => {
  const photos = [{ path: 'receipts/scan.jpg', photo: photoName(HASH_B), uri: 'file:///scan.jpg' }];

  it('says the photo was deleted when its file is gone', async () => {
    files.clear();
    const store = memoryStore();
    (store.uploadPhoto as jest.Mock).mockRejectedValueOnce(new Error('no such file'));

    await expect(uploadMissingPhotos(store, photos)).rejects.toBeInstanceOf(
      BackupPhotoVanishedError,
    );
  });

  it('throws the copy error itself while the file is still there', async () => {
    files.clear();
    files.set('file:///scan.jpg', 'bbbb');
    const store = memoryStore();
    const full = new Error('disk full');
    (store.uploadPhoto as jest.Mock).mockRejectedValueOnce(full);

    await expect(uploadMissingPhotos(store, photos)).rejects.toBe(full);
  });
});
