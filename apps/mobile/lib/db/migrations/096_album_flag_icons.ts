import type { DbMigration } from './types';

// The flag of an ISO 3166-1 alpha-2 code as a stored icon (`emoji:🇯🇵`), kept
// here frozen as this migration shipped it, like every migration's logic;
// the app's own copy is `flagIconForCountry` in features/albums/lib/flagEmoji.ts.
function flagIcon(countryCode: string): string | null {
  const code = countryCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return null;
  const flag = String.fromCodePoint(
    ...Array.from(code, (letter) => 0x1f1e6 + letter.charCodeAt(0) - 65),
  );
  return `emoji:${flag}`;
}

// An album with a place gets its country's flag as its icon (README: Key
// patterns > Albums, An album's icon): the forms fill it in when a place is
// picked, and this gives the albums placed before that their flag once. Only
// an icon that was never set (NULL) is filled: '' is one the user removed.
//
// The fill stays on this phone: Cloud Sync's capture triggers are kept quiet
// (sync_state.applying, as while pulled rows are applied), so no row is
// queued and `updated_at` is left alone. Every phone of the account runs this
// itself with the same result; a queued row would win over the copy pulled
// from the cloud, so a phone upgrading late would push its whole stale row
// back over another phone's newer edit (a removed flag, a renamed album).
export const migration096AlbumFlagIcons: DbMigration = {
  version: 96,
  name: '096_album_flag_icons',
  up(db) {
    const rows = db.getAllSync<{ id: string; country_code: string }>(
      `SELECT id, country_code FROM albums
       WHERE icon IS NULL AND country_code IS NOT NULL AND deleted_at IS NULL`,
    );
    if (rows.length === 0) return;
    const applying =
      db.getFirstSync<{ value: string | null }>(
        `SELECT value FROM sync_state WHERE key = 'applying'`,
      )?.value ?? '0';
    db.runSync(`INSERT OR REPLACE INTO sync_state (key, value) VALUES ('applying', '1')`);
    try {
      for (const row of rows) {
        const icon = flagIcon(row.country_code);
        if (icon) {
          db.runSync('UPDATE albums SET icon = ? WHERE id = ? AND icon IS NULL', [icon, row.id]);
        }
      }
    } finally {
      db.runSync(`INSERT OR REPLACE INTO sync_state (key, value) VALUES ('applying', ?)`, [
        applying,
      ]);
    }
  },
};

export default migration096AlbumFlagIcons;
