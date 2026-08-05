// Native module pulled in at load by userAssets — stub with just enough
// behavior to drive the `collectUserAssetsForBackup` walk under test. The
// root Directory instance is constructed inside `rootDir()` (private to the
// module), so entries for it are staged via `__setNextRootEntries` right
// before the call that triggers its construction.
jest.mock('expo-file-system/next', () => {
  let nextRootEntries: unknown[] | null = null;
  class Directory {
    entries: unknown[];
    exists = true;
    constructor(...args: unknown[]) {
      if (nextRootEntries && args.length === 2) {
        this.entries = nextRootEntries;
        nextRootEntries = null;
      } else {
        this.entries = [];
      }
    }
    list() {
      return this.entries;
    }
  }
  class File {
    constructor(..._args: unknown[]) {}
  }
  return {
    Directory,
    File,
    Paths: { document: '/doc' },
    __setNextRootEntries: (entries: unknown[]) => {
      nextRootEntries = entries;
    },
  };
});

import { collectUserAssetsForBackup } from '~/services/userAssets';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { __setNextRootEntries } = require('expo-file-system/next');

function fakeFile(name: string, result: string | Error) {
  return {
    name,
    base64: () => (result instanceof Error ? Promise.reject(result) : Promise.resolve(result)),
  };
}

describe('collectUserAssetsForBackup', () => {
  it('skips a file that vanishes mid-walk instead of failing the whole backup', async () => {
    const missing = new Error('The file "b.jpg" couldn’t be opened because there is no such file.');
    __setNextRootEntries([
      fakeFile('a.jpg', 'AAA=='),
      fakeFile('b.jpg', missing),
      fakeFile('c.jpg', 'CCC=='),
    ]);

    const result = await collectUserAssetsForBackup();

    expect(result).toEqual([
      { path: 'a.jpg', base64: 'AAA==' },
      { path: 'c.jpg', base64: 'CCC==' },
    ]);
  });

  it('returns every file when nothing vanishes', async () => {
    __setNextRootEntries([fakeFile('a.jpg', 'AAA=='), fakeFile('b.jpg', 'BBB==')]);

    const result = await collectUserAssetsForBackup();

    expect(result).toEqual([
      { path: 'a.jpg', base64: 'AAA==' },
      { path: 'b.jpg', base64: 'BBB==' },
    ]);
  });
});
