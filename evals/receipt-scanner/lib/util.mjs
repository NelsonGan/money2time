import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const sha = (value) =>
  createHash('sha256')
    .update(typeof value === 'string' ? value : JSON.stringify(value))
    .digest('hex');

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Run `fn` over `items` with at most `limit` in flight; results keep input order. */
export async function pool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next;
      next += 1;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

export function percentile(values, p) {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

export const mean = (values) => {
  const v = values.filter((x) => Number.isFinite(x));
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
};

export const slug = (s) => s.replace(/[^a-zA-Z0-9.-]+/g, '_');

/** Read KEY=VALUE lines from a dotenv file into process.env without overriding what is already set. */
export function loadEnvFile(file) {
  if (!existsSync(file)) return false;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    const value = m[2].replace(/^(['"])(.*)\1$/, '$2');
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
  return true;
}

export const rel = (p) => path.relative(process.cwd(), p) || '.';

export function fmtUsd(n, digits = 4) {
  return n == null ? 'n/a' : `$${n.toFixed(digits)}`;
}
