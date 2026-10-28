import { readdirSync, readFileSync } from 'node:fs';
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
 * So in any app file that uses expo-file-system, those methods must either be
 * the `*Sync` variant or be awaited/returned. This fails on a bare call.
 */

const ROOT = path.resolve(__dirname, '../..');
// Everything else under apps/mobile is app source. Native projects, Node
// scripts and plugins (.js) and installed packages are not.
const SKIPPED_DIRS = new Set(['node_modules', '__tests__', 'ios', 'android', '.expo', 'dist']);
const ASYNC_METHODS = /\.\s*(copy|move|write|readBytes|writeBytes)\s*\(/g;

function sourceFiles(dir = ''): string[] {
  return readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return SKIPPED_DIRS.has(entry.name) || entry.name.startsWith('.') ? [] : sourceFiles(rel);
    }
    return /\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts') ? [rel] : [];
  });
}

/** Blank out comments, keeping offsets (and so line numbers) intact. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (comment) =>
    comment.replace(/[^\n]/g, ' '),
  );
}

/**
 * Each call to one of the methods whose statement does not await or return it.
 * The statement is everything since the last `;`, `{` or `}`, so a call
 * chained across lines is judged as one statement and an `await` earlier on
 * the same line, in another statement, does not count.
 */
function bareAsyncCalls(source: string): string[] {
  const code = stripComments(source);
  const found: string[] = [];
  for (const match of code.matchAll(ASYNC_METHODS)) {
    const start = Math.max(
      code.lastIndexOf(';', match.index),
      code.lastIndexOf('{', match.index),
      code.lastIndexOf('}', match.index),
    );
    if (/\b(await|return)\b/.test(code.slice(start + 1, match.index))) continue;
    const line = code.slice(0, match.index).split('\n').length;
    found.push(`${line}: ${source.split('\n')[line - 1].trim()}`);
  }
  return found;
}

describe('expo-file-system async methods', () => {
  const files = sourceFiles().filter((file) =>
    stripComments(readFileSync(path.join(ROOT, file), 'utf8')).includes('expo-file-system'),
  );

  it('finds the files that use expo-file-system', () => {
    expect(files).toEqual(
      expect.arrayContaining([
        'services/userAssets.ts',
        'lib/db/citiesDb.ts',
        'features/transactions/components/SplitReceiptShareModal.tsx',
      ]),
    );
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
          'const x = await load(); file.write(json);',
          'new File(uri)',
          '  .copy(dest);',
          'new File(a).copySync(b);',
          'file.writeSync(json);',
          'await file.write(json);',
          'await new File(uri)',
          '  .copy(dest);',
          'return source.move(dest);',
          '// file.copy(dest) in a comment',
          '/* file.write(x) in a block comment */',
        ].join('\n'),
      ),
    ).toEqual([
      '1: new File(a).copy(b);',
      '2: file.write(json);',
      '3: const x = await load(); file.write(json);',
      '5: .copy(dest);',
    ]);
  });
});
