import { and, eq, isNull } from 'drizzle-orm';

import { getDb } from '~/lib/db/client';
import { settingsTable } from '~/lib/db/schema';
import type { UserSettings } from '~/types';
import { nowIso } from '~/utils/id';
import { toSettings } from './mappers';
import { getDeviceLocale } from '~/lib/i18n';

const SETTINGS_ID = 'primary';

class SettingsRepository {
  get(): UserSettings {
    const db = getDb();
    const row = db
      .select()
      .from(settingsTable)
      .where(and(eq(settingsTable.id, SETTINGS_ID), isNull(settingsTable.deletedAt)))
      .get();

    if (!row) {
      throw new Error('Settings row not found');
    }

    return toSettings(row);
  }

  updateSettings(
    input: Partial<
      Pick<
        UserSettings,
        | 'locale'
        | 'currencySymbol'
        | 'hourRounding'
        | 'displayMode'
        | 'themeMode'
        | 'onboardingCompleted'
        | 'userMode'
      >
    >,
  ) {
    const db = getDb();
    db.update(settingsTable)
      .set({ ...input, updatedAt: nowIso() })
      .where(and(eq(settingsTable.id, SETTINGS_ID), isNull(settingsTable.deletedAt)))
      .run();
  }

  getInsightsPreferencesJson(): string | null {
    const db = getDb();
    const row = db
      .select({ insightsPrefsJson: settingsTable.insightsPrefsJson })
      .from(settingsTable)
      .where(and(eq(settingsTable.id, SETTINGS_ID), isNull(settingsTable.deletedAt)))
      .get();
    return row?.insightsPrefsJson ?? null;
  }

  updateInsightsPreferencesJson(value: string | null) {
    const db = getDb();
    db.update(settingsTable)
      .set({ insightsPrefsJson: value, updatedAt: nowIso() })
      .where(and(eq(settingsTable.id, SETTINGS_ID), isNull(settingsTable.deletedAt)))
      .run();
  }

  reset() {
    const db = getDb();
    const now = nowIso();
    db.update(settingsTable)
      .set({
        locale: getDeviceLocale(),
        currencySymbol: '$',
        hourRounding: 0.1,
        displayMode: 'money',
        themeMode: 'system',
        insightsPrefsJson: null,
        onboardingCompleted: false,
        userMode: 'power',
        updatedAt: now,
      })
      .where(eq(settingsTable.id, SETTINGS_ID))
      .run();
  }
}

export const settingsRepository = new SettingsRepository();
