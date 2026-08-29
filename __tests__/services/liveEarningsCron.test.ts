import { pushDueSessions } from '../../cloudflare/workers/live-earnings/src/sessions';

/**
 * The cron pass: which sessions get pushed, which get ended, which rows get
 * dropped. Every branch here costs either a user-visible frozen card or a slice
 * of the APNs delivery budget, so they are pinned rather than eyeballed.
 *
 * D1 is faked at the statement level - the Worker only ever uses
 * prepare().bind().all()/run() - which keeps the test about the decisions
 * rather than about SQLite.
 */

interface Row {
  push_token: string;
  app_user_id: string;
  environment: 'sandbox' | 'production';
  started_at: number;
  ends_at: number;
  hourly_rate: number;
  currency_symbol: string;
  last_pushed_text: string | null;
}

const NOW = 1_700_003_600_000; // one hour into the sessions below
const START = 1_700_000_000_000;
const END = START + 8 * 60 * 60 * 1000;

function row(over: Partial<Row> = {}): Row {
  return {
    push_token: 'a1b2c3d4e5f60718',
    app_user_id: 'user-1',
    environment: 'production',
    started_at: START,
    ends_at: END,
    hourly_rate: 45,
    currency_symbol: 'RM',
    last_pushed_text: null,
    ...over,
  };
}

/** A real P-256 key, so the cron exercises the real signer rather than a stub. */
let privateKeyPem = '';

function fakeStore(rows: Row[]) {
  const statements: { sql: string; args: unknown[] }[] = [];
  return {
    statements,
    store: {
      prepare(sql: string) {
        return {
          bind(...args: unknown[]) {
            return {
              async all<T>() {
                statements.push({ sql, args });
                return { results: rows as unknown as T[] };
              },
              async run() {
                statements.push({ sql, args });
                return {};
              },
            };
          },
        };
      },
    },
  };
}

const credentials = () => ({
  keyId: 'ABCDE12345',
  teamId: 'TEAM123456',
  privateKeyPem,
  bundleId: 'com.nelsongan.money2time',
});

/** Captures what would have gone to APNs, keyed by token. */
function stubApns(status = 200, reason?: string) {
  const sent: { token: string; body: Record<string, unknown> }[] = [];
  global.fetch = jest.fn(async (url: unknown, init?: unknown) => {
    const token = String(url).split('/3/device/')[1];
    const aps = (JSON.parse(String((init as RequestInit).body)) as { aps: Record<string, unknown> })
      .aps;
    sent.push({ token, body: aps });
    return new Response(reason ? JSON.stringify({ reason }) : '', { status });
  }) as unknown as typeof fetch;
  return sent;
}

describe('live-earnings cron', () => {
  beforeAll(async () => {
    const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
      'verify',
    ])) as CryptoKeyPair;
    const body = Buffer.from(await crypto.subtle.exportKey('pkcs8', pair.privateKey)).toString(
      'base64',
    );
    privateKeyPem = `-----BEGIN PRIVATE KEY-----\n${
      body.match(/.{1,64}/g)?.join('\n') ?? body
    }\n-----END PRIVATE KEY-----\n`;
  });

  beforeEach(() => jest.restoreAllMocks());

  it('does nothing at all when APNs is not configured', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { store, statements } = fakeStore([row()]);
    const sent = stubApns();
    await pushDueSessions(store, null, NOW);

    expect(sent).toHaveLength(0);
    // Crucially it must not prune either: the sessions are still running, they
    // just cannot be pushed yet.
    expect(statements).toHaveLength(0);
    expect(warn).toHaveBeenCalled();
  });

  it('skips a session whose figure has not moved since the last push', async () => {
    // One hour at RM45/hr is exactly RM45.00, which is what was pushed last.
    const { store } = fakeStore([row({ last_pushed_text: 'RM45.00' })]);
    const sent = stubApns();
    await pushDueSessions(store, credentials(), NOW);
    expect(sent).toHaveLength(0);
  });

  it('pushes the current figure when it has moved', async () => {
    const { store, statements } = fakeStore([row({ last_pushed_text: 'RM44.25' })]);
    const sent = stubApns();
    await pushDueSessions(store, credentials(), NOW);

    expect(sent).toHaveLength(1);
    expect(sent[0].body.event).toBe('update');
    expect(sent[0].body['content-state']).toMatchObject({ earnedText: 'RM45.00', earned: 45 });
    // and records what it pushed, so the next tick can skip
    expect(statements.some((s) => s.sql.includes('SET last_pushed_text'))).toBe(true);
  });

  it('ends a session that has run out, even if the figure is unchanged', async () => {
    const endsAt = NOW - 1000;
    const { store } = fakeStore([
      row({ ends_at: endsAt, last_pushed_text: 'RM45.00', started_at: endsAt - 3_600_000 }),
    ]);
    const sent = stubApns();
    await pushDueSessions(store, credentials(), NOW);

    expect(sent).toHaveLength(1);
    expect(sent[0].body.event).toBe('end');
  });

  it('drops a row whose token APNs has rejected for good', async () => {
    const { store, statements } = fakeStore([row()]);
    stubApns(410, 'Unregistered');
    await pushDueSessions(store, credentials(), NOW);

    const del = statements.find((s) => s.sql.includes('DELETE FROM live_activity_sessions'));
    expect(del).toBeDefined();
    expect(String(del?.args[1])).toContain('a1b2c3d4e5f60718');
  });

  it('keeps a row after a transient failure so the next minute retries', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { store, statements } = fakeStore([row()]);
    stubApns(429, 'TooManyRequests');
    await pushDueSessions(store, credentials(), NOW);

    const del = statements.find((s) => s.sql.includes('DELETE FROM live_activity_sessions'));
    expect(String(del?.args[1])).toBe('[]');
    expect(warn).toHaveBeenCalled();
  });

  it('addresses each row through its own APNs environment', async () => {
    const { store } = fakeStore([
      row({ push_token: 'aaaa1111bbbb2222', environment: 'production' }),
      row({ push_token: 'cccc3333dddd4444', environment: 'sandbox' }),
    ]);
    const sent = stubApns();
    await pushDueSessions(store, credentials(), NOW);
    expect(sent.map((s) => s.token).sort()).toEqual(['aaaa1111bbbb2222', 'cccc3333dddd4444']);
  });
});
