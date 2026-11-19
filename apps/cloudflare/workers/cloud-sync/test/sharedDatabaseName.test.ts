import assert from 'node:assert/strict';
import { test } from 'node:test';

import { sharedDatabaseName } from '../src/ledgers.ts';

const id = '0123456789abcdef01234567';

test('a shared album gets its own database prefix', () => {
  assert.equal(sharedDatabaseName('album', id), `m2t-album-${id}`);
});

test('a shared ledger keeps the ledger prefix', () => {
  assert.equal(sharedDatabaseName('ledger', id), `m2t-ledger-${id}`);
});

test('both stay within Turso’s naming rules', () => {
  for (const kind of ['album', 'ledger'] as const) {
    const name = sharedDatabaseName(kind, id);
    assert.match(name, /^[a-z0-9-]+$/);
    assert.ok(name.length < 64);
  }
});
