import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * expo-file-system made `copy()` and `move()` (56.0.0), `write()`, and
 * `FileHandle.readBytes()` / `writeBytes()` (58.0.0) asynchronous. Before that
 * they finished before returning, and the app still called them that way. The
 * Expo SDK 58 upgrade (#605) jumped straight from 19.x, so every call kept
 * running in the background while the next line used the file. Screenshot
 * scans read the receipt before its copy landed and failed with "Could not read
 * the captured receipt" on 1.6.1 and later.
 *
 * So in any file that uses expo-file-system, those methods must either be the
 * `*Sync` variant or be awaited/returned. This fails on a bare call.
 */

const ROOT = path.resolve(__dirname, '../..');
const SOURCE_DIRS = [
  'App.tsx',
  'components',
  'context',
  'features',
  'hooks',
  'lib',
  'services',
  'utils',
];
const ASYNC_METHODS = /\.(copy|move|write|readBytes|writeBytes)\(/g;

function sourceFiles(entry: string): string[] {
  const full = path.join(ROOT, entry);
  let stat;
  try {
    stat = statSync(full);
  } catch {
    return [];
  }
  if (stat.isFile()) return /\.tsx?$/.test(entry) ? [entry] : [];
  return readdirSync(full).flatMap((name) => sourceFiles(path.join(entry, name)));
}

function bareAsyncCalls(source: string): string[] {
  const found: string[] = [];
  source.split('\n').forEach((line, index) => {
    const code = line.replace(/\/\/.*$/, '');
    for (const match of code.matchAll(ASYNC_METHODS)) {
      const before = code.slice(0, match.index);
      if (/\b(await|return)\b/.test(before)) continue;
      found.push(`${index + 1}: ${line.trim()}`);
    }
  });
  return found;
}

describe('expo-file-system async methods', () => {
  const files = SOURCE_DIRS.flatMap(sourceFiles).filter((file) =>
    readFileSync(path.join(ROOT, file), 'utf8').includes('expo-file-system'),
  );

  it('finds the files that use expo-file-system', () => {
    expect(files).toEqual(expect.arrayContaining(['services/userAssets.ts', 'lib/db/citiesDb.ts']));
  });

  it.each(files)(
    '%s never calls copy, move, write or readBytes/writeBytes without waiting',
    (file) => {
      expect(bareAsyncCalls(readFileSync(path.join(ROOT, file), 'utf8'))).toEqual([]);
    },
  );

  it('flags a bare call and accepts the sync and awaited forms', () => {
    expect(
      bareAsyncCalls(
        [
          'new File(a).copy(b);',
          'file.write(json);',
          'new File(a).copySync(b);',
          'file.writeSync(json);',
          'await file.write(json);',
          'return source.move(dest);',
          '// file.copy(dest) in a comment',
        ].join('\n'),
      ),
    ).toEqual(['1: new File(a).copy(b);', '2: file.write(json);']);
  });
});
