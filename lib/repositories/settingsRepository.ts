import { and, eq, isNull } from 'drizzle-orm';

import { getDb } from '~/lib/db/client';
import { settingsTable } from '~/lib/db/schema';
import { getDeviceLocale } from '~/lib/i18n';
import type { UserSettings } from '~/types';
import { getLocaleCurrencyCode, getLocaleCurrencySymbol } from '~/utils/formatters';
import { nowIso } from '~/utils/id';

import { toSettings } from './mappers';

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
        | 'currencyCode'
        | 'currencySymbol'
        | 'displayMode'
        | 'timeFeatureEnabled'
        | 'hapticsEnabled'
        | 'themeMode'
        | 'themeColor'
        | 'accountLogoCountry'
        | 'profileName'
        | 'profileAvatarUri'
        | 'onboardingCompleted'
        | 'userMode'
        | 'weekStartsOn'
        | 'biometricLockEnabled'
        | 'biometricLockDelaySeconds'
        | 'autoBackupEnabled'
        | 'autoBackupTarget'
        | 'lastAutoBackupAt'
        | 'lastAutoBackupError'
        | 'autoFxRefreshEnabled'
        | 'lastRateFetchAt'
        | 'lastRateFetchError'
        | 'fxCurrenciesJson'
        | 'paymentQrUri'
        | 'defaultPaybackAccountId'
      >
    >,
  ) {
    const db = getDb();
    db.update(settingsTable)
      .set({ ...input, updatedAt: nowIso() })
      .where(and(eq(settingsTable.id, SETTINGS_ID), isNull(settingsTable.deletedAt)))
      .run();
  }

  updateAppUserId(appUserId: string) {
    const db = getDb();
    db.update(settingsTable)
      .set({ appUserId, updatedAt: nowIso() })
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

  getNotificationPreferencesJson(): string | null {
    const db = getDb();
    const row = db
      .select({ notificationPrefsJson: settingsTable.notificationPrefsJson })
      .from(settingsTable)
      .where(and(eq(settingsTable.id, SETTINGS_ID), isNull(settingsTable.deletedAt)))
      .get();
    return row?.notificationPrefsJson ?? null;
  }

  updateNotificationPreferencesJson(value: string | null) {
    const db = getDb();
    db.update(settingsTable)
      .set({ notificationPrefsJson: value, updatedAt: nowIso() })
      .where(and(eq(settingsTable.id, SETTINGS_ID), isNull(settingsTable.deletedAt)))
      .run();
  }

  getQuickEntryPrefsJson(): string | null {
    const db = getDb();
    const row = db
      .select({ quickEntryPrefsJson: settingsTable.quickEntryPrefsJson })
      .from(settingsTable)
      .where(and(eq(settingsTable.id, SETTINGS_ID), isNull(settingsTable.deletedAt)))
      .get();
    return row?.quickEntryPrefsJson ?? null;
  }

  updateQuickEntryPrefsJson(value: string | null) {
    const db = getDb();
    db.update(settingsTable)
      .set({ quickEntryPrefsJson: value, updatedAt: nowIso() })
      .where(and(eq(settingsTable.id, SETTINGS_ID), isNull(settingsTable.deletedAt)))
      .run();
  }

  getCalendarPrefsJson(): string | null {
    const db = getDb();
    const row = db
      .select({ calendarPrefsJson: settingsTable.calendarPrefsJson })
      .from(settingsTable)
      .where(and(eq(settingsTable.id, SETTINGS_ID), isNull(settingsTable.deletedAt)))
      .get();
    return row?.calendarPrefsJson ?? null;
  }

  updateCalendarPrefsJson(value: string | null) {
    const db = getDb();
    db.update(settingsTable)
      .set({ calendarPrefsJson: value, updatedAt: nowIso() })
      .where(and(eq(settingsTable.id, SETTINGS_ID), isNull(settingsTable.deletedAt)))
      .run();
  }

  reset() {
    const db = getDb();
    const now = nowIso();
    const localeCurrencyCode = getLocaleCurrencyCode();
    const localeCurrencySymbol = getLocaleCurrencySymbol();
    db.update(settingsTable)
      .set({
        locale: getDeviceLocale(),
        currencyCode: localeCurrencyCode,
        currencySymbol: localeCurrencySymbol,
        displayMode: 'money',
        timeFeatureEnabled: true,
        hapticsEnabled: true,
        themeMode: 'system',
        themeColor: 'rosewood',
        accountLogoCountry: null,
        insightsPrefsJson: null,
        notificationPrefsJson: null,
        quickEntryPrefsJson: null,
        calendarPrefsJson: null,
        onboardingCompleted: false,
        userMode: 'power',
        weekStartsOn: 1,
        biometricLockEnabled: false,
        biometricLockDelaySeconds: 900,
        autoBackupEnabled: true,
        autoBackupTarget: 'local',
        lastAutoBackupAt: null,
        lastAutoBackupError: null,
        autoFxRefreshEnabled: true,
        lastRateFetchAt: null,
        lastRateFetchError: null,
        paymentQrUri: null,
        defaultPaybackAccountId: null,
        updatedAt: now,
      })
      .where(eq(settingsTable.id, SETTINGS_ID))
      .run();
  }
}

export const settingsRepository = new SettingsRepository();
