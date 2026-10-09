import { addColumnIfMissing } from './helpers';
import type { DbMigration } from './types';

export const migration060SettingsFirstDayOverrides: DbMigration = {
  version: 60,
  name: '060_settings_first_day_overrides',
  up(db) {
    // Per-month exceptions to `first_day_of_month`, as a JSON object keyed by
    // `YYYY-MM` (`{"2026-03":15}`). Null/absent means every month follows the
    // default day, which is exactly how the app behaved before this column.
    // Parsed by `parseMonthCycleOverrides` in utils/financialMonth.ts.
    addColumnIfMissing(db, 'settings', 'first_day_overrides_json', 'TEXT');
  },
};

export default migration060SettingsFirstDayOverrides;
