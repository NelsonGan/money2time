import { readdirSync } from 'fs';
import { join } from 'path';

// The app loads migrations with require.context, which Jest does not run, so
// the order the runner asserts at startup (strictly ascending versions) is
// checked here against the files themselves: two files with one number make
// the app refuse to open its database.
describe('migration files', () => {
  const dir = join(__dirname, '../../lib/db/migrations');
  const files = readdirSync(dir).filter((name) => /^\d{3}_[a-z0-9_-]+\.(ts|js)$/i.test(name));

  it('give every migration its own version number', () => {
    const byNumber = new Map<string, string[]>();
    for (const file of files) {
      const number = file.slice(0, 3);
      byNumber.set(number, [...(byNumber.get(number) ?? []), file]);
    }
    const clashes = [...byNumber.values()].filter((names) => names.length > 1);
    expect(clashes).toEqual([]);
  });

  it('declare the version their file name says', () => {
    for (const file of files) {
      const migration = require(join(dir, file)).default as { version: number; name: string };
      expect([file, migration.version]).toEqual([file, Number(file.slice(0, 3))]);
      expect(migration.name).toBe(file.replace(/\.(ts|js)$/, ''));
    }
  });
});
