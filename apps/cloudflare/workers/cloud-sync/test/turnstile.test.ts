import assert from 'node:assert/strict';
import { test } from 'node:test';

import { checkTurnstile, SITEVERIFY_URL, type TurnstileCheck } from '../src/turnstile.ts';

type Call = { url: string; form: Record<string, string> };

function siteverify(answer: unknown, status = 200) {
  const calls: Call[] = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    const form: Record<string, string> = {};
    (init.body as FormData).forEach((value, key) => (form[key] = String(value)));
    calls.push({ url, form });
    return new Response(JSON.stringify(answer), { status });
  }) as unknown as typeof fetch;
  return { calls, fetcher };
}

const base: TurnstileCheck = {
  token: 'tok',
  secret: 'sec',
  enforce: false,
  remoteIp: '203.0.113.7',
  hostnames: ['money2time.com'],
};

test('no secret: nothing is checked, token or not', async () => {
  const { calls, fetcher } = siteverify({ success: false });
  for (const enforce of [false, true]) {
    for (const token of [null, 'tok']) {
      const result = await checkTurnstile({ ...base, secret: undefined, enforce, token, fetcher });
      assert.deepEqual(result, { ok: true, reason: 'not_configured' });
    }
  }
  assert.equal(calls.length, 0);
});

test('missing token passes until enforced', async () => {
  const { calls, fetcher } = siteverify({ success: true });
  assert.deepEqual(await checkTurnstile({ ...base, token: null, fetcher }), {
    ok: true,
    reason: 'no_token',
  });
  assert.deepEqual(await checkTurnstile({ ...base, token: '  ', fetcher }), {
    ok: true,
    reason: 'no_token',
  });
  assert.deepEqual(await checkTurnstile({ ...base, token: null, enforce: true, fetcher }), {
    ok: false,
    reason: 'missing',
  });
  assert.equal(calls.length, 0);
});

test('a valid token on the right hostname passes, with secret, response and remoteip sent', async () => {
  const { calls, fetcher } = siteverify({ success: true, hostname: 'money2time.com' });
  const result = await checkTurnstile({ ...base, enforce: true, fetcher });
  assert.deepEqual(result, { ok: true, reason: 'verified' });
  assert.equal(calls[0].url, SITEVERIFY_URL);
  assert.deepEqual(calls[0].form, { secret: 'sec', response: 'tok', remoteip: '203.0.113.7' });
});

test('an invalid token is refused even when not enforced', async () => {
  const { fetcher } = siteverify({ success: false, 'error-codes': ['invalid-input-response'] });
  assert.deepEqual(await checkTurnstile({ ...base, fetcher }), {
    ok: false,
    reason: 'invalid',
    codes: ['invalid-input-response'],
  });
});

test('a token from another hostname is refused; no hostnames skips the check', async () => {
  const { fetcher } = siteverify({ success: true, hostname: 'evil.example' });
  assert.equal((await checkTurnstile({ ...base, fetcher })).ok, false);
  assert.equal((await checkTurnstile({ ...base, hostnames: [], fetcher })).ok, true);
});

test('an oversized token is refused without asking Cloudflare', async () => {
  const { calls, fetcher } = siteverify({ success: true });
  const result = await checkTurnstile({ ...base, token: 'x'.repeat(2049), fetcher });
  assert.equal(result.ok, false);
  assert.equal(calls.length, 0);
});

test('siteverify down: let through unless enforced', async () => {
  const { fetcher } = siteverify({}, 503);
  assert.deepEqual(await checkTurnstile({ ...base, fetcher }), { ok: true, reason: 'unreachable' });
  assert.deepEqual(await checkTurnstile({ ...base, enforce: true, fetcher }), {
    ok: false,
    reason: 'unreachable',
  });
  const throwing = (async () => {
    throw new TypeError('network');
  }) as unknown as typeof fetch;
  assert.equal((await checkTurnstile({ ...base, fetcher: throwing })).ok, true);
});
