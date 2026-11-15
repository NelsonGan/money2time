import { execFileSync } from 'node:child_process';
import path from 'node:path';

// The website tags a shared album's bill from its title with a copy of Quick
// Entry's keywords (scripts/sync-category-keywords.mjs). Run
// `npm run sync:category-keywords` when this fails.
it("keeps the website's copy of the category keywords the same as the app's", () => {
  const root = path.resolve(__dirname, '../..');
  expect(() =>
    execFileSync(
      process.execPath,
      [
        '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
        path.join(root, 'scripts/sync-category-keywords.mjs'),
        '--check',
      ],
      { cwd: root, stdio: 'pipe' },
    ),
  ).not.toThrow();
});
