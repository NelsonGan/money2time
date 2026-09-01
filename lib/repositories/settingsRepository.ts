import { and, eq, isNull } from 'drizzle-orm';

import { DEFAULT_APP_ICON_ID } from '~/constants/appIcons';
import { busyWaitSync } from '~/lib/db/busyWaitSync';
import { getDb } from '~/lib/db/client';
import { retryDiskIO } from '~/lib/db/diskIoRetry';
import { settingsTable } from '~/lib/db/schema';
import { getDeviceLocale } from '~/lib/i18n';
import type { UserSettings } from '~/types';
import { getLocaleCurrencyCode, getLocaleCurrencySymbol } from '~/utils/formatters';
import { nowIso } from '~/utils/id';

import { toSettings } from './mappers';

const SETTINGS_ID = 'primary';

class SettingsRepository {
  get(sleep: (ms: number) => void = busyWaitSync): UserSettings {
    const db = getDb();

    // This read runs on every foreground (it gates `runAutoBackupIfDue`),
    // well after the DB is already open, so it hits the same transient
    // `disk I/O error` window as `applyPragmas`/migrations on its own rather
    // than sharing their retry (see `retryDiskIO`, Sentry MONEY2TIME-2H).
    return retryDiskIO(() => {
      const row = db
        .select()
        .from(settingsTable)
        .where(and(eq(settingsTable.id, SETTINGS_ID), isNull(settingsTable.deletedAt)))
        .get();

      if (!row) {
        throw new Error('Settings row not found');
      }

      return toSettings(row);
    }, sleep);
  }

  updateSettings(
    input: Partial<
      Pick<
        UserSettings,
        | 'locale'
        | 'currencyCode'
        | 'currencySymbol'
        | 'displayMode'
        | 'workdayDisplayEnabled'
        | 'workingHoursPerDay'
        | 'hapticsEnabled'
        | 'themeMode'
        | 'themeColor'
        | 'iconStyle'
        | 'appIcon'
        | 'accountLogoCountry'
        | 'subscriptionLogoCountry'
        | 'profileName'
        | 'profileAvatarUri'
        | 'onboardingCompleted'
        | 'userMode'
        | 'weekStartsOn'
        | 'firstDayOfMonth'
        | 'firstDayOverridesJson'
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
        | 'reimbursementsCountAsExpense'
      >
    >,
  ) {
    const db = getDb();
    const normalizedInput = { ...input };
    if (normalizedInput.workingHoursPerDay !== undefined) {
      normalizedInput.workingHoursPerDay = Number.isFinite(normalizedInput.workingHoursPerDay)
        ? Math.min(24, Math.max(1, normalizedInput.workingHoursPerDay))
        : 8;
    }
    db.update(settingsTable)
      .set({ ...normalizedInput, updatedAt: nowIso() })
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
        workdayDisplayEnabled: false,
        workingHoursPerDay: 8,
        hapticsEnabled: true,
        themeMode: 'system',
        themeColor: 'rosewood',
        iconStyle: 'clay',
        appIcon: DEFAULT_APP_ICON_ID,
        accountLogoCountry: null,
        subscriptionLogoCountry: null,
        insightsPrefsJson: null,
        notificationPrefsJson: null,
        quickEntryPrefsJson: null,
        calendarPrefsJson: null,
        onboardingCompleted: false,
        userMode: 'power',
        weekStartsOn: 1,
        firstDayOfMonth: 1,
        firstDayOverridesJson: null,
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
        reimbursementsCountAsExpense: true,
        updatedAt: now,
      })
      .where(eq(settingsTable.id, SETTINGS_ID))
      .run();
  }
}

export const settingsRepository = new SettingsRepository();
