import { and, desc, eq, isNull, ne, or } from 'drizzle-orm';

import { getDb } from '~/lib/db/client';
import { monthlyWageSettingsTable } from '~/lib/db/schema';
import type { MonthlyWageSettings, WageConfig } from '~/types';
import { newId, nowIso } from '~/utils/id';
import {
  computeHourlyRates,
  monthKeyFromDateIso,
  monthKeyFromDateLocal,
  normalizeMonthKey,
} from '~/utils/formatters';
import { toMonthlyWageSettings } from './mappers';

function getCurrentMonthKey(date = new Date()) {
  return monthKeyFromDateLocal(date);
}

function monthKeyVariants(month: string) {
  const normalized = normalizeMonthKey(month);
  const match = normalized.match(/^(\d{4})-(\d{2})$/);
  if (!match) return [normalized];

  const year = match[1];
  const legacy = `${year}-${Number(match[2])}`;
  return legacy === normalized ? [normalized] : [normalized, legacy];
}

function buildMonthCondition(month: string) {
  const variants = monthKeyVariants(month);
  if (variants.length > 1) {
    return or(
      eq(monthlyWageSettingsTable.month, variants[0] ?? ''),
      eq(monthlyWageSettingsTable.month, variants[1] ?? ''),
    );
  }

  return eq(monthlyWageSettingsTable.month, variants[0] ?? '');
}

function normalizeAndDedupe(rows: MonthlyWageSettings[]) {
  const byMonth = new Map<string, MonthlyWageSettings>();

  rows.forEach((row) => {
    const normalizedMonth = normalizeMonthKey(row.month);
    const normalizedRow = normalizedMonth === row.month ? row : { ...row, month: normalizedMonth };
    const existing = byMonth.get(normalizedMonth);
    if (!existing || normalizedRow.updatedAt > existing.updatedAt) {
      byMonth.set(normalizedMonth, normalizedRow);
    }
  });

  return Array.from(byMonth.values()).sort((a, b) => b.month.localeCompare(a.month));
}

class MonthlyWageRepository {
  list() {
    const db = getDb();
    const rows = db
      .select()
      .from(monthlyWageSettingsTable)
      .where(isNull(monthlyWageSettingsTable.deletedAt))
      .orderBy(desc(monthlyWageSettingsTable.month))
      .all()
      .map(toMonthlyWageSettings);
    return normalizeAndDedupe(rows);
  }

  getByMonth(month: string): MonthlyWageSettings | null {
    const db = getDb();
    const normalizedMonth = normalizeMonthKey(month);
    const row = db
      .select()
      .from(monthlyWageSettingsTable)
      .where(and(buildMonthCondition(normalizedMonth), isNull(monthlyWageSettingsTable.deletedAt)))
      .orderBy(desc(monthlyWageSettingsTable.updatedAt))
      .get();

    if (!row) return null;

    const mapped = toMonthlyWageSettings(row);
    return normalizeMonthKey(mapped.month) === mapped.month
      ? mapped
      : { ...mapped, month: normalizeMonthKey(mapped.month) };
  }

  getMostRecent(): MonthlyWageSettings | null {
    return this.list()[0] ?? null;
  }

  ensureCurrentMonthRecord() {
    const month = getCurrentMonthKey();
    const existing = this.getByMonth(month);
    if (existing) return existing;

    const mostRecent = this.getMostRecent();
    const fallback: WageConfig = {
      wageType: mostRecent?.wageType ?? 'monthly',
      wageAmount: mostRecent?.wageAmount ?? 0,
      hoursWorkedPerWeek: mostRecent?.hoursWorkedPerWeek ?? 40,
      workdaysPerWeek: mostRecent?.workdaysPerWeek ?? 5,
      commuteMinutesPerWorkday: mostRecent?.commuteMinutesPerWorkday ?? 0,
    };

    return this.saveForCurrentMonth(fallback);
  }

  saveForCurrentMonth(config: WageConfig): MonthlyWageSettings {
    return this.saveForMonth(getCurrentMonthKey(), config);
  }

  saveForMonth(month: string, config: WageConfig): MonthlyWageSettings {
    const normalizedMonth = normalizeMonthKey(month);
    const db = getDb();
    const now = nowIso();
    const existing = this.getByMonth(normalizedMonth);
    const rates = computeHourlyRates(config);

    if (existing) {
      db.update(monthlyWageSettingsTable)
        .set({
          month: normalizedMonth,
          wageType: config.wageType,
          wageAmount: config.wageAmount,
          hoursWorkedPerWeek: config.hoursWorkedPerWeek,
          workdaysPerWeek: config.workdaysPerWeek,
          commuteMinutesPerWorkday: config.commuteMinutesPerWorkday,
          baseHourlyRate: rates.baseHourlyRate,
          trueHourlyRate: rates.trueHourlyRate,
          updatedAt: now,
        })
        .where(
          and(
            eq(monthlyWageSettingsTable.id, existing.id),
            isNull(monthlyWageSettingsTable.deletedAt),
          ),
        )
        .run();

      db.update(monthlyWageSettingsTable)
        .set({ deletedAt: now, updatedAt: now })
        .where(
          and(
            buildMonthCondition(normalizedMonth),
            isNull(monthlyWageSettingsTable.deletedAt),
            ne(monthlyWageSettingsTable.id, existing.id),
          ),
        )
        .run();
      return this.getByMonth(normalizedMonth) as MonthlyWageSettings;
    }

    db.insert(monthlyWageSettingsTable)
      .values({
        id: newId(),
        month: normalizedMonth,
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

    const created = this.getByMonth(normalizedMonth) as MonthlyWageSettings;
    db.update(monthlyWageSettingsTable)
      .set({ deletedAt: now, updatedAt: now })
      .where(
        and(
          buildMonthCondition(normalizedMonth),
          isNull(monthlyWageSettingsTable.deletedAt),
          ne(monthlyWageSettingsTable.id, created.id),
        ),
      )
      .run();

    return this.getByMonth(normalizedMonth) as MonthlyWageSettings;
  }

  getRateByDate(dateIso: string) {
    const month = normalizeMonthKey(monthKeyFromDateIso(dateIso));
    const history = this.list()
      .map((row) => ({ month: row.month, rate: row.trueHourlyRate }))
      .sort((a, b) => a.month.localeCompare(b.month));
    if (history.length === 0) return 0;

    let selected = history[0]?.rate ?? 0;
    for (let index = 0; index < history.length; index += 1) {
      const entry = history[index];
      if (!entry) continue;
      if (entry.month > month) break;
      selected = entry.rate;
    }
    return selected;
  }

  getRatesByRange(startIso: string, endIso: string) {
    const startMonth = normalizeMonthKey(monthKeyFromDateIso(startIso));
    const endMonth = normalizeMonthKey(monthKeyFromDateIso(endIso));

    return this.list()
      .filter((row) => row.month >= startMonth && row.month <= endMonth)
      .map((row) => ({ month: row.month, trueHourlyRate: row.trueHourlyRate }));
  }

  softDeleteByMonth(month: string) {
    const normalizedMonth = normalizeMonthKey(month);
    if (normalizedMonth === getCurrentMonthKey()) {
      return;
    }

    const db = getDb();
    const now = nowIso();
    db.update(monthlyWageSettingsTable)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(buildMonthCondition(normalizedMonth), isNull(monthlyWageSettingsTable.deletedAt)))
      .run();
  }

  softDeleteAll() {
    const db = getDb();
    const now = nowIso();
    db.update(monthlyWageSettingsTable)
      .set({ deletedAt: now, updatedAt: now })
      .where(isNull(monthlyWageSettingsTable.deletedAt))
      .run();
  }
}

export const monthlyWageRepository = new MonthlyWageRepository();
