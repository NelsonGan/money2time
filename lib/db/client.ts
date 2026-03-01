import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';

import {
  DEFAULT_WAGE_CONFIG,
  ONBOARDING_MINIMAL_EXPENSE_CATEGORIES,
  ONBOARDING_MINIMAL_INCOME_CATEGORIES,
} from '~/constants/appDefaults';
import {
  computeHourlyRates,
  getLocaleCurrencySymbol,
  monthKeyFromDateLocal,
} from '~/utils/formatters';
import { newId, nowIso } from '~/utils/id';
import type { WageType } from '~/types';
import { runMigrations } from './migrations';
import { categoriesTable, monthlyWageSettingsTable, settingsTable } from './schema';
import { getDeviceLocale } from '~/lib/i18n';

const DB_NAME = 'money2time.db';
export const SIMPLE_WALLET_NAME = 'Simple Wallet';

let sqlite: SQLiteDatabase | null = null;
let initialized = false;

function currentMonth() {
  return monthKeyFromDateLocal(new Date());
}

function asWageType(value: string | null | undefined): WageType {
  if (value === 'hourly' || value === 'monthly' || value === 'yearly') {
    return value;
  }
  return DEFAULT_WAGE_CONFIG.wageType;
}

function seedOrCarryForwardMonthlyWage() {
  const db = getDb();
  const month = currentMonth();
  const now = nowIso();

  const existingCurrent = db
    .select()
    .from(monthlyWageSettingsTable)
    .where(
      and(eq(monthlyWageSettingsTable.month, month), isNull(monthlyWageSettingsTable.deletedAt)),
    )
    .get();
  if (existingCurrent) return;

  const mostRecent = db
    .select({
      wageType: monthlyWageSettingsTable.wageType,
      wageAmount: monthlyWageSettingsTable.wageAmount,
      hoursWorkedPerWeek: monthlyWageSettingsTable.hoursWorkedPerWeek,
      workdaysPerWeek: monthlyWageSettingsTable.workdaysPerWeek,
      commuteMinutesPerWorkday: monthlyWageSettingsTable.commuteMinutesPerWorkday,
    })
    .from(monthlyWageSettingsTable)
    .where(isNull(monthlyWageSettingsTable.deletedAt))
    .orderBy(desc(monthlyWageSettingsTable.month))
    .get();

  const config = {
    wageType: asWageType(mostRecent?.wageType),
    wageAmount: mostRecent?.wageAmount ?? DEFAULT_WAGE_CONFIG.wageAmount,
    hoursWorkedPerWeek: mostRecent?.hoursWorkedPerWeek ?? DEFAULT_WAGE_CONFIG.hoursWorkedPerWeek,
    workdaysPerWeek: mostRecent?.workdaysPerWeek ?? DEFAULT_WAGE_CONFIG.workdaysPerWeek,
    commuteMinutesPerWorkday:
      mostRecent?.commuteMinutesPerWorkday ?? DEFAULT_WAGE_CONFIG.commuteMinutesPerWorkday,
  } as const;

  const rates = computeHourlyRates(config);
  db.insert(monthlyWageSettingsTable)
    .values({
      id: newId(),
      month,
      wageType: config.wageType,
      wageAmount: config.wageAmount,
      hoursWorkedPerWeek: config.hoursWorkedPerWeek,
      workdaysPerWeek: config.workdaysPerWeek,
      commuteMinutesPerWorkday: config.commuteMinutesPerWorkday,
      baseHourlyRate: rates.baseHourlyRate,
      trueHourlyRate: rates.trueHourlyRate,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
    .run();
}

function ensureCoreData() {
  const db = getDb();
  const now = nowIso();

  const settingsRow = db
    .select()
    .from(settingsTable)
    .where(and(eq(settingsTable.id, 'primary'), isNull(settingsTable.deletedAt)))
    .get();

  if (!settingsRow) {
    db.insert(settingsTable)
      .values({
        id: 'primary',
        locale: getDeviceLocale(),
        currencySymbol: getLocaleCurrencySymbol(),
        hourRounding: 0.1,
        displayMode: 'money',
        themeMode: 'system',
        insightsPrefsJson: null,
        onboardingCompleted: false,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      })
      .run();
  }

  seedOrCarryForwardMonthlyWage();
  ensureDefaultCategories();
}

function ensureDefaultCategories() {
  const db = getDb();
  const now = nowIso();

  const existingCategories = db
    .select({ count: sql<number>`count(*)` })
    .from(categoriesTable)
    .where(isNull(categoriesTable.deletedAt))
    .get();

  if ((existingCategories?.count ?? 0) > 0) return;

  const allCategories = [
    ...ONBOARDING_MINIMAL_EXPENSE_CATEGORIES,
    ...ONBOARDING_MINIMAL_INCOME_CATEGORIES,
  ];

  allCategories.forEach((category, index) => {
    db.insert(categoriesTable)
      .values({
        id: newId(),
        name: category.name,
        sortOrder: index,
        type: category.type,
        parentId: category.parentId,
        icon: category.icon,
        isDefault: true,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      })
      .run();
  });
}

export function getSQLite(): SQLiteDatabase {
  if (!sqlite) {
    sqlite = openDatabaseSync(DB_NAME);
  }
  return sqlite;
}

export function getDb() {
  return drizzle(getSQLite());
}

export function initializeDatabase() {
  runMigrations(getSQLite());
  if (!initialized) {
    ensureCoreData();
    initialized = true;
    return;
  }
  ensureCoreData();
}
