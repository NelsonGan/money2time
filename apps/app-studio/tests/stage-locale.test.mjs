import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { stageLocale } from '../src/data/storeUpload.mjs';

const png = Buffer.from('fake png').toString('base64');

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'stage-locale-'));
}

test('stages a locale\'s screenshots inside its own folder', () => {
  const root = tempRoot();
  const dir = stageLocale(root, 'zh-Hant', [{ filename: '01-zh-Hant-home.png', data: png }]);
  assert.equal(dir, path.join(root, 'zh-Hant'));
  assert.deepEqual(fs.readdirSync(dir), ['01-zh-Hant-home.png']);
});

test('refuses a locale that names another folder', () => {
  const root = tempRoot();
  for (const locale of ['../../.ssh', '..', '/etc', 'en/../../x', '', 'en\\..']) {
    assert.throws(() => stageLocale(root, locale, [{ filename: 'a.png', data: png }]), /Not a locale/);
  }
  assert.deepEqual(fs.readdirSync(root), []);
});

test('refuses file names that leave the folder or are not images', () => {
  const root = tempRoot();
  for (const filename of ['../authorized_keys', '../../x.png', '.zshrc', 'a/b.png', 'run.sh', '..png', 'x..png']) {
    assert.throws(() => stageLocale(root, 'en', [{ filename, data: png }]), /Not a screenshot file name/);
  }
  // Nothing was deleted or written before the check.
  assert.deepEqual(fs.readdirSync(root), []);
});
