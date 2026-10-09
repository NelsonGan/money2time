import { and, eq } from 'drizzle-orm';

import { getDb, getSQLite } from '~/lib/db/client';
import { exchangeRatesTable } from '~/lib/db/schema';
import type { ExchangeRate, ExchangeRateSource } from '~/types';
import { newId, nowIso } from '~/utils/id';

import { toExchangeRate } from './mappers';

class ExchangeRatesRepository {
  list(): ExchangeRate[] {
    const db = getDb();
    return db.select().from(exchangeRatesTable).all().map(toExchangeRate);
  }

  /** All cached rates for a given canonical base currency. */
  listByBase(base: string): ExchangeRate[] {
    const db = getDb();
    return db
      .select()
      .from(exchangeRatesTable)
      .where(eq(exchangeRatesTable.baseCurrency, base))
      .all()
      .map(toExchangeRate);
  }

  getRate(base: string, quote: string): ExchangeRate | null {
    const db = getDb();
    const row = db
      .select()
      .from(exchangeRatesTable)
      .where(
        and(eq(exchangeRatesTable.baseCurrency, base), eq(exchangeRatesTable.quoteCurrency, quote)),
      )
      .get();
    return row ? toExchangeRate(row) : null;
  }

  /** Insert or update a single base→quote rate. */
  upsert(
    base: string,
    quote: string,
    rate: number,
    asOfDate: string,
    source: ExchangeRateSource,
  ): void {
    const db = getDb();
    const now = nowIso();
    const existing = this.getRate(base, quote);
    if (existing) {
      db.update(exchangeRatesTable)
        .set({ rate, asOfDate, source, updatedAt: now })
        .where(eq(exchangeRatesTable.id, existing.id))
        .run();
      return;
    }
    db.insert(exchangeRatesTable)
      .values({
        id: newId(),
        baseCurrency: base,
        quoteCurrency: quote,
        rate,
        asOfDate,
        source,
        updatedAt: now,
      })
      .run();
  }

  /**
   * Bulk replace API-sourced rates for a base. Preserves manual overrides.
   *
   * Each pair carries its own `asOfDate`: the upstream feed blends providers
   * that publish on different schedules, so pairs in one refresh can legitimately
   * be observed on different days.
   */
  upsertApiRates(base: string, rates: Record<string, { rate: number; asOfDate: string }>): void {
    const db = getDb();
    const sqlite = getSQLite();
    const now = nowIso();
    const existingRows = db
      .select()
      .from(exchangeRatesTable)
      .where(eq(exchangeRatesTable.baseCurrency, base))
      .all();
    const byQuote = new Map(existingRows.map((r) => [r.quoteCurrency, r]));

    sqlite.execSync('BEGIN');
    try {
      for (const [quote, { rate, asOfDate }] of Object.entries(rates)) {
        if (!Number.isFinite(rate) || rate <= 0) continue;
        if (!asOfDate) continue;
        const existing = byQuote.get(quote);
        if (existing) {
          // Never clobber a manual override with an API value.
          if (existing.source === 'manual') continue;
          db.update(exchangeRatesTable)
            .set({ rate, asOfDate, source: 'api', updatedAt: now })
            .where(eq(exchangeRatesTable.id, existing.id))
            .run();
        } else {
          db.insert(exchangeRatesTable)
            .values({
              id: newId(),
              baseCurrency: base,
              quoteCurrency: quote,
              rate,
              asOfDate,
              source: 'api',
              updatedAt: now,
            })
            .run();
        }
      }
      sqlite.execSync('COMMIT');
    } catch (error) {
      sqlite.execSync('ROLLBACK');
      throw error;
    }
  }

  setManualRate(base: string, quote: string, rate: number, asOfDate: string): void {
    this.upsert(base, quote, rate, asOfDate, 'manual');
  }

  clearAll(): void {
    const db = getDb();
    db.delete(exchangeRatesTable).run();
  }
}

export const exchangeRatesRepository = new ExchangeRatesRepository();
