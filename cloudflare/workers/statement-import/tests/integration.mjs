import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { build } from 'esbuild';

const temporary = await mkdtemp(join(tmpdir(), 'statement-worker-test-'));
const output = join(temporary, 'worker.mjs');
const originalFetch = globalThis.fetch;

try {
  await build({
    entryPoints: ['src/index.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    outfile: output,
    logLevel: 'silent',
  });
  const worker = (await import(pathToFileURL(output).href)).default;
  const schema = await readFile('../../d1/statement-import/schema.sql', 'utf8');
  const db = new DatabaseSync(':memory:');
  db.exec(schema);
  const d1 = {
    prepare(sql) {
      const statement = db.prepare(sql);
      return {
        bind(...parameters) {
          return {
            async first() {
              return statement.get(...parameters) ?? null;
            },
            async run() {
              const result = statement.run(...parameters);
              return { meta: { changes: Number(result.changes) } };
            },
          };
        },
      };
    },
    async batch(statements) {
      return Promise.all(statements.map((statement) => statement.run()));
    },
  };
  const userId = 'm2t_statement_worker_test';
  db.prepare('INSERT INTO entitlement_cache VALUES (?, ?, ?)').run(userId, 1, Date.now() + 600_000);
  const env = {
    MONEY2TIME_D1_RECEIPT_SCANNER: d1,
    OPENROUTER_API_KEY: 'test',
    REVENUECAT_SECRET_KEY: 'test',
    ENTITLEMENT_ID: 'pro',
    MODEL: 'qwen/qwen3.7-flash',
  };
  const sample = (await readFile('tests/fixtures/sample.pdf')).toString('base64');
  const locked = (await readFile('tests/fixtures/locked.pdf')).toString('base64');
  const base = {
    appUserId: userId,
    accountName: 'Checking Account',
    currency: 'MYR',
    categories: ['Food', 'Salary'],
  };
  const invoke = async (pdf, extra = {}) => {
    const response = await worker.fetch(
      new Request('https://example.com/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...base, pdf, ...extra }),
      }),
      env,
    );
    return { status: response.status, body: await response.json() };
  };

  assert.deepEqual((await invoke(locked)).body, { error: 'password_required' });
  assert.deepEqual((await invoke(locked, { password: 'wrong' })).body, {
    error: 'incorrect_password',
  });
  assert.equal(db.prepare('SELECT count(*) AS count FROM statement_usage').get().count, 0);

  let modelCalls = 0;
  globalThis.fetch = async (_url, options) => {
    modelCalls++;
    const request = JSON.parse(options.body);
    assert.equal(request.model, 'qwen/qwen3.7-flash');
    assert.match(request.messages[0].content[0].text, /Extract every posted transaction/);
    const parsed = {
      statement: { issuer: 'Sample Bank', currency: 'MYR' },
      transactions: [
        { date: '2026-09-02', description: 'Groceries', amount: -42.5, category: 'Food' },
        { date: '2026-09-03', description: 'Salary', amount: 1500, category: 'Salary' },
      ],
    };
    return Response.json({ choices: [{ message: { content: JSON.stringify(parsed) } }] });
  };
  const unlocked = await invoke(locked, { password: 'secret123' });
  assert.equal(unlocked.status, 200);
  assert.equal(unlocked.body.transactions.length, 2);
  assert.equal(unlocked.body.transactions[0].account, 'Checking Account');
  assert.deepEqual(unlocked.body.quota, { used: 1, limit: 100 });
  assert.equal(modelCalls, 1);
  const plain = await invoke(sample);
  assert.equal(plain.status, 200);
  assert.equal(plain.body.quota.used, 2);

  db.prepare('UPDATE statement_usage SET count = 100').run();
  assert.deepEqual((await invoke(sample)).body, { error: 'limit_reached', limit: 100 });
  assert.equal(modelCalls, 2);

  db.prepare('UPDATE statement_usage SET count = 99').run();
  globalThis.fetch = async () => {
    throw new Error('mock provider failure');
  };
  const failed = await invoke(sample);
  assert.equal(failed.status, 502);
  assert.equal(db.prepare('SELECT count FROM statement_usage').get().count, 99);

  globalThis.fetch = async () =>
    Response.json({
      choices: [
        {
          message: {
            content: JSON.stringify({
              statement: { currency: 'MYR' },
              transactions: [
                {
                  date: '2026-09-02',
                  description: 'Foreign purchase',
                  amount: -10,
                  currency: 'USD',
                },
              ],
            }),
          },
        },
      ],
    });
  assert.deepEqual((await invoke(sample)).body, { error: 'mixed_currency' });
  assert.equal(db.prepare('SELECT count FROM statement_usage').get().count, 99);

  db.prepare('UPDATE entitlement_cache SET is_pro = 0').run();
  assert.deepEqual((await invoke(sample)).body, { error: 'pro_required' });
  console.log('Statement Worker integration: password, parsing, Pro, quota, and rollback passed.');
  db.close();
} finally {
  globalThis.fetch = originalFetch;
  await rm(temporary, { recursive: true, force: true });
}
