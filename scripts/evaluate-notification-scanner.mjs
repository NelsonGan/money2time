#!/usr/bin/env node
/** Evaluate synthetic fixtures against a signed scanner preview. No private input. */
import { createHmac } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const endpoint = process.env.SCANNER_EVALUATION_URL;
const appUserId = process.env.SCANNER_EVALUATION_USER;
if (!endpoint || !appUserId) {
  throw new Error(
    'Set SCANNER_EVALUATION_URL to a /scan preview URL and SCANNER_EVALUATION_USER to a synthetic app user ID.',
  );
}
const signingKey = process.env.EXPO_PUBLIC_REQUEST_SIGNING_KEY?.trim();
const extraHeaders = JSON.parse(process.env.SCANNER_EVALUATION_HEADERS || '{}');
const fixture = fileURLToPath(
  new URL('../__tests__/fixtures/payment-alerts/notification-scans.json', import.meta.url),
);
const cases = JSON.parse(readFileSync(fixture, 'utf8')).cases;
const selectedIds = process.argv.slice(2);
const selected = selectedIds.length
  ? cases.filter((entry) => selectedIds.includes(entry.id))
  : cases;
if (!selected.length) throw new Error('No matching synthetic fixture IDs.');
const results = [];
for (const entry of selected) {
  const timestamp = String(Date.now());
  const headers = { 'Content-Type': 'application/json', ...extraHeaders };
  if (signingKey) {
    headers['X-Timestamp'] = timestamp;
    headers['X-Signature'] = createHmac('sha256', signingKey)
      .update(`${timestamp}.${appUserId}`)
      .digest('hex');
  }
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(90000),
      body: JSON.stringify({
        appUserId,
        mode: 'notification',
        text: entry.text,
        capturedAt: '2026-10-08T08:00:00Z',
        currency: entry.currency,
        categories: ['Food', 'Transportation', 'Purchases', 'Bills', 'Other'],
        incomeCategories: ['Salary', 'Refunds', 'Interest', 'Other'],
      }),
    });
    const body = await response.json();
    const transaction = body.transactions?.[0];
    const decision = body.notificationDecision === 'ignore' ? 'ignore' : transaction?.type;
    const validDecision =
      Array.isArray(body.transactions) &&
      (body.notificationDecision === 'ignore'
        ? body.transactions.length === 0
        : body.notificationDecision === 'transaction' && body.transactions.length === 1);
    const pass =
      response.status === 200 &&
      validDecision &&
      decision === entry.expected.decision &&
      (decision === 'ignore' ||
        (transaction?.amount === entry.expected.amount &&
          (!entry.expected.currency || transaction.currency === entry.expected.currency)));
    const result = {
      id: entry.id,
      pass,
      status: response.status,
      expected: entry.expected,
      actual: { decision, amount: transaction?.amount, currency: transaction?.currency },
    };
    results.push(result);
    console.log(`${pass ? 'PASS' : 'FAIL'} ${entry.id}: ${decision ?? 'service failure'}`);
  } catch {
    results.push({ id: entry.id, pass: false, error: 'Request failed or timed out' });
    console.log(`FAIL ${entry.id}: request failed`);
  }
}
const summary = {
  date: new Date().toISOString(),
  passed: results.filter((result) => result.pass).length,
  total: results.length,
  results,
};
if (process.env.SCANNER_EVALUATION_OUTPUT)
  writeFileSync(process.env.SCANNER_EVALUATION_OUTPUT, `${JSON.stringify(summary, null, 2)}\n`);
console.log(`${summary.passed}/${summary.total} passed`);
if (summary.passed !== summary.total) process.exitCode = 1;
