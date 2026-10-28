// Loaded with require() on a path variable, like the receipt-scanner tests, so
// the app's typecheck does not pull in the Worker's Cloudflare types.
const WORKER_SRC = '../../../cloudflare/workers/cloud-sync/src';
const { contentTypeFor, isValidAssetPath, mediaKey } = require(`${WORKER_SRC}/media`);
const { hasActiveEntitlement, isValidAppUserId } = require(`${WORKER_SRC}/revenuecat`);
const { CLOUD_SCHEMA_SQL, databaseNameFor } = require(`${WORKER_SRC}/turso`) as {
  CLOUD_SCHEMA_SQL: string[];
  databaseNameFor: (userId: string) => Promise<string>;
};

describe('cloud-sync media paths', () => {
  it('accepts the paths the app writes', () => {
    expect(isValidAssetPath('receipts/9f3c1a2b-0000-4000-8000-000000000000.jpg')).toBe(true);
    expect(isValidAssetPath('card-designs/abc.text-light.jpg')).toBe(true);
    expect(isValidAssetPath('account-logos/x.png')).toBe(true);
  });

  it('rejects traversal, absolute and nested paths', () => {
    expect(isValidAssetPath('../receipts/x.jpg')).toBe(false);
    expect(isValidAssetPath('receipts/../x.jpg')).toBe(false);
    expect(isValidAssetPath('/receipts/x.jpg')).toBe(false);
    expect(isValidAssetPath('receipts/a/b.jpg')).toBe(false);
    expect(isValidAssetPath('receipts/.hidden')).toBe(false);
  });

  it('serves images only', () => {
    expect(contentTypeFor('receipts/x.JPG')).toBe('image/jpeg');
    expect(contentTypeFor('receipts/x.heic')).toBe('image/heic');
    expect(contentTypeFor('receipts/x.html')).toBeNull();
  });

  it('keeps each user under their own prefix', () => {
    expect(mediaKey('user1', 'receipts/x.jpg')).toBe('u/user1/receipts/x.jpg');
  });
});

describe('cloud-sync Pro check', () => {
  const now = Date.parse('2026-10-28T00:00:00Z');

  it('treats a lifetime entitlement as active', () => {
    expect(
      hasActiveEntitlement(
        { subscriber: { entitlements: { pro: { expires_date: null } } } },
        'pro',
        now,
      ),
    ).toBe(true);
  });

  it('checks expiry', () => {
    const body = (date: string) => ({
      subscriber: { entitlements: { pro: { expires_date: date } } },
    });
    expect(hasActiveEntitlement(body('2026-11-01T00:00:00Z'), 'pro', now)).toBe(true);
    expect(hasActiveEntitlement(body('2026-10-01T00:00:00Z'), 'pro', now)).toBe(false);
    expect(hasActiveEntitlement(body('garbage'), 'pro', now)).toBe(false);
  });

  it('fails closed without the entitlement', () => {
    expect(hasActiveEntitlement({}, 'pro', now)).toBe(false);
    expect(hasActiveEntitlement({ subscriber: { entitlements: {} } }, 'pro', now)).toBe(false);
  });

  it('accepts only the app’s App User ID shape', () => {
    expect(isValidAppUserId('m2t_123e4567-e89b-12d3-a456-426614174000')).toBe(true);
    expect(isValidAppUserId('$RCAnonymousID:abc')).toBe(false);
    expect(isValidAppUserId(42)).toBe(false);
  });
});

describe('cloud-sync Turso', () => {
  it('names databases within Turso’s rules', async () => {
    const name = await databaseNameFor('Some-User_ID');
    expect(name).toMatch(/^m2t-sync-[0-9a-f]{24}$/);
    expect(await databaseNameFor('Some-User_ID')).toBe(name);
  });

  it('keeps the cloud schema identical to the app’s copy', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const engine = readFileSync(
      require.resolve('../../features/cloudSync/services/syncEngine.ts'),
      'utf8',
    );
    const normalize = (sql: string) => sql.replace(/\s+/g, ' ').trim();
    for (const sql of CLOUD_SCHEMA_SQL) {
      expect(normalize(engine)).toContain(normalize(sql));
    }
  });
});

describe('cloud-sync sealed tokens', () => {
  const { open, seal } = require(`${WORKER_SRC}/secretBox`) as {
    seal: (env: object, purpose: string, text: string) => Promise<string>;
    open: (env: object, purpose: string, stored: string) => Promise<string | null>;
  };
  const env = { BETTER_AUTH_SECRET: 'test-secret' };

  it('opens what it sealed, for the same purpose and secret only', async () => {
    const sealed = await seal(env, 'turso-token', 'jwt-value');
    expect(sealed).not.toContain('jwt-value');
    await expect(open(env, 'turso-token', sealed)).resolves.toBe('jwt-value');
    await expect(open(env, 'apple-refresh-token', sealed)).resolves.toBeNull();
    await expect(
      open({ BETTER_AUTH_SECRET: 'rotated' }, 'turso-token', sealed),
    ).resolves.toBeNull();
    await expect(open(env, 'turso-token', 'garbage')).resolves.toBeNull();
  });
});
