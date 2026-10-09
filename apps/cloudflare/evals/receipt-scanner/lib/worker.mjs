// Loads the receipt-scanner Worker's own TypeScript (prompts, request body,
// response parse) so the eval sends exactly what production sends and scores
// exactly what the app receives. Node 24 strips the types natively; the only
// gap is that the Worker's imports are extensionless (a bundler convention), so
// a resolve hook retries them with `.ts` / `/index.ts`.

import { existsSync, readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
export const WORKER_DIR = path.join(REPO_ROOT, 'apps/cloudflare/workers/receipt-scanner');

registerHooks({
  resolve(specifier, context, nextResolve) {
    const fromTs = context.parentURL?.endsWith('.ts');
    const relative = specifier.startsWith('./') || specifier.startsWith('../');
    if (fromTs && relative && !/\.[cm]?[jt]s$/.test(specifier)) {
      for (const candidate of [`${specifier}.ts`, `${specifier}/index.ts`]) {
        const url = new URL(candidate, context.parentURL);
        if (existsSync(fileURLToPath(url))) return nextResolve(url.href, context);
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    // The Worker's package.json has no "type", so Node would parse each file
    // as CommonJS first and warn before reparsing; it is always ESM.
    if (url.startsWith('file:') && url.endsWith('.ts') && url.includes('/receipt-scanner/src/')) {
      return nextLoad(url, { ...context, format: 'module-typescript' });
    }
    return nextLoad(url, context);
  },
});

const src = (file) => pathToFileURL(path.join(WORKER_DIR, 'src', file)).href;

const scanModes = await import(src('scanModes/index.ts'));
const completion = await import(src('completion.ts'));

export const { buildReceiptPrompt, maxTokensForMode, normalizeReceiptDetail } = scanModes;
export const {
  buildCompletionBody,
  clampReceiptDate,
  EMPTY_RESULT_RETRIES,
  extractParsedObject,
  parseTransactions,
  RETRY_TEMPERATURE,
} = completion;

/** The production models from wrangler.toml, so a run can always compare against them. */
export function productionModels() {
  const toml = readFileSync(path.join(WORKER_DIR, 'wrangler.toml'), 'utf8');
  const read = (key) => toml.match(new RegExp(`^${key}\\s*=\\s*"([^"]+)"`, 'm'))?.[1] ?? null;
  return { primary: read('MODEL'), backup: read('BACKUP_MODEL') };
}

/** What the Worker does with one completion, minus the I/O (see runInference in index.ts). */
export function parseLikeWorker(content, mode, now) {
  const parsed = extractParsedObject(content);
  const transactions = parseTransactions(parsed, now);
  const receiptDetail = mode === 'itemized' ? normalizeReceiptDetail(parsed) : null;
  if (receiptDetail) receiptDetail.date = clampReceiptDate(receiptDetail.date, now);
  return { parsed, transactions, receiptDetail };
}
