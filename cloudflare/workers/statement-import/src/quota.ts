import type { Env } from './index';

export const MONTHLY_LIMIT = 100;

export function utcMonth(date = new Date()): string {
  return date.toISOString().slice(0, 7);
}

export async function quotaUsed(appUserId: string, env: Env, month: string): Promise<number> {
  const row = await env.MONEY2TIME_D1_RECEIPT_SCANNER.prepare(
    'SELECT count FROM statement_usage WHERE app_user_id = ?1 AND month = ?2',
  )
    .bind(appUserId, month)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

// Reserve before a potentially expensive call. The conditional update is atomic
// in D1, so simultaneous requests cannot exceed the monthly cap.
export async function reserveQuota(appUserId: string, env: Env, month: string): Promise<boolean> {
  const db = env.MONEY2TIME_D1_RECEIPT_SCANNER;
  await db
    .prepare('INSERT OR IGNORE INTO statement_usage (app_user_id, month, count) VALUES (?1, ?2, 0)')
    .bind(appUserId, month)
    .run();
  const result = await db
    .prepare(
      'UPDATE statement_usage SET count = count + 1 WHERE app_user_id = ?1 AND month = ?2 AND count < ?3',
    )
    .bind(appUserId, month, MONTHLY_LIMIT)
    .run();
  return result.meta.changes === 1;
}

export async function releaseQuota(appUserId: string, env: Env, month: string): Promise<void> {
  await env.MONEY2TIME_D1_RECEIPT_SCANNER.prepare(
    'UPDATE statement_usage SET count = MAX(0, count - 1) WHERE app_user_id = ?1 AND month = ?2',
  )
    .bind(appUserId, month)
    .run();
}
