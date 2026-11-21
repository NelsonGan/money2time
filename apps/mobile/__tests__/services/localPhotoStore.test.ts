/**
 * The phone's photo store. Its mock moves files the way expo-file-system does:
 * a moved File points at its destination afterwards, which once made the copy
 * delete the photo it had just stored.
 */
const disk = new Map<string, string>();
const created = new Map<string, number>();
let failCopy = false;

jest.mock('expo-file-system/next', () => {
  const join = (parts: unknown[]) =>
    parts
      .map((part) => (typeof part === 'string' ? part : (part as { uri: string }).uri))
      .join('/');
  class File {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = join(parts);
    }
    get exists() {
      return disk.has(this.uri);
    }
    get name() {
      return this.uri.slice(this.uri.lastIndexOf('/') + 1);
    }
    get creationTime() {
      return created.get(this.uri) ?? 1;
    }
    get size() {
      return (disk.get(this.uri) ?? '').length;
    }
    delete() {
      disk.delete(this.uri);
    }
    async copy(to: File) {
      if (failCopy) {
        disk.set(to.uri, 'trunc');
        throw new Error('disk full');
      }
      disk.set(to.uri, disk.get(this.uri) ?? '');
    }
    moveSync(to: File) {
      disk.set(to.uri, disk.get(this.uri) ?? '');
      disk.delete(this.uri);
      this.uri = to.uri;
    }
  }
  class Directory {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = join(parts);
    }
    get exists() {
      return true;
    }
    create() {}
    list() {
      return [...disk.keys()]
        .filter((uri) => uri.startsWith(`${this.uri}/`))
        .map((uri) => new File(uri));
    }
  }
  return { File, Directory, Paths: { document: 'doc' }, FileMode: { ReadOnly: 'r' } };
});

import { localProvider } from '~/services/autoBackupProviders/local';

const PHOTO = `money2time_PHOTO_${'a'.repeat(32)}.jpg`;

beforeEach(() => {
  disk.clear();
  created.clear();
  failCopy = false;
});

it('stores a photo under its name and keeps it there', async () => {
  disk.set('doc/user-assets/album-covers/a.jpg', 'jpeg bytes');
  await localProvider.uploadPhoto(PHOTO, 'doc/user-assets/album-covers/a.jpg');
  expect(disk.get(`doc/backups/${PHOTO}`)).toBe('jpeg bytes');
  expect([...disk.keys()].some((uri) => uri.endsWith('.partial'))).toBe(false);
  await expect(localProvider.listPhotos()).resolves.toEqual([
    { name: PHOTO, ref: `doc/backups/${PHOTO}`, createdAt: 1 },
  ]);
});

it('leaves nothing under the photo name when the copy fails part-way', async () => {
  disk.set('doc/user-assets/album-covers/a.jpg', 'jpeg bytes');
  failCopy = true;
  await expect(
    localProvider.uploadPhoto(PHOTO, 'doc/user-assets/album-covers/a.jpg'),
  ).rejects.toThrow('disk full');
  expect([...disk.keys()].filter((uri) => uri.startsWith('doc/backups/'))).toEqual([]);
});

it('does not copy a photo it already has', async () => {
  disk.set(`doc/backups/${PHOTO}`, 'stored');
  disk.set('doc/user-assets/album-covers/a.jpg', 'other');
  await localProvider.uploadPhoto(PHOTO, 'doc/user-assets/album-covers/a.jpg');
  expect(disk.get(`doc/backups/${PHOTO}`)).toBe('stored');
});

it('sweeps a copy an app kill left behind, once no copy can still be writing it', async () => {
  const stale = `doc/backups/${PHOTO}.1-abc.partial`;
  const fresh = `doc/backups/${PHOTO}.2-def.partial`;
  disk.set(stale, 'trunc');
  disk.set(fresh, 'writing');
  created.set(fresh, Date.now());
  disk.set('doc/backups/notes.partial', 'not ours');
  await expect(localProvider.listPhotos()).resolves.toEqual([]);
  expect(disk.has(stale)).toBe(false);
  expect(disk.has(fresh)).toBe(true);
  expect(disk.has('doc/backups/notes.partial')).toBe(true);
});
