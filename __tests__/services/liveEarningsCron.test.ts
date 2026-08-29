import {
  CRON_BATCH_SIZE,
  MAX_PUSHES_PER_WINDOW,
  runPushWindow,
  type SessionStore,
  TICKS_PER_WINDOW,
  WINDOW_DEADLINE_MS,
} from '../../cloudflare/workers/live-earnings/src/sessions';

/**
 * The push window: which sessions get pushed, at what priority, which get
 * ended, which rows get dropped.
 *
 * The priority split is the load-bearing case. Apple meters `apns-priority: 10`
 * against a budget it does not publish, and a developer sending ~8 metered
 * pushes a minute had their Live Activity stop updating for up to 24 hours. So
 * exactly one push per window may be metered, however many ticks it sends.
 *
 * D1 is faked at the statement level - the Worker only ever uses
 * prepare().bind().all()/run() - and the clock and sleep are injected, so a
 * whole 60-second window runs instantly and deterministically.
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

/** A real P-256 key, so the window exercises the real ES256 signer. */
let privateKeyPem = '';
const credentials = () => ({
  keyId: 'ABCDE12345',
  teamId: 'TEAM123456',
  privateKeyPem,
  bundleId: 'com.nelsongan.money2time',
});

function fakeStore(rows: Row[]) {
  const statements: { sql: string; args: unknown[] }[] = [];
  const store: SessionStore = {
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
  };
  return { statements, store };
}

function stubApns(status = 200, reason?: string) {
  const sent: { token: string; priority: string; body: Record<string, unknown> }[] = [];
  global.fetch = jest.fn(async (url: unknown, init?: unknown) => {
    const request = init as RequestInit;
    const aps = (JSON.parse(String(request.body)) as { aps: Record<string, unknown> }).aps;
    sent.push({
      token: String(url).split('/3/device/')[1],
      priority: String((request.headers as Record<string, string>)['apns-priority']),
      body: aps,
    });
    return new Response(reason ? JSON.stringify({ reason }) : '', { status });
  }) as unknown as typeof fetch;
  return sent;
}

/**
 * Runs a whole window on a virtual clock: `sleep` advances time, never waits.
 * `dragMs` adds elapsed time per tick, to simulate a slow APNs round trip.
 */
function runWindow(store: SessionStore, creds: ReturnType<typeof credentials> | null, dragMs = 0) {
  let clock = NOW;
  return runPushWindow({
    store,
    credentials: creds,
    now: () => {
      clock += dragMs;
      return clock;
    },
    sleep: async (ms: number) => {
      clock += ms;
    },
  });
}

describe('live-earnings push window', () => {
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

  it('meters exactly one push per window, whatever the tick count', async () => {
    const { store } = fakeStore([row()]);
    const sent = stubApns();
    await runWindow(store, credentials());

    expect(sent).toHaveLength(TICKS_PER_WINDOW);
    // Six metered pushes a minute is what revokes the budget for a day.
    expect(sent.filter((s) => s.priority === '10')).toHaveLength(1);
    expect(sent[0].priority).toBe('10');
    expect(sent.slice(1).every((s) => s.priority === '5')).toBe(true);
  });

  it('carries the figure forward across the window', async () => {
    const { store } = fakeStore([row()]);
    const sent = stubApns();
    await runWindow(store, credentials());

    // RM45/hr is RM0.125 per ten seconds, so every tick is a new figure.
    const amounts = sent.map((s) => (s.body['content-state'] as { earnedText: string }).earnedText);
    expect(amounts[0]).toBe('RM45.00');
    expect(amounts.at(-1)).toBe('RM45.63');
    expect(new Set(amounts).size).toBe(TICKS_PER_WINDOW);
  });

  it('does nothing at all when APNs is not configured', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { store, statements } = fakeStore([row()]);
    const sent = stubApns();
    await runWindow(store, null);

    expect(sent).toHaveLength(0);
    // Must not prune either: the sessions are running, just not pushable yet.
    expect(statements).toHaveLength(0);
    expect(warn).toHaveBeenCalled();
  });

  it('sends nothing while the figure is too small to move', async () => {
    // At RM0.10/hr the second decimal does not change within a minute.
    const { store } = fakeStore([row({ hourly_rate: 0.1, last_pushed_text: 'RM0.10' })]);
    const sent = stubApns();
    await runWindow(store, credentials());
    expect(sent).toHaveLength(0);
  });

  it('ends a session that has run out, once, and stops pushing it', async () => {
    const endsAt = NOW - 1000;
    const { store } = fakeStore([
      row({ ends_at: endsAt, last_pushed_text: 'RM45.00', started_at: endsAt - 3_600_000 }),
    ]);
    const sent = stubApns();
    await runWindow(store, credentials());

    expect(sent).toHaveLength(1);
    expect(sent[0].body.event).toBe('end');
  });

  it('drops a dead token and stops pushing it for the rest of the window', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { store, statements } = fakeStore([row()]);
    const sent = stubApns(410, 'Unregistered');
    await runWindow(store, credentials());

    // One attempt, then the row is out for the remaining ticks.
    expect(sent).toHaveLength(1);
    expect(warn).toHaveBeenCalled();
    const del = statements.find((s) => s.sql.includes('DELETE FROM live_activity_sessions'));
    expect(String(del?.args[1])).toContain('a1b2c3d4e5f60718');
  });

  it('keeps a row after a transient failure so the next window retries', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { store, statements } = fakeStore([row()]);
    stubApns(429, 'TooManyRequests');
    await runWindow(store, credentials());

    const del = statements.find((s) => s.sql.includes('DELETE FROM live_activity_sessions'));
    expect(String(del?.args[1])).toBe('[]');
    expect(warn).toHaveBeenCalled();
  });

  it('writes to D1 once per session, not once per tick', async () => {
    const { store, statements } = fakeStore([row()]);
    stubApns();
    await runWindow(store, credentials());

    const updates = statements.filter((s) => s.sql.includes('SET last_pushed_text'));
    expect(updates).toHaveLength(1);
    expect(updates[0].args[0]).toBe('RM45.63');
    // and the rows are read once for the whole window
    expect(statements.filter((s) => s.sql.includes('SELECT push_token'))).toHaveLength(1);
  });

  // --- cost and blast radius ------------------------------------------------
  //
  // A Worker invocation is capped on external subrequests (10,000 paid, 50
  // free) and exceeding it throws part-way through, leaving an arbitrary subset
  // of users pushed. So the window scales its work to the budget instead.

  it('drops the tick rate rather than the subrequest budget under load', async () => {
    // Enough sessions that six ticks each would blow the budget.
    const many = Array.from({ length: 300 }, (_, i) =>
      row({ push_token: `token${String(i).padStart(12, '0')}` }),
    );
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { store } = fakeStore(many);
    const sent = stubApns();
    await runWindow(store, credentials());

    expect(sent.length).toBeLessThanOrEqual(MAX_PUSHES_PER_WINDOW);
    // Every session still gets its guaranteed metered push...
    expect(sent.filter((s) => s.priority === '10')).toHaveLength(300);
    // ...and the degradation is announced, not silent.
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('dropping to'));
  });

  it('shouts when sessions are being dropped entirely', async () => {
    const full = Array.from({ length: CRON_BATCH_SIZE }, (_, i) =>
      row({ push_token: `token${String(i).padStart(12, '0')}` }),
    );
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { store } = fakeStore(full);
    stubApns();
    await runWindow(store, credentials());

    expect(error).toHaveBeenCalledWith(expect.stringContaining('not being pushed'));
  });

  it('gives up its remaining ticks rather than overlap the next window', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { store } = fakeStore([row()]);
    const sent = stubApns();
    // Each clock read costs 6s, so the window blows its deadline early.
    await runWindow(store, credentials(), 6_000);

    expect(sent.length).toBeLessThan(TICKS_PER_WINDOW);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('ran long'));
    // The deadline must leave headroom before the next cron fires.
    expect(WINDOW_DEADLINE_MS).toBeLessThan(60_000);
  });

  it('does not write to D1 every idle minute', async () => {
    const { store, statements } = fakeStore([]);
    stubApns();
    await runWindow(store, credentials());
    // NOW is not a sweep minute: the read happens, the delete does not.
    expect(statements.filter((s) => s.sql.includes('DELETE'))).toHaveLength(0);
  });

  it('still sweeps expired rows on a sweep minute', async () => {
    const { store, statements } = fakeStore([]);
    stubApns();
    let clock = 1_700_003_400_000; // a minute divisible by 10
    await runPushWindow({
      store,
      credentials: credentials(),
      now: () => clock,
      sleep: async (ms: number) => {
        clock += ms;
      },
    });
    expect(statements.filter((s) => s.sql.includes('DELETE'))).toHaveLength(1);
  });

  it('retries a finished session whose end push failed, rather than stranding it', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const endsAt = NOW - 1000;
    const { store, statements } = fakeStore([
      row({ ends_at: endsAt, started_at: endsAt - 3_600_000 }),
    ]);
    stubApns(503, 'ServiceUnavailable');
    await runWindow(store, credentials());

    // Not dropped: the card would otherwise sit on its second-to-last figure.
    const del = statements.find((s) => s.sql.includes('DELETE FROM live_activity_sessions'));
    expect(String(del?.args[1])).toBe('[]');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('end push failed'));
  });

  it('addresses each row through its own APNs environment', async () => {
    const { store } = fakeStore([
      row({ push_token: 'aaaa1111bbbb2222', environment: 'production' }),
      row({ push_token: 'cccc3333dddd4444', environment: 'sandbox' }),
    ]);
    const sent = stubApns();
    await runWindow(store, credentials());
    expect(new Set(sent.map((s) => s.token))).toEqual(
      new Set(['aaaa1111bbbb2222', 'cccc3333dddd4444']),
    );
    // and each still gets exactly one metered push
    expect(sent.filter((s) => s.priority === '10')).toHaveLength(2);
  });
});
