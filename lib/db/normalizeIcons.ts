import type { SQLiteDatabase } from 'expo-sqlite';

import { CATEGORY_ICON_SOURCES, EMOJI_VALUE_PREFIX } from '~/constants/categoryIcons';

/**
 * FROZEN. Emoji glyphs that older builds stored in the icon columns, mapped to
 * the hand-drawn icon they were rendered as. Never extend this: new picks are
 * written in the tagged grammar (see constants/categoryIcons.ts), so nothing
 * can add a row that needs a new entry here.
 *
 * This map cannot be deleted, and it is worth being explicit about why. The
 * goal of the icon migration was to take the emoji indirection out of the
 * *render* path, and it does: nothing under components/, features/ or
 * services/ consults this table, so the 100-plus render sites no longer pay a
 * lookup. But a user can restore a backup taken on a pre-migration build at any
 * point in the future, or import a Money Manager file, and those payloads carry
 * bare glyphs. The map therefore survives here, at the data-ingress boundary,
 * as a frozen translation table.
 */
export const LEGACY_EMOJI_TO_ICON: Record<string, string> = {
  '🍔': 'meal',
  '🍕': 'meal',
  '🛒': 'grocery-basket',
  '🚗': 'car',
  '🏠': 'house',
  '📱': 'laptop',
  '💊': 'medicine',
  '🎮': 'game-controller',
  '🎬': 'clapperboard',
  '🎓': 'graduation-cap',
  '📚': 'graduation-cap',
  '🏋️': 'dumbbell',
  '🧳': 'camper-van',
  '✈️': 'plane',
  '🐶': 'dog',
  '👶': 'balloon',
  '👕': 't-shirt',
  '💡': 'light-bulb',
  '🍺': 'alcohol',
  '☕': 'coffee',
  '💼': 'briefcase',
  '💰': 'cash',
  '🎁': 'gift',
  '📈': 'coins',
  '🏦': 'bank',
  '🧾': 'invoice',
  '🔁': 'bill-calendar',
  '🛍️': 'shopping-bag',
  '🏥': 'stethoscope',
  '🧼': 'faucet',
  '🏷️': 'price-tag',
};

/** The four columns that hold a value in the icon grammar. */
const ICON_COLUMNS: { table: string; column: string }[] = [
  { table: 'categories', column: 'icon' },
  { table: 'accounts', column: 'goal_emoji' },
  { table: 'budget_templates', column: 'emoji' },
  { table: 'monthly_budgets', column: 'template_emoji' },
];

function hasNonAscii(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) > 127) return true;
  }
  return false;
}

/**
 * Rewrites one stored value into the tagged icon grammar.
 *
 * **Idempotent, and the migration depends on that.** `runMigrations` bumps
 * `PRAGMA user_version` inside each migration's own transaction, so a throw
 * rolls this rewrite back and replays it on the next launch. The rollback keeps
 * a replay from ever seeing half-rewritten data, and the fixpoint property makes
 * it harmless even if it did. The tagged forms are all fixpoints:
 *
 * - `meal` (a known bundled id) is returned unchanged
 * - `emoji:X` and `custom:...` are returned unchanged
 * - a mapped legacy glyph becomes its icon id, which is then a fixpoint
 * - an unmapped legacy glyph becomes `emoji:X`, which is then a fixpoint
 *
 * Unrecognized ASCII tokens are left alone: they are either an icon id from a
 * pack this build does not ship, or junk, and rewriting them would lose
 * information the renderer already handles by drawing a placeholder.
 */
export function normalizeIconValue(value: string | null | undefined): string | null | undefined {
  if (value == null) return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (trimmed.startsWith('custom:') || trimmed.startsWith(EMOJI_VALUE_PREFIX)) return trimmed;
  if (CATEGORY_ICON_SOURCES[trimmed]) return trimmed;

  const mapped = LEGACY_EMOJI_TO_ICON[trimmed];
  if (mapped) return mapped;
  if (hasNonAscii(trimmed)) return `${EMOJI_VALUE_PREFIX}${trimmed}`;
  return trimmed;
}

/**
 * Backfills every icon column into the tagged grammar.
 *
 * Driven by `SELECT DISTINCT` rather than by row, so the statement count is
 * bounded by the size of the icon vocabulary (about 60 bundled ids plus however
 * many distinct emoji one user has picked) no matter how many rows the tables
 * hold. Same shape as {@link normalizeCurrencyColumns}, including the per-table
 * `try/catch` for tables a given DB has not created yet.
 *
 * Idempotent. Safe to run from a migration, after a backup restore, and after a
 * Money Manager import.
 */
export function normalizeIconColumns(db: SQLiteDatabase): void {
  for (const { table, column } of ICON_COLUMNS) {
    let rows: Array<{ value: string | null }>;
    try {
      rows = db.getAllSync<{ value: string | null }>(
        `SELECT DISTINCT ${column} AS value FROM ${table} WHERE ${column} IS NOT NULL AND TRIM(${column}) <> ''`,
      );
    } catch {
      // Table added by a later migration, so absent when this runs as part of
      // an older DB's catch-up pass.
      continue;
    }
    for (const row of rows) {
      const current = row.value;
      if (current == null) continue;
      const next = normalizeIconValue(current);
      if (next != null && next !== current) {
        db.runSync(`UPDATE ${table} SET ${column} = ? WHERE ${column} = ?`, [next, current]);
      }
    }
  }
}
