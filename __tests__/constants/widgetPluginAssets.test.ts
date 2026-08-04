import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../..');
const PLUGINS_DIR = path.join(REPO_ROOT, 'plugins');

/**
 * Config plugins copy artwork into the native widget targets during
 * `expo prebuild`, which only runs on an EAS build. A rename or deletion in
 * `assets/` is therefore invisible to typecheck, lint and the rest of the
 * suite, and first surfaces as an ENOENT that fails the release build after CI
 * has already gone green. (That is exactly how `assets/mascots/rich.png` broke
 * both store builds when the clay mascot set landed.) Fail here instead.
 */
function assetPathsReferencedBy(pluginFile: string): string[] {
  const source = readFileSync(pluginFile, 'utf8');
  const matches = source.matchAll(/['"](assets\/[^'"]+)['"]/g);
  return [...new Set([...matches].map((match) => match[1]))];
}

describe('config plugin assets', () => {
  const pluginFiles = readdirSync(PLUGINS_DIR).filter((file) => file.endsWith('.js'));

  it('finds the plugin files to scan', () => {
    expect(pluginFiles).toContain('withMoney2TimeWidgets.js');
  });

  it.each(pluginFiles)('%s references only assets that exist', (pluginFile) => {
    const referenced = assetPathsReferencedBy(path.join(PLUGINS_DIR, pluginFile));
    const missing = referenced.filter((asset) => !existsSync(path.join(REPO_ROOT, asset)));

    expect(missing).toEqual([]);
  });

  it('copies both widget images the native targets render', () => {
    const referenced = assetPathsReferencedBy(path.join(PLUGINS_DIR, 'withMoney2TimeWidgets.js'));

    // The Swift/XML layouts load these by their copied names (`banner`,
    // `widget_mascot`/`mascot`), so the plugin must always ship one of each.
    expect(referenced).toContain('assets/banner.png');
    expect(referenced.some((asset) => asset.startsWith('assets/mascots/'))).toBe(true);
  });
});
