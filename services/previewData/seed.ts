import { getDb, getSQLite } from '~/lib/db/client';
import {
  accountGroupsTable,
  accountsTable,
  albumsTable,
  albumTransactionsTable,
  budgetTemplateCategoriesTable,
  budgetTemplatesTable,
  categoriesTable,
  exchangeRatesTable,
  itemsTable,
  monthlyBudgetCategoriesTable,
  monthlyBudgetsTable,
  monthlyWageSettingsTable,
  recurringRulesTable,
  transactionSplitsTable,
  transactionsTable,
} from '~/lib/db/schema';
import { accountGroupsRepository } from '~/lib/repositories/accountGroupsRepository';
import { accountsRepository } from '~/lib/repositories/accountsRepository';
import { albumsRepository } from '~/lib/repositories/albumsRepository';
import { budgetTemplatesRepository } from '~/lib/repositories/budgetTemplatesRepository';
import { categoriesRepository } from '~/lib/repositories/categoriesRepository';
import { exchangeRatesRepository } from '~/lib/repositories/exchangeRatesRepository';
import { itemsRepository } from '~/lib/repositories/itemsRepository';
import { monthlyBudgetsRepository } from '~/lib/repositories/monthlyBudgetsRepository';
import { monthlyWageRepository } from '~/lib/repositories/monthlyWageRepository';
import { recurringRulesRepository } from '~/lib/repositories/recurringRulesRepository';
import { settingsRepository } from '~/lib/repositories/settingsRepository';
import { transactionSplitsRepository } from '~/lib/repositories/transactionSplitsRepository';
import { transactionsRepository } from '~/lib/repositories/transactionsRepository';
import type { TransactionSentiment, WageConfig } from '~/types';

import {
  ACCOUNT_GROUP_ORDER,
  ACCOUNT_META,
  type AccountKey,
  type AccountRefs,
  CATEGORY_BLUEPRINT,
  type CategoryKey,
  type CategoryRefs,
  type PreviewAlbumSeed,
  type PreviewCareerJob,
  type PreviewProfile,
  type PreviewSeedProfile,
  type PreviewSeedSummary,
  type RandomFn,
} from './shared';

const PREVIEW_START_YEAR = 2025;
const PREVIEW_START_MONTH_INDEX = 0;
const WAGE_HISTORY_MONTHS = 48;

function createSeededRandom(seed: number): RandomFn {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function roundAmount(value: number) {
  return Math.round(value * 100) / 100;
}

function jitter(base: number, spread: number, random: RandomFn) {
  return roundAmount(base + (random() - 0.5) * spread * 2);
}

function clampDay(year: number, month: number, day: number) {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return Math.min(day, lastDay);
}

function monthStart(date: Date, offset = 0) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1, 12));
}

function compareMonthStarts(left: Date, right: Date) {
  return left.getTime() - right.getTime();
}

function getPreviewMonths() {
  const startMonth = new Date(Date.UTC(PREVIEW_START_YEAR, PREVIEW_START_MONTH_INDEX, 1, 12));
  const minimumEndMonth = new Date(Date.UTC(PREVIEW_START_YEAR, 11, 1, 12));
  const currentMonth = monthStart(new Date());
  const endMonth =
    compareMonthStarts(currentMonth, minimumEndMonth) > 0 ? currentMonth : minimumEndMonth;
  const months: Date[] = [];

  for (
    let cursor = startMonth;
    compareMonthStarts(cursor, endMonth) <= 0;
    cursor = monthStart(cursor, 1)
  ) {
    months.push(cursor);
  }

  return months;
}

function monthKey(date: Date) {
  return date.toISOString().slice(0, 7);
}

function monthIso(date: Date, day: number, hour = 12) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  return new Date(Date.UTC(year, month, clampDay(year, month, day), hour)).toISOString();
}

function pick<T>(items: readonly T[], random: RandomFn): T {
  return items[Math.floor(random() * items.length)] ?? items[0];
}

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function monthsBetween(current: Date, monthDate: Date) {
  return (
    (current.getUTCFullYear() - monthDate.getUTCFullYear()) * 12 +
    (current.getUTCMonth() - monthDate.getUTCMonth())
  );
}

// Resolve the job a person held `monthsAgo` months before now, walking the
// newest-first career list. Salary is flat within a job, so the value only
// changes at job boundaries — the whole point of the staircase.
export function wageConfigForMonthsAgo(career: PreviewCareerJob[], monthsAgo: number): WageConfig {
  let cursor = 0;
  for (let i = 0; i < career.length; i += 1) {
    const job = career[i];
    const isLast = i === career.length - 1;
    if (isLast || monthsAgo < cursor + job.durationMonths) {
      return {
        wageType: 'monthly',
        wageAmount: job.monthlySalary,
        hoursWorkedPerWeek: job.hoursWorkedPerWeek,
        workdaysPerWeek: 5,
        commuteMinutesPerWorkday: job.commuteMinutesPerWorkday,
      };
    }
    cursor += job.durationMonths;
  }
  // career is never empty; this keeps the return type non-optional.
  const fallback = career[career.length - 1];
  return {
    wageType: 'monthly',
    wageAmount: fallback.monthlySalary,
    hoursWorkedPerWeek: fallback.hoursWorkedPerWeek,
    workdaysPerWeek: 5,
    commuteMinutesPerWorkday: fallback.commuteMinutesPerWorkday,
  };
}

function purgePreviewData() {
  const db = getDb();
  db.delete(albumTransactionsTable).run();
  db.delete(albumsTable).run();
  db.delete(itemsTable).run();
  db.delete(monthlyBudgetCategoriesTable).run();
  db.delete(monthlyBudgetsTable).run();
  db.delete(budgetTemplateCategoriesTable).run();
  db.delete(budgetTemplatesTable).run();
  db.delete(transactionSplitsTable).run();
  db.delete(transactionsTable).run();
  db.delete(recurringRulesTable).run();
  db.delete(categoriesTable).run();
  db.delete(accountsTable).run();
  db.delete(accountGroupsTable).run();
  db.delete(monthlyWageSettingsTable).run();
  db.delete(exchangeRatesTable).run();
}

function createAccounts(profile: PreviewProfile): AccountRefs {
  ACCOUNT_GROUP_ORDER.forEach((groupKey, index) => {
    accountGroupsRepository.create(profile.accountGroups[groupKey], index);
  });

  const refs = {
    checking: createAccount(profile, 'checking'),
    savings: createAccount(profile, 'savings'),
    travel: createAccount(profile, 'travel'),
    card: createAccount(profile, 'card'),
    cash: createAccount(profile, 'cash'),
    brokerage: createAccount(profile, 'brokerage'),
  };

  const baseSortOrder = Object.keys(ACCOUNT_META).length;
  profile.extraAccounts.forEach((extra, index) => {
    accountsRepository.create({
      name: extra.name,
      type: extra.type,
      currency: profile.currencyCode,
      startingBalance: extra.startingBalance,
      includeInTotals: true,
      accountGroup: profile.accountGroups[extra.groupKey],
      creditStatementDay: null,
      creditDueDay: null,
      sortOrder: baseSortOrder + index,
      logoId: extra.logoId,
    });
  });

  return refs;
}

function createAccount(profile: PreviewProfile, key: AccountKey) {
  const account = profile.accounts[key];
  const meta = ACCOUNT_META[key];
  return accountsRepository.create({
    name: account.name,
    type: meta.type,
    currency: profile.currencyCode,
    startingBalance: account.startingBalance,
    includeInTotals: true,
    accountGroup: profile.accountGroups[meta.groupKey],
    creditStatementDay: meta.creditStatementDay,
    creditDueDay: meta.creditDueDay,
    sortOrder: meta.sortOrder,
    logoId: account.logoId,
  });
}

function createCategories(profile: PreviewProfile): CategoryRefs {
  const ids = {} as CategoryRefs;

  CATEGORY_BLUEPRINT.forEach((item) => {
    ids[item.key as CategoryKey] = categoriesRepository.create({
      name: profile.categories[item.key as CategoryKey],
      type: item.type,
      icon: item.icon,
      parentId: item.parentKey ? (ids[item.parentKey as CategoryKey] ?? null) : null,
      isDefault: false,
    });
  });

  return ids;
}

// Salary steps up only at job changes and stays flat in between, so the derived
// hourly-value chart reads as a clean staircase of real raises. Hours are flat
// and the commute drops at the newest job, so the *true* hourly rate climbs a
// touch faster than gross pay right at the end of the history.
function seedWageHistory(profile: PreviewProfile) {
  const currentMonth = monthStart(new Date());

  for (let index = 0; index < WAGE_HISTORY_MONTHS; index += 1) {
    const monthsAgo = WAGE_HISTORY_MONTHS - 1 - index;
    const monthDate = monthStart(currentMonth, -monthsAgo);
    const config = wageConfigForMonthsAgo(profile.career, monthsAgo);
    monthlyWageRepository.saveForMonth(monthKey(monthDate), config);
  }
}

function seedRecurringRules(
  profile: PreviewProfile,
  accounts: AccountRefs,
  categories: CategoryRefs,
) {
  const nextMonth = monthStart(new Date(), 1);
  const recurring = profile.recurring;
  // Keep the auto-run paycheck in step with the current job's salary so the
  // recurring rule matches the monthly income rows the seed writes.
  const currentSalary = wageConfigForMonthsAgo(profile.career, 0).wageAmount;

  recurringRulesRepository.create({
    name: recurring.salary.name,
    type: 'income',
    amount: currentSalary,
    currency: profile.currencyCode,
    accountId: accounts.checking,
    categoryId: categories.salary,
    note: recurring.salary.note,
    recurrencePattern: 'monthly',
    nextRunDate: monthIso(nextMonth, 1, 10),
  });

  recurringRulesRepository.create({
    name: recurring.rent.name,
    type: 'expense',
    amount: recurring.rent.amount,
    currency: profile.currencyCode,
    accountId: accounts.checking,
    categoryId: categories.rent,
    note: recurring.rent.note,
    recurrencePattern: 'monthly',
    nextRunDate: monthIso(nextMonth, 2, 9),
  });

  recurringRulesRepository.create({
    name: recurring.fitness.name,
    type: 'expense',
    amount: recurring.fitness.amount,
    currency: profile.currencyCode,
    accountId: accounts.checking,
    categoryId: categories.fitness,
    note: recurring.fitness.note,
    recurrencePattern: 'monthly',
    nextRunDate: monthIso(nextMonth, 12, 9),
  });

  recurring.subscriptions.forEach((subscription, index) => {
    recurringRulesRepository.create({
      name: subscription.name,
      type: 'expense',
      amount: subscription.amount,
      currency: profile.currencyCode,
      accountId: accounts.card,
      categoryId: categories.subscriptions,
      note: subscription.note,
      recurrencePattern: 'monthly',
      nextRunDate: monthIso(nextMonth, 5 + index * 2, 9),
    });
  });

  recurringRulesRepository.create({
    name: recurring.investment.name,
    type: 'transfer',
    amount: recurring.investment.amount,
    currency: profile.currencyCode,
    fromAccountId: accounts.checking,
    toAccountId: accounts.brokerage,
    note: recurring.investment.note,
    recurrencePattern: 'monthly',
    nextRunDate: monthIso(nextMonth, 18, 9),
  });

  // salary + rent + fitness + investment + one rule per subscription service
  return 4 + recurring.subscriptions.length;
}

function randomSentiment(type: string, random: RandomFn): TransactionSentiment {
  const r = random();
  if (type === 'income') {
    if (r < 0.55) return 'happy';
    if (r < 0.85) return 'neutral';
    return 'sad';
  }
  if (type === 'expense') {
    if (r < 0.25) return 'happy';
    if (r < 0.6) return 'neutral';
    return 'sad';
  }
  return 'neutral';
}

interface PreviewTrip {
  date: Date;
  transactionIds: string[];
}

// Hands out the same seeded receipt relative path a bounded number of times, so
// a handful of transactions carry a receipt image without every row doing so.
interface ReceiptAttacher {
  next: () => string | null;
  used: () => number;
}

function makeReceiptAttacher(relativePath: string | null | undefined, max = 10): ReceiptAttacher {
  let used = 0;
  return {
    next: () => {
      if (!relativePath || used >= max) return null;
      used += 1;
      return relativePath;
    },
    used: () => used,
  };
}

function seedTransactions(
  profile: PreviewProfile,
  accounts: AccountRefs,
  categories: CategoryRefs,
  receipts: ReceiptAttacher,
): { count: number; trips: PreviewTrip[] } {
  const random = createSeededRandom(profile.seed);
  const previewMonths = getPreviewMonths();
  const {
    merchants,
    notes,
    subscriptions,
    income,
    housing,
    weekly,
    lifestyle,
    transfers,
    travel,
    extras,
  } = profile.transactions;
  const subscriptionTotal = subscriptions.reduce((sum, amount) => sum + amount, 0);
  const currentMonth = monthStart(new Date());

  // Pair each album (defined newest-first) with one of the most recent travel
  // months, mirroring seedAlbums' pairing. This lets the trip's flight/hotel/
  // dining rows be seeded in the destination's local currency so the album card
  // and insights show genuine foreign-currency spend converted to reporting.
  const tripMonths = previewMonths.filter((month) => travel.months.includes(month.getUTCMonth()));
  const albumTripMonths = tripMonths.slice(-profile.albums.length).reverse();
  const albumByMonthTime = new Map<number, PreviewAlbumSeed>();
  profile.albums.forEach((album, albumIndex) => {
    const month = albumTripMonths[albumIndex];
    if (month) albumByMonthTime.set(month.getTime(), album);
  });

  let transactionCount = 0;
  // Trip spend grouped by travel month, so albums can be linked to the actual
  // flight/hotel/dining transactions afterwards.
  const trips: PreviewTrip[] = [];

  const add = (
    input: Parameters<typeof transactionsRepository.create>[0],
    multiplier = 1,
  ): string => {
    // Auto-freeze the reporting snapshot for domestic income/expense so every
    // seeded row carries a real reportingCurrency/reportingAmount/fxRate (as the
    // live app does at write time). Rows that already set reportingCurrency
    // (foreign-currency trip spend) pass through untouched; transfers and
    // balance adjustments intentionally keep null snapshots.
    const needsSnapshot =
      (input.type === 'income' || input.type === 'expense') && input.reportingCurrency == null;
    const withSnapshot = needsSnapshot
      ? {
          ...input,
          reportingCurrency: profile.currencyCode,
          reportingAmount: input.amount,
          fxRate: 1,
        }
      : input;

    let lastId = '';
    for (let index = 0; index < multiplier; index += 1) {
      lastId = transactionsRepository.create({
        ...withSnapshot,
        sentiment: input.sentiment ?? randomSentiment(input.type, random),
      });
      transactionCount += 1;
    }
    return lastId;
  };

  // Turn a reporting-currency amount into the fields for a trip row spent in a
  // foreign currency: `amount` in local units, plus the frozen snapshot. When
  // the trip currency equals the reporting currency it stays domestic.
  const foreignTripSpend = (reportingValue: number, album: PreviewAlbumSeed | undefined) => {
    const reportingAmount = roundAmount(reportingValue);
    if (!album || album.currencyCode === profile.currencyCode) {
      return {
        amount: reportingAmount,
        currency: profile.currencyCode,
        reportingCurrency: profile.currencyCode,
        reportingAmount,
        fxRate: 1,
        // Trip accounts are in the reporting currency, so account math uses
        // `amount` directly (accountAmount stays null).
        accountAmount: null as number | null,
      };
    }
    const localAmount = roundAmount(reportingAmount * album.fxRate);
    return {
      amount: localAmount,
      currency: album.currencyCode,
      reportingCurrency: profile.currencyCode,
      reportingAmount,
      fxRate: localAmount > 0 ? reportingAmount / localAmount : 1,
      // Account is in the reporting currency but the row is foreign, so freeze
      // the account-currency value explicitly.
      accountAmount: reportingAmount,
    };
  };

  for (let index = 0; index < previewMonths.length; index += 1) {
    const monthDate = previewMonths[index];
    if (!monthDate) continue;

    // Only attach receipts in the last couple of months, so the receipt images
    // show up on the transactions a screenshot is most likely to land on.
    const isRecentMonth = index >= previewMonths.length - 2;

    const monthNumber = monthDate.getUTCMonth();
    const salaryAmount = wageConfigForMonthsAgo(
      profile.career,
      monthsBetween(currentMonth, monthDate),
    ).wageAmount;
    const freelanceAmount = jitter(
      income.freelanceBase + index * income.freelanceGrowth,
      income.freelanceSpread,
      random,
    );
    const consultingAmount = jitter(
      income.consultingBase + (index % 3) * income.consultingStep,
      income.consultingSpread,
      random,
    );

    add({
      type: 'income',
      amount: salaryAmount,
      currency: profile.currencyCode,
      date: monthIso(monthDate, 1, 10),
      accountId: accounts.checking,
      categoryId: categories.salary,
      note: notes.salary,
    });

    if (index % 6 === 2 || index % 6 === 5) {
      add({
        type: 'income',
        amount: jitter(income.bonusBase + index * income.bonusGrowth, income.bonusSpread, random),
        currency: profile.currencyCode,
        date: monthIso(monthDate, 15, 10),
        accountId: accounts.checking,
        categoryId: categories.bonus,
        note: notes.bonus,
      });
    }

    add({
      type: 'income',
      amount: freelanceAmount,
      currency: profile.currencyCode,
      date: monthIso(monthDate, 11 + (index % 4), 10),
      accountId: accounts.checking,
      categoryId: categories.freelance,
      note: notes.freelance,
    });

    if (index % 2 === 0) {
      add({
        type: 'income',
        amount: consultingAmount,
        currency: profile.currencyCode,
        date: monthIso(monthDate, 22 - (index % 3), 10),
        accountId: accounts.checking,
        categoryId: categories.consulting,
        note: notes.consulting,
      });
    }

    if (index % 3 === 1) {
      add({
        type: 'income',
        amount: jitter(
          income.dividendsBase + index * income.dividendsGrowth,
          income.dividendsSpread,
          random,
        ),
        currency: profile.currencyCode,
        date: monthIso(monthDate, 20, 10),
        accountId: accounts.brokerage,
        categoryId: categories.dividends,
        note: notes.dividends,
      });
    }

    add({
      type: 'income',
      amount: jitter(
        income.interestBase + index * income.interestGrowth,
        income.interestSpread,
        random,
      ),
      currency: profile.currencyCode,
      date: monthIso(monthDate, 27, 10),
      accountId: accounts.savings,
      categoryId: categories.interest,
      note: notes.interest,
    });

    add({
      type: 'expense',
      amount: jitter(housing.rentBase + index * housing.rentGrowth, housing.rentSpread, random),
      currency: profile.currencyCode,
      date: monthIso(monthDate, 2, 9),
      accountId: accounts.checking,
      categoryId: categories.rent,
      note: notes.rent,
    });

    add({
      type: 'expense',
      amount: jitter(housing.utilitiesBase, housing.utilitiesSpread, random),
      currency: profile.currencyCode,
      date: monthIso(monthDate, 5, 9),
      accountId: accounts.checking,
      categoryId: categories.utilities,
      note: notes.utilities,
    });

    add({
      type: 'expense',
      amount: jitter(housing.internetBase, housing.internetSpread, random),
      currency: profile.currencyCode,
      date: monthIso(monthDate, 7, 9),
      accountId: accounts.checking,
      categoryId: categories.internet,
      note: notes.internet,
    });

    add({
      type: 'expense',
      amount: jitter(housing.fitnessBase, housing.fitnessSpread, random),
      currency: profile.currencyCode,
      date: monthIso(monthDate, 12, 9),
      accountId: accounts.checking,
      categoryId: categories.fitness,
      note: notes.fitness,
    });

    add({
      type: 'expense',
      amount: jitter(housing.homeSuppliesBase, housing.homeSuppliesSpread, random),
      currency: profile.currencyCode,
      date: monthIso(monthDate, 23, 9),
      accountId: accounts.checking,
      categoryId: categories.home_supplies,
      note: notes.homeSupplies,
    });

    add({
      type: 'expense',
      amount: subscriptions[0],
      currency: profile.currencyCode,
      date: monthIso(monthDate, 9, 9),
      accountId: accounts.card,
      categoryId: categories.subscriptions,
      note: notes.subscriptions[0],
    });

    add({
      type: 'expense',
      amount: subscriptions[1],
      currency: profile.currencyCode,
      date: monthIso(monthDate, 11, 9),
      accountId: accounts.card,
      categoryId: categories.subscriptions,
      note: notes.subscriptions[1],
    });

    add({
      type: 'expense',
      amount: subscriptions[2],
      currency: profile.currencyCode,
      date: monthIso(monthDate, 13, 9),
      accountId: accounts.card,
      categoryId: categories.subscriptions,
      note: notes.subscriptions[2],
    });

    let creditSpend = subscriptionTotal;

    if (index % 3 === 0) {
      add({
        type: 'expense',
        amount: jitter(housing.healthcareBase, housing.healthcareSpread, random),
        currency: profile.currencyCode,
        date: monthIso(monthDate, 18, 10),
        accountId: accounts.checking,
        categoryId: categories.healthcare,
        note: pick(merchants.healthcare, random),
        receiptUri: isRecentMonth ? receipts.next() : null,
      });
    }

    if (index % 4 === 1) {
      const educationAmount = jitter(housing.educationBase, housing.educationSpread, random);
      add({
        type: 'expense',
        amount: educationAmount,
        currency: profile.currencyCode,
        date: monthIso(monthDate, 21, 10),
        accountId: accounts.card,
        categoryId: categories.education,
        note: notes.education,
      });
      creditSpend += educationAmount;
    }

    const weekCount = index % 2 === 0 ? 4 : 5;
    const cashTopUpAmount = jitter(
      weekCount === 5 ? weekly.cashTopUpFiveWeek : weekly.cashTopUpFourWeek,
      weekly.cashTopUpSpread,
      random,
    );

    add({
      type: 'transfer',
      amount: cashTopUpAmount,
      currency: profile.currencyCode,
      date: monthIso(monthDate, 2, 7),
      fromAccountId: accounts.checking,
      toAccountId: accounts.cash,
      note: notes.atmWithdrawal,
    });

    for (let week = 0; week < weekCount; week += 1) {
      const groceryAmount = jitter(
        weekly.groceryBase + week * weekly.groceryWeekStep,
        weekly.grocerySpread,
        random,
      );
      const diningAmount = jitter(
        weekly.diningBase + week * weekly.diningWeekStep,
        weekly.diningSpread,
        random,
      );
      const coffeeAmount = jitter(weekly.coffeeBase, weekly.coffeeSpread, random);
      const fuelAmount = jitter(weekly.fuelBase, weekly.fuelSpread, random);

      add({
        type: 'expense',
        amount: groceryAmount,
        currency: profile.currencyCode,
        date: monthIso(monthDate, 4 + week * 6, 11),
        accountId: accounts.card,
        categoryId: categories.groceries,
        note: pick(merchants.grocery, random),
        receiptUri: isRecentMonth && week === 0 ? receipts.next() : null,
      });
      creditSpend += groceryAmount;

      add({
        type: 'expense',
        amount: diningAmount,
        currency: profile.currencyCode,
        date: monthIso(monthDate, 6 + week * 6, 19),
        accountId: accounts.card,
        categoryId: categories.dining,
        note: pick(merchants.dining, random),
        receiptUri: isRecentMonth && week === 0 ? receipts.next() : null,
      });
      creditSpend += diningAmount;

      add({
        type: 'expense',
        amount: coffeeAmount,
        currency: profile.currencyCode,
        date: monthIso(monthDate, 2 + week * 6, 8),
        accountId: accounts.cash,
        categoryId: categories.coffee,
        note: pick(merchants.coffee, random),
      });

      if (week < 3 || index % 3 === 0) {
        add({
          type: 'expense',
          amount: fuelAmount,
          currency: profile.currencyCode,
          date: monthIso(monthDate, 7 + week * 6, 18),
          accountId: accounts.card,
          categoryId: categories.fuel,
          note: pick(merchants.fuel, random),
        });
        creditSpend += fuelAmount;
      }

      if (week % 2 === 0) {
        add({
          type: 'expense',
          amount: jitter(weekly.parkingPrimaryBase, weekly.parkingPrimarySpread, random),
          currency: profile.currencyCode,
          date: monthIso(monthDate, 8 + week * 6, 18),
          accountId: accounts.cash,
          categoryId: categories.parking,
          note: notes.parkingPrimary,
        });
      } else {
        add({
          type: 'expense',
          amount: jitter(weekly.parkingAlternateBase, weekly.parkingAlternateSpread, random),
          currency: profile.currencyCode,
          date: monthIso(monthDate, 8 + week * 6, 18),
          accountId: accounts.cash,
          categoryId: categories.parking,
          note: notes.parkingAlternate,
        });
      }
    }

    const shoppingTrips = 1 + (index % 3);
    for (let trip = 0; trip < shoppingTrips; trip += 1) {
      const shoppingAmount = jitter(
        lifestyle.shoppingBase + trip * lifestyle.shoppingTripStep,
        lifestyle.shoppingSpread,
        random,
      );
      add({
        type: 'expense',
        amount: shoppingAmount,
        currency: profile.currencyCode,
        date: monthIso(monthDate, 10 + trip * 5, 16),
        accountId: accounts.card,
        categoryId: categories.shopping,
        note: pick(merchants.shopping, random),
        receiptUri: isRecentMonth && trip === 0 ? receipts.next() : null,
      });
      creditSpend += shoppingAmount;
    }

    const entertainmentTrips = 1 + (index % 4 === 0 ? 1 : 0);
    for (let trip = 0; trip < entertainmentTrips; trip += 1) {
      const entertainmentAmount = jitter(
        lifestyle.entertainmentBase + trip * lifestyle.entertainmentTripStep,
        lifestyle.entertainmentSpread,
        random,
      );
      add({
        type: 'expense',
        amount: entertainmentAmount,
        currency: profile.currencyCode,
        date: monthIso(monthDate, 17 + trip * 6, 20),
        accountId: accounts.card,
        categoryId: categories.entertainment,
        note: pick(merchants.entertainment, random),
      });
      creditSpend += entertainmentAmount;
    }

    if (index % 2 === 1) {
      const rideshareAmount = jitter(lifestyle.rideshareBase, lifestyle.rideshareSpread, random);
      add({
        type: 'expense',
        amount: rideshareAmount,
        currency: profile.currencyCode,
        date: monthIso(monthDate, 19, 21),
        accountId: accounts.card,
        categoryId: categories.rideshare,
        note: pick(merchants.rideshare, random),
      });
      creditSpend += rideshareAmount;
    }

    add({
      type: 'transfer',
      amount: jitter(
        transfers.savingsBase + index * transfers.savingsGrowth,
        transfers.savingsSpread,
        random,
      ),
      currency: profile.currencyCode,
      date: monthIso(monthDate, 3, 10),
      fromAccountId: accounts.checking,
      toAccountId: accounts.savings,
      note: notes.savingsTransfer,
    });

    add({
      type: 'transfer',
      amount: jitter(
        transfers.investmentBase + index * transfers.investmentGrowth,
        transfers.investmentSpread,
        random,
      ),
      currency: profile.currencyCode,
      date: monthIso(monthDate, 18, 10),
      fromAccountId: accounts.checking,
      toAccountId: accounts.brokerage,
      note: notes.investmentTransfer,
    });

    add({
      type: 'transfer',
      amount: jitter(
        travel.months.includes(monthNumber) ? transfers.travelPeak : transfers.travelBase,
        transfers.travelSpread,
        random,
      ),
      currency: profile.currencyCode,
      date: monthIso(monthDate, 20, 10),
      fromAccountId: accounts.checking,
      toAccountId: accounts.travel,
      note: notes.travelTopUp,
    });

    if (travel.months.includes(monthNumber)) {
      const album = albumByMonthTime.get(monthDate.getTime());

      const flightsId = add({
        type: 'expense',
        ...foreignTripSpend(jitter(travel.flightsBase, travel.flightsSpread, random), album),
        date: monthIso(monthDate, 8, 11),
        accountId: accounts.travel,
        categoryId: categories.flights,
        note: pick(merchants.flights, random),
      });

      const hotelsId = add({
        type: 'expense',
        ...foreignTripSpend(jitter(travel.hotelsBase, travel.hotelsSpread, random), album),
        date: monthIso(monthDate, 10, 11),
        accountId: accounts.travel,
        categoryId: categories.hotels,
        note: pick(merchants.hotels, random),
      });

      const localTransitId = add({
        type: 'expense',
        ...foreignTripSpend(
          jitter(travel.localTransitBase, travel.localTransitSpread, random),
          album,
        ),
        date: monthIso(monthDate, 11, 11),
        accountId: accounts.travel,
        categoryId: categories.local_travel,
        note: notes.localTravel,
      });

      const tripDining = foreignTripSpend(
        jitter(travel.diningBase, travel.diningSpread, random),
        album,
      );
      const tripDiningId = add({
        type: 'expense',
        ...tripDining,
        date: monthIso(monthDate, 12, 19),
        accountId: accounts.card,
        categoryId: categories.dining,
        note: notes.tripDining,
      });
      // The card is billed in the reporting currency, so the amount owed uses
      // the reporting value, not the foreign face value.
      creditSpend += tripDining.reportingAmount;

      trips.push({
        date: monthDate,
        transactionIds: [flightsId, hotelsId, localTransitId, tripDiningId],
      });
    }

    if (monthNumber === travel.giftMonth) {
      const holidayGiftAmount = jitter(travel.holidayGiftsBase, travel.holidayGiftsSpread, random);
      add({
        type: 'expense',
        amount: holidayGiftAmount,
        currency: profile.currencyCode,
        date: monthIso(monthDate, 16, 15),
        accountId: accounts.card,
        categoryId: categories.gifts,
        note: notes.holidayGifts,
      });
      creditSpend += holidayGiftAmount;

      add({
        type: 'expense',
        amount: jitter(travel.familyCelebrationBase, travel.familyCelebrationSpread, random),
        currency: profile.currencyCode,
        date: monthIso(monthDate, 22, 18),
        accountId: accounts.checking,
        categoryId: categories.gifts,
        note: notes.familyCelebration,
      });
    }

    if (extras) {
      for (let n = 0; n < extras.weekendBrunchCount; n += 1) {
        const brunchAmount = jitter(extras.weekendBrunchBase, extras.weekendBrunchSpread, random);
        add({
          type: 'expense',
          amount: brunchAmount,
          currency: profile.currencyCode,
          date: monthIso(monthDate, 6 + n * 7, 11),
          accountId: accounts.card,
          categoryId: categories.dining,
          note:
            pick(extras.weekendBrunchMerchants, random) +
            (extras.weekendBrunchNote ? ` · ${extras.weekendBrunchNote}` : ''),
        });
        creditSpend += brunchAmount;
      }

      for (let n = 0; n < extras.bubbleTeaCount; n += 1) {
        add({
          type: 'expense',
          amount: jitter(extras.bubbleTeaBase, extras.bubbleTeaSpread, random),
          currency: profile.currencyCode,
          date: monthIso(monthDate, 3 + n * 5, 15),
          accountId: accounts.cash,
          categoryId: categories.coffee,
          note: pick(extras.bubbleTeaMerchants, random),
        });
      }

      const hangoutAmount = jitter(extras.hangoutBase, extras.hangoutSpread, random);
      add({
        type: 'expense',
        amount: hangoutAmount,
        currency: profile.currencyCode,
        date: monthIso(monthDate, 14 + (index % 4), 22),
        accountId: accounts.card,
        categoryId: categories.entertainment,
        note:
          pick(extras.hangoutMerchants, random) +
          (extras.hangoutNote ? ` · ${extras.hangoutNote}` : ''),
      });
      creditSpend += hangoutAmount;

      for (let n = 0; n < extras.deliveryCount; n += 1) {
        const deliveryAmount = jitter(extras.deliveryBase, extras.deliverySpread, random);
        add({
          type: 'expense',
          amount: deliveryAmount,
          currency: profile.currencyCode,
          date: monthIso(monthDate, 5 + n * 6, 22),
          accountId: accounts.card,
          categoryId: categories.dining,
          note:
            pick(extras.deliveryMerchants, random) +
            (extras.deliveryNote ? ` · ${extras.deliveryNote}` : ''),
        });
        creditSpend += deliveryAmount;
      }

      for (let n = 0; n < extras.rideshareExtraCount; n += 1) {
        const rideAmount = jitter(extras.rideshareExtraBase, extras.rideshareExtraSpread, random);
        add({
          type: 'expense',
          amount: rideAmount,
          currency: profile.currencyCode,
          date: monthIso(monthDate, 9 + n * 7, 22),
          accountId: accounts.card,
          categoryId: categories.rideshare,
          note: pick(merchants.rideshare, random),
        });
        creditSpend += rideAmount;
      }

      for (let n = 0; n < extras.convenienceCount; n += 1) {
        add({
          type: 'expense',
          amount: jitter(extras.convenienceBase, extras.convenienceSpread, random),
          currency: profile.currencyCode,
          date: monthIso(monthDate, 2 + n * 5, 21),
          accountId: accounts.cash,
          categoryId: categories.home_supplies,
          note: pick(extras.convenienceMerchants, random),
        });
      }
    }

    add({
      type: 'transfer',
      amount: roundAmount(creditSpend * transfers.cardPaymentRatio),
      currency: profile.currencyCode,
      date: monthIso(monthDate, 26, 10),
      fromAccountId: accounts.checking,
      toAccountId: accounts.card,
      note: notes.cardPayment,
    });
  }

  return { count: transactionCount, trips };
}

function seedAlbums(profile: PreviewProfile, trips: PreviewTrip[]) {
  if (profile.albums.length === 0 || trips.length === 0) return 0;

  // Pair albums (defined newest-first) with the most recent trips, newest first,
  // so each album card surfaces real flight/hotel/dining spend and its pin lands
  // on the destination.
  const recentTrips = trips.slice(-profile.albums.length).reverse();
  let created = 0;

  profile.albums.forEach((seed, index) => {
    const trip = recentTrips[index];
    if (!trip) return;

    const albumId = albumsRepository.create({
      name: seed.name,
      startDate: monthIso(trip.date, 7, 9),
      endDate: monthIso(trip.date, 13, 21),
      latitude: seed.latitude,
      longitude: seed.longitude,
      placeName: seed.placeName,
      placeAdmin: seed.placeAdmin,
      countryCode: seed.countryCode,
      sortOrder: index,
    });
    albumsRepository.addTransactions(albumId, trip.transactionIds);
    created += 1;
  });

  return created;
}

function seedItems(profile: PreviewProfile) {
  const currentMonth = monthStart(new Date());

  profile.items.forEach((seed, index) => {
    const purchaseMonth = monthStart(currentMonth, -seed.purchaseMonthsAgo);
    const endDate =
      seed.retiredMonthsAgo != null
        ? monthIso(monthStart(currentMonth, -seed.retiredMonthsAgo), seed.purchaseDay, 12)
        : null;

    itemsRepository.create({
      name: seed.name,
      iconId: seed.iconId,
      purchasePrice: seed.purchasePrice,
      currency: profile.currencyCode,
      purchaseDate: monthIso(purchaseMonth, seed.purchaseDay, 12),
      endDate,
      salePrice: seed.salePrice ?? null,
      note: seed.note ?? null,
      sortOrder: index,
    });
  });

  return profile.items.length;
}

// Seed shared bills: one expense you fronted, split into per-person shares.
// Paid participants get a `paidAt` a few days after the bill so the split-bill
// summary shows a mix of settled and still-owed amounts.
function seedSplits(
  profile: PreviewProfile,
  accounts: AccountRefs,
  categories: CategoryRefs,
  receipts: ReceiptAttacher,
) {
  const currentMonth = monthStart(new Date());

  profile.splits.forEach((split) => {
    const billMonth = monthStart(currentMonth, -split.monthsAgo);
    const total = roundAmount(
      split.selfShare + split.participants.reduce((sum, person) => sum + person.share, 0),
    );

    const transactionId = transactionsRepository.create({
      type: 'expense',
      amount: total,
      currency: profile.currencyCode,
      reportingCurrency: profile.currencyCode,
      reportingAmount: total,
      fxRate: 1,
      date: monthIso(billMonth, split.day, 20),
      accountId: accounts[split.account],
      categoryId: categories[split.categoryKey],
      note: split.note,
      sentiment: 'happy',
      receiptUri: receipts.next(),
    });

    // Your own share sits first and is never "owed".
    transactionSplitsRepository.create({
      transactionId,
      personName: null,
      amount: roundAmount(split.selfShare),
      isSelf: true,
      sortOrder: 0,
    });

    split.participants.forEach((person, index) => {
      transactionSplitsRepository.create({
        transactionId,
        personName: person.name,
        amount: roundAmount(person.share),
        isSelf: false,
        paidAt: person.paid ? monthIso(billMonth, Math.min(split.day + 3, 28), 12) : null,
        sortOrder: index + 1,
      });
    });
  });

  return profile.splits.length;
}

// Distinct foreign currencies this profile actually spends in abroad (its trip
// destinations), so the FX table and the tracked-currencies list are populated.
function foreignCurrencyCodes(profile: PreviewProfile): string[] {
  const seen = new Set<string>();
  const codes: string[] = [];
  profile.albums.forEach((album) => {
    if (album.currencyCode === profile.currencyCode || seen.has(album.currencyCode)) return;
    seen.add(album.currencyCode);
    codes.push(album.currencyCode);
  });
  return codes;
}

// Seed the reporting-currency rate table so foreign trip rows resolve to a real
// converted value (the app loads rates via listByBase(reportingCurrency)).
function seedExchangeRates(profile: PreviewProfile) {
  const asOf = dayKey(new Date());
  profile.albums.forEach((album) => {
    if (album.currencyCode === profile.currencyCode) return;
    exchangeRatesRepository.upsert(
      profile.currencyCode,
      album.currencyCode,
      album.fxRate,
      asOf,
      'api',
    );
  });
}

// Budgets are seeded through the repositories, which open their own SQLite
// transactions — so this must run *after* the main seed transaction commits
// (SQLite has no nested transactions). Creates one template and freezes the
// last `monthsToSeed` months from it so the budget view shows lived-in history.
function createBudgetTemplate(config: PreviewProfile['budgets'], categories: CategoryRefs) {
  const allocations = config.allocations.map((allocation) => ({
    categoryId: categories[allocation.categoryKey],
    amount: allocation.amount,
  }));

  const templateId = budgetTemplatesRepository.create({
    name: config.templateName,
    emoji: config.templateEmoji,
    totalAmount: config.totalAmount,
    countUnbudgeted: true,
    allocations,
  });

  return budgetTemplatesRepository.list().find((item) => item.id === templateId) ?? null;
}

function seedBudgets(profile: PreviewProfile, categories: CategoryRefs): number {
  const config = profile.budgets;
  const template = createBudgetTemplate(config, categories);

  // A second, un-frozen template so the template picker shows more than one row.
  if (profile.secondBudget) {
    createBudgetTemplate(profile.secondBudget, categories);
  }

  if (!template) return 0;

  const currentMonth = monthStart(new Date());
  const months: string[] = [];
  for (let offset = config.monthsToSeed - 1; offset >= 0; offset -= 1) {
    months.push(monthKey(monthStart(currentMonth, -offset)));
  }

  return monthlyBudgetsRepository.createManyFromTemplate(months, template).length;
}

export function seedProfile(
  profileName: PreviewSeedProfile,
  profile: PreviewProfile,
  receiptRelativePath?: string | null,
): PreviewSeedSummary {
  const sqlite = getSQLite();

  // Reporting currency + the foreign currencies spent abroad, so the FX picker
  // in settings is populated for screenshots.
  const trackedCurrencies = [profile.currencyCode, ...foreignCurrencyCodes(profile)];
  // One seeded receipt image, reused across a handful of transactions.
  const receipts = makeReceiptAttacher(receiptRelativePath);

  sqlite.execSync('BEGIN');
  let seededCategories: CategoryRefs;
  let summary: Omit<PreviewSeedSummary, 'budgets'>;
  try {
    purgePreviewData();
    settingsRepository.updateSettings({
      onboardingCompleted: true,
      userMode: 'power',
      locale: profile.locale,
      currencyCode: profile.currencyCode,
      currencySymbol: profile.currencySymbol,
      profileName: profile.profileName,
      fxCurrenciesJson: JSON.stringify(trackedCurrencies),
    });
    settingsRepository.updateInsightsPreferencesJson(null);

    const accounts = createAccounts(profile);
    const categories = createCategories(profile);
    seededCategories = categories;
    seedExchangeRates(profile);
    seedWageHistory(profile);
    const { count: transactions, trips } = seedTransactions(
      profile,
      accounts,
      categories,
      receipts,
    );
    const recurringRules = seedRecurringRules(profile, accounts, categories);
    const albums = seedAlbums(profile, trips);
    const items = seedItems(profile);
    const splits = seedSplits(profile, accounts, categories, receipts);

    sqlite.execSync('COMMIT');

    summary = {
      profile: profileName,
      locale: profile.locale,
      accounts: Object.keys(accounts).length + profile.extraAccounts.length,
      categories: Object.keys(categories).length,
      recurringRules,
      transactions,
      wageMonths: WAGE_HISTORY_MONTHS,
      albums,
      items,
      splits,
      receipts: receipts.used(),
    };
  } catch (error) {
    sqlite.execSync('ROLLBACK');
    throw error;
  }

  // Budgets run outside the main transaction: their repositories manage their
  // own transactions and SQLite has no nested transactions.
  const budgets = seedBudgets(profile, seededCategories);

  return { ...summary, budgets };
}
