import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Env } from '../src/env.ts';
import worker from '../src/index.ts';

const env = {
  BETTER_AUTH_URL: 'https://workers-cloud-sync.money2time.com',
  INVITE_URL: 'https://shared-ledgers.money2time.com',
} as Env;
const code = 'AbCdEfGhIjKlMnOpQrSt_-12';

test('the invite host opens invite links', async () => {
  const res = await worker.fetch(
    new Request(`https://shared-ledgers.money2time.com/join/${code}`),
    env,
  );
  assert.equal(res.status, 200);
  assert.ok((await res.text()).includes(`money2time://join/${code}`));
});

test('the invite host serves neither sign-in nor the API', async () => {
  for (const [method, path] of [
    ['POST', '/api/auth/sign-in/social'],
    ['GET', '/api/auth/ok'],
    ['GET', `/v1/invites/${code}`],
    ['GET', '/v1/ledgers'],
    ['POST', `/join/${code}`],
  ]) {
    const res = await worker.fetch(
      new Request(`https://shared-ledgers.money2time.com${path}`, { method }),
      env,
    );
    assert.equal(res.status, 404, `${method} ${path}`);
  }
});

test('the API host still opens links shared before the invite host', async () => {
  const res = await worker.fetch(
    new Request(`https://workers-cloud-sync.money2time.com/join/${code}`),
    env,
  );
  assert.equal(res.status, 200);
});

test('one host for both keeps the API reachable', async () => {
  const res = await worker.fetch(
    new Request(`https://workers-cloud-sync.money2time.com/v1/invites/${code}`),
    { ...env, INVITE_URL: env.BETTER_AUTH_URL } as Env,
  );
  assert.notEqual(res.status, 404);
});
