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
// `updated_at` is left alone on purpose. Every phone of the account runs this
// itself with the same result, and a newer `updated_at` here would let this
// fill win over a removal another phone synced before this one upgraded.
export const migration096AlbumFlagIcons: DbMigration = {
  version: 96,
  name: '096_album_flag_icons',
  up(db) {
    const rows = db.getAllSync<{ id: string; country_code: string }>(
      `SELECT id, country_code FROM albums
       WHERE icon IS NULL AND country_code IS NOT NULL AND deleted_at IS NULL`,
    );
    for (const row of rows) {
      const icon = flagIcon(row.country_code);
      if (icon)
        db.runSync('UPDATE albums SET icon = ? WHERE id = ? AND icon IS NULL', [icon, row.id]);
    }
  },
};

export default migration096AlbumFlagIcons;
