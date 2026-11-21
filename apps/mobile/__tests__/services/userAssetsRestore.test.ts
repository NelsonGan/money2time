/**
 * Putting backed-up images back: embedded ones written from base64, stored
 * ones copied from where the restore downloaded them. Paths come from a file
 * the user picked, so none may land outside the user-assets folder.
 */
const disk = new Map<string, string>();
const failing = new Set<string>();

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
    create() {
      disk.set(this.uri, '');
    }
    delete() {
      disk.delete(this.uri);
    }
    writeSync(content: string) {
      disk.set(this.uri, `base64:${content}`);
    }
    copySync(to: File) {
      if (failing.has(this.uri)) throw new Error('no such file');
      disk.set(to.uri, disk.get(this.uri) ?? '');
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
      const prefix = `${this.uri}/`;
      const names = new Set<string>();
      const out: (File | Directory)[] = [];
      for (const uri of disk.keys()) {
        if (!uri.startsWith(prefix)) continue;
        const rest = uri.slice(prefix.length);
        const [head, ...tail] = rest.split('/');
        if (names.has(head)) continue;
        names.add(head);
        out.push(tail.length ? new Directory(this.uri, head) : new File(this.uri, head));
      }
      return out;
    }
    get name() {
      return this.uri.slice(this.uri.lastIndexOf('/') + 1);
    }
  }
  return { File, Directory, Paths: { document: 'doc' } };
});

import { listUserAssetFilesForBackup, restoreUserAssetsFromBackup } from '~/services/userAssets';

beforeEach(() => {
  disk.clear();
  failing.clear();
});

it('writes embedded images and copies downloaded ones over what is there', () => {
  disk.set('doc/user-assets/album-covers/a.jpg', 'old');
  disk.set('cache/backup-photos/p1.jpg', 'new bytes');

  restoreUserAssetsFromBackup(
    [{ path: 'avatars/me.jpg', base64: 'QUJD' }],
    [{ path: 'album-covers/a.jpg', uri: 'cache/backup-photos/p1.jpg' }],
  );

  expect(disk.get('doc/user-assets/avatars/me.jpg')).toBe('base64:QUJD');
  expect(disk.get('doc/user-assets/album-covers/a.jpg')).toBe('new bytes');
});

it('keeps every restored path inside the user-assets folder', () => {
  disk.set('cache/backup-photos/p1.jpg', 'bytes');
  restoreUserAssetsFromBackup(
    [{ path: '../../SQLite/money2time.db', base64: 'QUJD' }],
    [
      { path: '/etc/../../x.jpg', uri: 'cache/backup-photos/p1.jpg' },
      { path: './..', uri: 'cache/backup-photos/p1.jpg' },
    ],
  );
  const written = [...disk.keys()].filter((uri) => uri !== 'cache/backup-photos/p1.jpg');
  expect(written).toEqual(['doc/user-assets/SQLite/money2time.db', 'doc/user-assets/etc/x.jpg']);
});

it('restores the rest when one downloaded photo cannot be copied', () => {
  disk.set('cache/backup-photos/ok.jpg', 'ok');
  failing.add('cache/backup-photos/gone.jpg');
  restoreUserAssetsFromBackup(undefined, [
    { path: 'album-covers/gone.jpg', uri: 'cache/backup-photos/gone.jpg' },
    { path: 'album-covers/ok.jpg', uri: 'cache/backup-photos/ok.jpg' },
  ]);
  expect(disk.get('doc/user-assets/album-covers/ok.jpg')).toBe('ok');
  expect(disk.has('doc/user-assets/album-covers/gone.jpg')).toBe(false);
});

it('lists files without reading them, honouring the folder and file filter', () => {
  disk.set('doc/user-assets/album-covers/a.jpg', 'x');
  disk.set('doc/user-assets/receipts/r.jpg', 'x');
  disk.set('doc/user-assets/avatars/me.jpg', 'x');
  const files = listUserAssetFilesForBackup((path) => !path.startsWith('receipts/'));
  expect(files.map((file) => file.path).sort()).toEqual(['album-covers/a.jpg', 'avatars/me.jpg']);
  expect(files[0].uri).toMatch(/^doc\/user-assets\//);
});
