import { and, eq, isNull } from 'drizzle-orm';

import { DEFAULT_APP_ICON_ID } from '~/constants/appIcons';
import { busyWaitSync } from '~/lib/db/busyWaitSync';
import { getDb } from '~/lib/db/client';
import { settingsTable } from '~/lib/db/schema';
import { getDeviceLocale } from '~/lib/i18n';
import type { UserSettings } from '~/types';
import { getLocaleCurrencyCode, getLocaleCurrencySymbol } from '~/utils/formatters';
import { nowIso } from '~/utils/id';

import { toSettings } from './mappers';

const SETTINGS_ID = 'primary';

/** Retries for the settings read below; see the comment inside `get`. */
const MAX_READ_ATTEMPTS = 3;

/** Gap before each retry (index 0 = before attempt 2, index 1 = before attempt 3). */
const READ_RETRY_DELAYS_MS = [15, 45];

class SettingsRepository {
  get(sleep: (ms: number) => void = busyWaitSync): UserSettings {
    const db = getDb();

    // SQLite reports a bare `disk I/O error` (SQLITE_IOERR) for several
    // transient conditions unrelated to real disk failure, most commonly
    // another process (an iCloud/Google Drive backup restore, a
    // Spotlight-style file indexer) briefly holding the DB file lock. This
    // read runs on every foreground (it gates `runAutoBackupIfDue`), well
    // after the DB is already open, so it hits that window on its own rather
    // than sharing the startup retry added for `applyPragmas`/migrations
    // (Sentry MONEY2TIME-2H, distinct from MONEY2TIME-2G/1X: same transient
    // error, but on a later, already-open-connection read, not app boot). A
    // genuine failure (corruption, real I/O failure) still throws once the
    // attempts are spent.
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_READ_ATTEMPTS; attempt++) {
      try {
        const row = db
          .select()
          .from(settingsTable)
          .where(and(eq(settingsTable.id, SETTINGS_ID), isNull(settingsTable.deletedAt)))
          .get();

        if (!row) {
          throw new Error('Settings row not found');
        }

        return toSettings(row);
      } catch (error) {
        lastError = error;
        const delay = READ_RETRY_DELAYS_MS[attempt - 1];
        if (delay !== undefined) sleep(delay);
      }
    }
    throw lastError;
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
