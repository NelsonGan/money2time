import type { DbMigration } from './types';

function normalizeThemeColor(value: string | null | undefined) {
  switch (value) {
    case 'sage':
    case 'ocean':
    case 'terracotta':
    case 'slate':
    case 'amber':
    case 'indigo':
    case 'emerald':
    case 'rosewood':
      return value;
    case 'berry':
      return 'rosewood';
    default:
      return 'rosewood';
  }
}

export const migration003SettingsThemeColor: DbMigration = {
  version: 3,
  name: '003_settings_theme_color',
  up(db) {
    const columns = db.getAllSync<{ name: string }>('PRAGMA table_info(settings);');
    const hasThemeColor = columns.some((column) => column.name === 'theme_color');

    if (!hasThemeColor) {
      db.execSync("ALTER TABLE settings ADD COLUMN theme_color TEXT NOT NULL DEFAULT 'rosewood';");
    }

    const rows = db.getAllSync<{ id: string; theme_color: string | null }>(
      'SELECT id, theme_color FROM settings;',
    );

    rows.forEach((row) => {
      const normalizedThemeColor = normalizeThemeColor(row.theme_color);
      if (row.theme_color === normalizedThemeColor) return;

      const escapedId = row.id.replace(/'/g, "''");
      db.execSync(
        `UPDATE settings SET theme_color = '${normalizedThemeColor}' WHERE id = '${escapedId}';`,
      );
    });
  },
};

export default migration003SettingsThemeColor;
