---
name: add-db-migration
description: Add a database schema change to the money2time app (new table, column, or index) the correct, append-only way. Use whenever you need to alter the SQLite schema, add/rename a column, add a table or index, or backfill data on upgrade. Covers the migration file, schema.ts, mappers, types, and backfill so existing users' data survives.
---

# Add a DB migration (money2time)

SQLite via `expo-sqlite` + Drizzle. Migrations are **append-only**, numbered `NNN_*.ts` in `lib/db/migrations/`, and **auto-discovered** by `lib/db/migrations/index.ts` via `require.context` matching `^\d{3}_[a-z0-9_-]+\.(ts|js)$`, then run in ascending `version` order. The latest is `028`; your new file is the next number.

**Never edit a shipped migration.** Users have already run it; changing it diverges their DB from new installs. Always add a new file.

## Steps

1. **Create `lib/db/migrations/NNN_short_name.ts`** (NNN = next zero-padded number). Mirror the existing shape (`027_exchange_rates_table.ts` is a good template):

   ```ts
   import type { DbMigration } from './types';

   export const migrationNNNShortName: DbMigration = {
     version: NNN,           // integer, must match the file's NNN and be unique/next
     name: 'NNN_short_name',
     up(db) {
       db.execSync(`ALTER TABLE transactions ADD COLUMN my_field TEXT;`);
       // or CREATE TABLE IF NOT EXISTS ... / CREATE [UNIQUE] INDEX IF NOT EXISTS ...
     },
   };

   export default migrationNNNShortName;     // index.ts reads module.default
   ```
   - Use `CREATE TABLE/INDEX IF NOT EXISTS` and additive `ALTER TABLE ... ADD COLUMN` so re-runs and partial upgrades are safe.
   - SQLite can't drop/rename columns cleanly — model changes as additive. To "remove" a column, stop reading it (see the historical `007`/`008` "remove_*" migrations for the table-rebuild pattern if a true drop is required).
   - The index auto-loads the file; there is no manual registration list to update.

2. **Update `lib/db/schema.ts`** — add the column/table to the matching `sqliteTable` (snake_case DB name, camelCase TS key) so Drizzle and the inferred `*Row` types match the real schema. Keep defaults consistent with the migration's SQL.

3. **Update `lib/repositories/mappers.ts`** — map the new row field to/from the domain type. Raw `*Row` types must not leak above repositories.

4. **Update `types/index.ts`** — add the field to the domain type (`Transaction`, `UserSettings`, etc.) and anywhere it's constructed.

5. **Backfill if existing rows need a sensible value.** Defaults cover new rows; legacy rows may need a one-time pass. Follow `lib/db/normalizeCurrencies.ts` (invoked on restore/upgrade) as the pattern for data backfills rather than cramming complex logic into `up()`.

6. **Wire it through `AppContext` / repositories** if the field is read or written by the app, and add any new repository method there (not in components).

7. **Test.** Add/adjust a repository + mapper test in `__tests__/` covering the new field (mapping, default, null-handling). Run `npm test`.

## Checklist

- [ ] New file `NNN_*.ts`, next version number, exports `default` `DbMigration`, idempotent SQL (`IF NOT EXISTS` / additive `ADD COLUMN`).
- [ ] No existing migration edited.
- [ ] `schema.ts` updated (DB name ↔ TS key, matching defaults).
- [ ] `mappers.ts` round-trips the field.
- [ ] `types/index.ts` domain type updated; all constructors compile.
- [ ] Backfill added if legacy rows need it (normalizeCurrencies pattern).
- [ ] Repository/context wiring + test added.
- [ ] `npm run check` and `npm test` pass.
- [ ] If this adds a table/notable column, update the schema table in `CLAUDE.md` and `README.md`.

## Anti-patterns

- Editing or reordering a shipped migration instead of appending a new one.
- Wrong/duplicate `version`, or filename not matching `^\d{3}_[a-z0-9_-]+$` (won't be discovered).
- Updating `schema.ts` but forgetting the migration (new installs differ from upgrades) — or vice-versa.
- Non-idempotent SQL that throws on re-run.
- Leaving `mappers.ts` / `types/` out of sync so the new column is silently dropped.
