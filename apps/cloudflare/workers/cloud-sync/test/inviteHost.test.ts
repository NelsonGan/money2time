import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Env } from '../src/env.ts';
import worker from '../src/index.ts';
import { inviteOrigin } from '../src/ledgers.ts';

const env = {
  BETTER_AUTH_URL: 'https://workers-cloud-sync.money2time.com',
  INVITE_URL: 'https://ledger.money2time.com',
  ALBUM_INVITE_URL: 'https://album.money2time.com',
} as Env;
const code = 'AbCdEfGhIjKlMnOpQrSt_-12';

test('the ledger host opens invite links', async () => {
  const res = await worker.fetch(new Request(`https://ledger.money2time.com/join/${code}`), env);
  assert.equal(res.status, 200);
  assert.ok((await res.text()).includes(`money2time://join/${code}`));
});

test('the album host opens invite links, worded as an album', async () => {
  const res = await worker.fetch(new Request(`https://album.money2time.com/join/${code}`), env);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.ok(html.includes(`money2time://join/${code}`));
  assert.ok(html.includes('shared album'));
  assert.ok(!html.includes('shared ledger'));
});

test('the invite hosts serve neither sign-in nor the API', async () => {
  for (const host of ['ledger.money2time.com', 'album.money2time.com']) {
    for (const [method, path] of [
      ['POST', '/api/auth/sign-in/social'],
      ['GET', '/api/auth/ok'],
      ['GET', `/v1/invites/${code}`],
      ['GET', '/v1/ledgers'],
      ['POST', `/join/${code}`],
    ]) {
      const res = await worker.fetch(new Request(`https://${host}${path}`, { method }), env);
      assert.equal(res.status, 404, `${method} ${host}${path}`);
    }
  }
});

test('ledger links go on the ledger host and album links on the album host', () => {
  assert.equal(inviteOrigin(env, 'ledger'), 'https://ledger.money2time.com');
  assert.equal(inviteOrigin(env, 'album'), 'https://album.money2time.com');
  const noAlbumHost = { ...env, ALBUM_INVITE_URL: undefined } as Env;
  assert.equal(inviteOrigin(noAlbumHost, 'album'), 'https://ledger.money2time.com');
  const noInviteHosts = { BETTER_AUTH_URL: env.BETTER_AUTH_URL } as Env;
  assert.equal(inviteOrigin(noInviteHosts, 'album'), 'https://workers-cloud-sync.money2time.com');
});

test('invite links no longer open on the API host', async () => {
  const res = await worker.fetch(
    new Request(`https://workers-cloud-sync.money2time.com/join/${code}`),
    env,
  );
  assert.equal(res.status, 404);
});

test('one host for both opens invite links there', async () => {
  const res = await worker.fetch(
    new Request(`https://workers-cloud-sync.money2time.com/join/${code}`),
    { BETTER_AUTH_URL: env.BETTER_AUTH_URL } as Env,
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
