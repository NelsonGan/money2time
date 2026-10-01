import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const directories = ['account-logos', 'subscription-logos', 'tutorials', 'news'];
const original = 'original-image';
let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'money2time-native-assets-'));
  for (const directory of [...directories, 'clay-icons']) {
    await fs.mkdir(path.join(root, 'assets', directory), { recursive: true });
    await fs.writeFile(path.join(root, 'assets', directory, 'example.png'), original);
  }
});

afterEach(async () => fs.rm(root, { recursive: true, force: true }));

it.each(directories)(
  'requires a new internal build after a %s image changes',
  async (directory) => {
    const { getNativeAssetRevision } = require('../../scripts/lib/nativeAssetRevision.cjs');
    const before = getNativeAssetRevision(root);
    const image = path.join(root, 'assets', directory, 'example.png');
    await fs.writeFile(image, 'compressed-image');
    expect(getNativeAssetRevision(root)).not.toBe(before);
    await fs.writeFile(image, original);
    expect(getNativeAssetRevision(root)).toBe(before);
  },
);

it('allows updated images included in OTA without requiring a new native build', async () => {
  const { getNativeAssetRevision } = require('../../scripts/lib/nativeAssetRevision.cjs');
  const before = getNativeAssetRevision(root);
  await fs.writeFile(path.join(root, 'assets/clay-icons/example.png'), 'updated-image');
  expect(getNativeAssetRevision(root)).toBe(before);
});

it('requires a new build when a native-only image changes its filename', async () => {
  const { getNativeAssetRevision } = require('../../scripts/lib/nativeAssetRevision.cjs');
  const before = getNativeAssetRevision(root);
  await fs.rename(
    path.join(root, 'assets/news/example.png'),
    path.join(root, 'assets/news/example.jpg'),
  );
  expect(getNativeAssetRevision(root)).not.toBe(before);
});
