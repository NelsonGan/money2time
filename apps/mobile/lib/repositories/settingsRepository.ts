import { and, eq, isNull } from 'drizzle-orm';

import { DEFAULT_APP_ICON_ID } from '~/constants/appIcons';
import { busyWaitSync } from '~/lib/db/busyWaitSync';
import { getDb } from '~/lib/db/client';
import { DEFAULT_LEDGER_ID, getActiveLedgerId } from '~/lib/db/ledgerScope';
import { ledgersTable, settingsTable } from '~/lib/db/schema';
import { getDeviceLocale } from '~/lib/i18n';
import { LEDGER_QUICK_ENTRY_KEYS, type LedgerPrefs, type UserSettings } from '~/types';
import { getLocaleCurrencyCode, getLocaleCurrencySymbol } from '~/utils/formatters';
import { nowIso } from '~/utils/id';

import { ledgersRepository } from './ledgersRepository';
import { toSettings } from './mappers';

const SETTINGS_ID = 'primary';

/**
 * Settings a non-default ledger keeps for itself, because they name its own
 * accounts or define its money. The default ledger keeps them in the settings
 * row, so for it every read and write below is exactly what it always was.
 * Quick entry and Insights preferences are split the same way, see
 * `getQuickEntryPrefsJson` and `getInsightsPreferencesJson`.
 */
const LEDGER_SETTING_KEYS = ['currencyCode', 'currencySymbol', 'defaultPaybackAccountId'] as const;
type LedgerSettingKey = (typeof LEDGER_SETTING_KEYS)[number];

/** The open ledger when it is not the default one; null otherwise. */
function openNonDefaultLedgerId(): string | null {
  const id = getActiveLedgerId();
  return id === DEFAULT_LEDGER_ID ? null : id;
}

function parseJsonObject(json: string | null): Record<string, unknown> | null {
  if (!json) return null;
  try {
    const parsed: unknown = JSON.parse(json);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Retries for the settings read below; see the comment inside `get`. */
const MAX_READ_ATTEMPTS = 5;

/** Gap before each retry (index 0 = before attempt 2, ...). */
const READ_RETRY_DELAYS_MS = [20, 60, 150, 400];

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
    //
    // 3 attempts capped at 60ms of total pause wasn't always enough: this kept
    // recurring in the same sessions that also hit the identical retries in
    // `applyPragmas` (Sentry MONEY2TIME-2G) and the migration runner's
    // `readUserVersion` (Sentry MONEY2TIME-2S), meaning the lock can outlast
    // that whole window. 5 attempts with a growing gap give a contending
    // process up to ~630ms to clear before this gives up, at the cost of
    // blocking this foreground check that long only in the rare case every
    // earlier attempt already failed.
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

        return this.withOpenLedger(toSettings(row));
      } catch (error) {
        lastError = error;
        const delay = READ_RETRY_DELAYS_MS[attempt - 1];
        if (delay !== undefined) sleep(delay);
      }
    }
    throw lastError;
  }

  /** Overlay the open ledger's own settings on the settings row's. */
  private withOpenLedger(settings: UserSettings): UserSettings {
    const ledgerId = openNonDefaultLedgerId();
    if (!ledgerId) return settings;
    const ledger = getDb()
      .select({
        currencyCode: ledgersTable.currencyCode,
        currencySymbol: ledgersTable.currencySymbol,
        prefsJson: ledgersTable.prefsJson,
      })
      .from(ledgersTable)
      .where(eq(ledgersTable.id, ledgerId))
      .get();
    if (!ledger) return settings;
    const prefs = parseJsonObject(ledger.prefsJson) as LedgerPrefs | null;
    return {
      ...settings,
      currencyCode: ledger.currencyCode ?? settings.currencyCode,
      currencySymbol: ledger.currencySymbol ?? ledger.currencyCode ?? settings.currencySymbol,
      defaultPaybackAccountId: prefs?.defaultPaybackAccountId ?? null,
    };
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
        | 'showTransactionAccount'
        | 'showAccountPickerBalances'
        | 'navTabsJson'
      >
    >,
  ) {
    const db = getDb();
    const normalizedInput: typeof input = { ...input };
    const ledgerId = openNonDefaultLedgerId();
    if (ledgerId) {
      // The open ledger's own settings go to its row, never to the settings
      // row, which holds the default ledger's.
      const own: Partial<Pick<UserSettings, LedgerSettingKey>> = {};
      for (const key of LEDGER_SETTING_KEYS) {
        if (key in normalizedInput) {
          (own as Record<string, unknown>)[key] = normalizedInput[key];
          delete normalizedInput[key];
        }
      }
      if (own.currencyCode !== undefined || own.currencySymbol !== undefined) {
        ledgersRepository.update(ledgerId, {
          ...(own.currencyCode !== undefined ? { currencyCode: own.currencyCode } : {}),
          ...(own.currencySymbol !== undefined ? { currencySymbol: own.currencySymbol } : {}),
        });
      }
      if (own.defaultPaybackAccountId !== undefined) {
        ledgersRepository.updatePrefs(ledgerId, {
          defaultPaybackAccountId: own.defaultPaybackAccountId,
        });
      }
      if (Object.keys(normalizedInput).length === 0) return;
    }
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

  /** Remember the ledger open on this phone (device-local, never synced). */
  updateActiveLedgerId(ledgerId: string) {
    getDb()
      .update(settingsTable)
      .set({
        activeLedgerId: ledgerId === DEFAULT_LEDGER_ID ? null : ledgerId,
        updatedAt: nowIso(),
      })
      .where(and(eq(settingsTable.id, SETTINGS_ID), isNull(settingsTable.deletedAt)))
      .run();
  }

  /** The stored open ledger, read before anything else loads. */
  readActiveLedgerId(): string {
    const row = getDb()
      .select({ activeLedgerId: settingsTable.activeLedgerId })
      .from(settingsTable)
      .where(and(eq(settingsTable.id, SETTINGS_ID), isNull(settingsTable.deletedAt)))
      .get();
    return row?.activeLedgerId || DEFAULT_LEDGER_ID;
  }

  updateAppUserId(appUserId: string) {
    const db = getDb();
    db.update(settingsTable)
      .set({ appUserId, updatedAt: nowIso() })
      .where(and(eq(settingsTable.id, SETTINGS_ID), isNull(settingsTable.deletedAt)))
      .run();
  }

  getInsightsPreferencesJson(): string | null {
    // Insights preferences name accounts and categories, so each ledger has
    // its own; a new ledger starts from Insights' defaults.
    const ledgerId = openNonDefaultLedgerId();
    if (ledgerId) return ledgersRepository.getPrefs(ledgerId).insightsPrefsJson ?? null;
    const db = getDb();
    const row = db
      .select({ insightsPrefsJson: settingsTable.insightsPrefsJson })
      .from(settingsTable)
      .where(and(eq(settingsTable.id, SETTINGS_ID), isNull(settingsTable.deletedAt)))
      .get();
    return row?.insightsPrefsJson ?? null;
  }

  updateInsightsPreferencesJson(value: string | null) {
    const ledgerId = openNonDefaultLedgerId();
    if (ledgerId) {
      ledgersRepository.updatePrefs(ledgerId, { insightsPrefsJson: value });
      return;
    }
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

  /**
   * Quick entry preferences, with the fields that name a ledger's accounts and
   * categories (`LEDGER_QUICK_ENTRY_KEYS`) taken from the open ledger. The
   * rest, such as the + button and the free-tier usage counters, are the
   * app's, shared by every ledger.
   */
  getQuickEntryPrefsJson(): string | null {
    const appJson = this.readAppQuickEntryPrefsJson();
    const ledgerId = openNonDefaultLedgerId();
    if (!ledgerId) return appJson;
    const app = parseJsonObject(appJson) ?? {};
    for (const key of LEDGER_QUICK_ENTRY_KEYS) delete app[key];
    const own = ledgersRepository.getPrefs(ledgerId).quickEntry ?? {};
    return JSON.stringify({ ...app, ...own });
  }

  private readAppQuickEntryPrefsJson(): string | null {
    const db = getDb();
    const row = db
      .select({ quickEntryPrefsJson: settingsTable.quickEntryPrefsJson })
      .from(settingsTable)
      .where(and(eq(settingsTable.id, SETTINGS_ID), isNull(settingsTable.deletedAt)))
      .get();
    return row?.quickEntryPrefsJson ?? null;
  }

  updateQuickEntryPrefsJson(value: string | null) {
    const ledgerId = openNonDefaultLedgerId();
    if (ledgerId) {
      const next = parseJsonObject(value) ?? {};
      const own: Record<string, unknown> = {};
      for (const key of LEDGER_QUICK_ENTRY_KEYS) {
        if (key in next) own[key] = next[key];
        delete next[key];
      }
      ledgersRepository.updatePrefs(ledgerId, { quickEntry: own as LedgerPrefs['quickEntry'] });
      // Keep the default ledger's own fields in the settings row untouched.
      const app = parseJsonObject(this.readAppQuickEntryPrefsJson()) ?? {};
      for (const key of LEDGER_QUICK_ENTRY_KEYS) {
        if (key in app) next[key] = app[key];
      }
      value = JSON.stringify(next);
    }
    const db = getDb();
    db.update(settingsTable)
      .set({ quickEntryPrefsJson: value, updatedAt: nowIso() })
      .where(and(eq(settingsTable.id, SETTINGS_ID), isNull(settingsTable.deletedAt)))
      .run();
  }

  getAutoLogPrefsJson(): string | null {
    const db = getDb();
    const row = db
      .select({ autoLogPrefsJson: settingsTable.autoLogPrefsJson })
      .from(settingsTable)
      .where(and(eq(settingsTable.id, SETTINGS_ID), isNull(settingsTable.deletedAt)))
      .get();
    return row?.autoLogPrefsJson ?? null;
  }

  updateAutoLogPrefsJson(value: string | null) {
    const db = getDb();
    db.update(settingsTable)
      .set({ autoLogPrefsJson: value, updatedAt: nowIso() })
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
        autoLogPrefsJson: null,
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
        showTransactionAccount: true,
        showAccountPickerBalances: true,
        navTabsJson: null,
        activeLedgerId: null,
        updatedAt: now,
      })
      .where(eq(settingsTable.id, SETTINGS_ID))
      .run();
  }
}

export const settingsRepository = new SettingsRepository();
