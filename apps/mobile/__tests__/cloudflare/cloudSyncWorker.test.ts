// Loaded with require() on a path variable, like the receipt-scanner tests, so
// the app's typecheck does not pull in the Worker's Cloudflare types.
const WORKER_SRC = '../../../cloudflare/workers/cloud-sync/src';
const { contentTypeFor, isValidAssetPath, ledgerSpace, mediaKey, userSpace } = require(
  `${WORKER_SRC}/media`,
);
const { invitePage, maskEmail } = require(`${WORKER_SRC}/ledgers`) as {
  invitePage: (code: string) => Response;
  maskEmail: (email: string) => string;
};
const {
  hasActiveEntitlement,
  isValidAppUserId,
  MAX_PRO_PHONES,
  phonesWithAccountPro,
  SLOT_IDLE_MS,
} = require(`${WORKER_SRC}/revenuecat`) as {
  hasActiveEntitlement: (body: unknown, id: string, now: number) => boolean;
  isValidAppUserId: (value: unknown) => boolean;
  MAX_PRO_PHONES: number;
  phonesWithAccountPro: (
    phones: { app_user_id: string; first_seen_at: number; last_seen_at: number }[],
    now: number,
  ) => Set<string>;
  SLOT_IDLE_MS: number;
};
const { isValidChannel, isValidDeviceId } = require(`${WORKER_SRC}/live`) as {
  isValidChannel: (value: unknown) => boolean;
  isValidDeviceId: (value: unknown) => boolean;
};
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

  it('keeps each user and each shared ledger under their own prefix', () => {
    expect(mediaKey(userSpace('user1'), 'receipts/x.jpg')).toBe('u/user1/receipts/x.jpg');
    expect(mediaKey(ledgerSpace('abc123'), 'receipts/x.jpg')).toBe('l/abc123/receipts/x.jpg');
    expect(userSpace('user1').usageTable).toBe('media_usage');
    expect(ledgerSpace('abc123').usageTable).toBe('ledger_media_usage');
  });
});

describe('cloud-sync shared ledgers', () => {
  it('shows only part of an address', () => {
    expect(maskEmail('jordan@example.com')).toBe('jo***@example.com');
    expect(maskEmail('a@b.co')).toBe('a***@b.co');
    expect(maskEmail('not-an-email')).toBe('');
  });

  it('hands a well-formed invite code to the app', async () => {
    const code = 'AbCdEfGhIjKlMnOpQrStUvWx';
    const page = invitePage(code);
    expect(page.status).toBe(200);
    expect(page.headers.get('Content-Security-Policy')).toContain("default-src 'none'");
    const html = await page.text();
    expect(html).toContain(`money2time://join/${code}`);
  });

  it('refuses anything else as an invite code', () => {
    expect(invitePage('short').status).toBe(404);
    expect(invitePage('<script>alert(1)</script>aaaaaaaaaaaa').status).toBe(404);
    expect(invitePage('"onload="x"aaaaaaaaaaaaaaaaaa').status).toBe(404);
  });
});

describe('cloud-sync live updates', () => {
  it('accepts the app’s device ids and channels', () => {
    expect(isValidDeviceId('9f3c1a2b-0000-4000-8000-000000000000')).toBe(true);
    expect(isValidChannel('personal')).toBe(true);
    expect(isValidChannel('a1b2c3d4e5f6a1b2c3d4e5f6')).toBe(true);
  });

  it('refuses anything else', () => {
    expect(isValidDeviceId('short')).toBe(false);
    expect(isValidDeviceId('../x/../y-zzzzzz')).toBe(false);
    expect(isValidChannel('')).toBe(false);
    expect(isValidChannel('a/b')).toBe(false);
    expect(isValidChannel(42)).toBe(false);
  });
});

describe('cloud-sync Pro phone limit', () => {
  const now = Date.UTC(2026, 9, 28);
  const phone = (n: number, firstDaysAgo: number, lastDaysAgo = 0) => ({
    app_user_id: `phone${n}`,
    first_seen_at: now - firstDaysAgo * 86_400_000,
    last_seen_at: now - lastDaysAgo * 86_400_000,
  });

  it('gives the account Pro to the first 5 phones to join', () => {
    expect(MAX_PRO_PHONES).toBe(5);
    const phones = [6, 5, 4, 3, 2, 1].map((n) => phone(n, 10 - n));
    expect([...phonesWithAccountPro(phones, now)].sort()).toEqual([
      'phone1',
      'phone2',
      'phone3',
      'phone4',
      'phone5',
    ]);
  });

  it('keeps a sixth phone waiting however often it is used', () => {
    const phones = [1, 2, 3, 4, 5].map((n) => phone(n, 20 + n, 5)).concat(phone(6, 1, 0));
    expect(phonesWithAccountPro(phones, now).has('phone6')).toBe(false);
  });

  it('frees the place of a phone left unused for 30 days', () => {
    expect(SLOT_IDLE_MS).toBe(30 * 86_400_000);
    const phones = [phone(1, 90, 31), ...[2, 3, 4, 5].map((n) => phone(n, 60)), phone(6, 1)];
    const places = phonesWithAccountPro(phones, now);
    expect(places.has('phone1')).toBe(false);
    expect(places.has('phone6')).toBe(true);
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
