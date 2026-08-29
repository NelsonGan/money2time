import {
  nextScheduledStart,
  wallClockToInstant,
  zoneOffsetMs,
} from '../../cloudflare/workers/live-earnings/src/schedule';
import type { SessionStore } from '../../cloudflare/workers/live-earnings/src/sessions';
import {
  runScheduledStarts,
  type ScheduleRow,
  START_GRACE_MS,
} from '../../cloudflare/workers/live-earnings/src/starts';

/**
 * The scheduled-start pass: the half of live earnings that raises the card at
 * the start of a shift, on a phone that is not running the app.
 *
 * Two things carry the feature and both are tested here. One is the local-time
 * arithmetic: a schedule is a *wall clock*, so it has to survive a daylight
 * saving change, an offset that is not a whole hour, and a device that has
 * travelled. The other is the set of states the pass must refuse to start in -
 * a card already running, a start that is hours late, a token APNs has
 * rejected - because the cost of getting those wrong is two contradictory
 * cards on a Lock Screen, or a shift that claims to have begun at breakfast.
 *
 * D1 is faked at the statement level; the clock is injected.
 */

const KL = 'Asia/Kuala_Lumpur'; // +8, no DST
const NY = 'America/New_York'; // DST both ways
const CHATHAM = 'Pacific/Chatham'; // +12:45 / +13:45, a 45-minute offset

/** 2026-08-31 09:00 in Kuala Lumpur, a Monday. */
const MONDAY_9AM_KL = Date.parse('2026-08-31T01:00:00Z');

function scheduleRow(over: Partial<ScheduleRow> = {}): ScheduleRow {
  return {
    push_to_start_token: 'ab'.repeat(64),
    app_user_id: 'user-1',
    environment: 'production',
    time_zone: KL,
    days: JSON.stringify([1, 2, 3, 4, 5]),
    hour: 9,
    minute: 0,
    duration_minutes: 480,
    hourly_rate: 45,
    currency_symbol: 'RM',
    title_text: "You've earned this much today",
    rate_text: 'RM45.00/hr',
    ends_text: 'Ends 5:00 PM',
    total_text: 'of RM360.00',
    refresh_text: 'Refresh',
    zero_text: 'RM0.00',
    alert_title: 'Live earnings started',
    alert_body: 'Your clock is running.',
    accent_light: 0x1f8a6f,
    accent_dark: 0x34c99a,
    next_start_at: MONDAY_9AM_KL,
    ...over,
  };
}

/**
 * Answers the two SELECTs the pass makes - due schedules, and which accounts
 * already have a card up - and records every statement so the test can assert
 * on what was rearmed or deleted.
 */
function fakeStore(rows: ScheduleRow[], busyUserIds: string[] = []) {
  const statements: { sql: string; args: unknown[] }[] = [];
  const store: SessionStore = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async all<T>() {
              statements.push({ sql, args });
              const results = sql.includes('live_activity_sessions')
                ? busyUserIds.map((id) => ({ app_user_id: id }))
                : rows;
              return { results: results as unknown as T[] };
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

interface SentStart {
  token: string;
  priority: string;
  expiration: string;
  aps: Record<string, unknown>;
}

function stubApns(status = 200, reason?: string) {
  const sent: SentStart[] = [];
  global.fetch = jest.fn(async (url: unknown, init?: unknown) => {
    const request = init as RequestInit;
    const headers = request.headers as Record<string, string>;
    sent.push({
      token: String(url).split('/3/device/')[1],
      priority: String(headers['apns-priority']),
      expiration: String(headers['apns-expiration']),
      aps: (JSON.parse(String(request.body)) as { aps: Record<string, unknown> }).aps,
    });
    return new Response(reason ? JSON.stringify({ reason }) : '', { status });
  }) as unknown as typeof fetch;
  return sent;
}

let privateKeyPem = '';
const credentials = () => ({
  keyId: 'ABCDE12345',
  teamId: 'TEAM123456',
  privateKeyPem,
  bundleId: 'com.nelsongan.money2time',
});

/** The statement that rearms a row, with the `next_start_at` it was given. */
function rearmedTo(statements: { sql: string; args: unknown[] }[]): number | undefined {
  const update = statements.find((s) => s.sql.includes('UPDATE live_activity_schedules'));
  return update?.args[0] as number | undefined;
}

describe('scheduled start pass', () => {
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

  it('starts a due shift and rearms it for the next weekday', async () => {
    const { store, statements } = fakeStore([scheduleRow()]);
    const sent = stubApns();
    await runScheduledStarts({ store, credentials: credentials(), now: () => MONDAY_9AM_KL });

    expect(sent).toHaveLength(1);
    expect(sent[0].aps.event).toBe('start');
    expect(sent[0].aps['attributes-type']).toBe('Money2TimeEarningsAttributes');
    // Metered: a shift that begins ten minutes late has missed the point.
    expect(sent[0].priority).toBe('10');
    // Tuesday, same time.
    expect(rearmedTo(statements)).toBe(MONDAY_9AM_KL + 24 * 60 * 60 * 1000);
  });

  it('backdates the card to the scheduled minute, not to delivery', async () => {
    const { store } = fakeStore([scheduleRow()]);
    const sent = stubApns();
    // The cron fires a few seconds into the minute, as it always does.
    await runScheduledStarts({
      store,
      credentials: credentials(),
      now: () => MONDAY_9AM_KL + 4_000,
    });

    const attributes = sent[0].aps.attributes as Record<string, number>;
    expect(attributes.startedAtMillis).toBe(MONDAY_9AM_KL);
    expect(attributes.endsAtMillis).toBe(MONDAY_9AM_KL + 8 * 60 * 60 * 1000);
    // Millis as plain numbers: a Swift `Date` would decode these as seconds
    // since 2001 and land the shift 31 years out.
    expect(typeof attributes.startedAtMillis).toBe('number');
  });

  it('opens the card at zero, in the copy the app registered', async () => {
    const { store } = fakeStore([scheduleRow()]);
    const sent = stubApns();
    await runScheduledStarts({ store, credentials: credentials(), now: () => MONDAY_9AM_KL });

    expect(sent[0].aps['content-state']).toMatchObject({ earnedText: 'RM0.00', earned: 0 });
    expect(sent[0].aps.attributes).toMatchObject({
      rateText: 'RM45.00/hr',
      endsText: 'Ends 5:00 PM',
      totalText: 'of RM360.00',
      accentLightHex: 0x1f8a6f,
    });
    // Required by Apple for a start event, and what a paired Watch shows.
    expect(sent[0].aps.alert).toEqual({
      title: 'Live earnings started',
      body: 'Your clock is running.',
    });
  });

  it('does not start a second card when one is already running', async () => {
    // The user clocked in by hand at 08:00, or a long shift is still going.
    const { store, statements } = fakeStore([scheduleRow()], ['user-1']);
    const sent = stubApns();
    await runScheduledStarts({ store, credentials: credentials(), now: () => MONDAY_9AM_KL });

    expect(sent).toHaveLength(0);
    // Still rearmed: the schedule moves on to tomorrow rather than retrying.
    expect(rearmedTo(statements)).toBe(MONDAY_9AM_KL + 24 * 60 * 60 * 1000);
  });

  it("leaves someone else's running card alone", async () => {
    const { store } = fakeStore([scheduleRow()], ['someone-else']);
    const sent = stubApns();
    await runScheduledStarts({ store, credentials: credentials(), now: () => MONDAY_9AM_KL });
    expect(sent).toHaveLength(1);
  });

  it('skips a start it is too late to make honestly', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { store, statements } = fakeStore([scheduleRow()]);
    const sent = stubApns();
    // The phone was off all morning and the Worker only reaches it at 11:00.
    await runScheduledStarts({
      store,
      credentials: credentials(),
      now: () => MONDAY_9AM_KL + 2 * 60 * 60 * 1000,
    });

    expect(sent).toHaveLength(0);
    expect(rearmedTo(statements)).toBe(MONDAY_9AM_KL + 24 * 60 * 60 * 1000);
    warn.mockRestore();
  });

  it('still starts a shift that is only seconds late', async () => {
    const { store } = fakeStore([scheduleRow()]);
    const sent = stubApns();
    await runScheduledStarts({
      store,
      credentials: credentials(),
      now: () => MONDAY_9AM_KL + START_GRACE_MS - 1,
    });
    expect(sent).toHaveLength(1);
    // APNs is told to give up at the same moment this pass would.
    expect(Number(sent[0].expiration)).toBe(Math.floor((MONDAY_9AM_KL + START_GRACE_MS) / 1000));
  });

  it('drops a schedule whose token APNs has buried', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { store, statements } = fakeStore([scheduleRow()]);
    stubApns(410, 'Unregistered');
    await runScheduledStarts({ store, credentials: credentials(), now: () => MONDAY_9AM_KL });

    expect(statements.some((s) => s.sql.includes('WHERE push_to_start_token = ?1'))).toBe(true);
    expect(warn).toHaveBeenCalled();
  });

  it('leaves a schedule armed after a transient failure, so the next minute retries', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { store, statements } = fakeStore([scheduleRow()]);
    stubApns(503, 'InternalServerError');
    await runScheduledStarts({ store, credentials: credentials(), now: () => MONDAY_9AM_KL });

    expect(statements.some((s) => s.sql.includes('UPDATE live_activity_schedules'))).toBe(false);
    expect(statements.some((s) => s.sql.includes('WHERE push_to_start_token = ?1'))).toBe(false);
    warn.mockRestore();
  });

  it('starts nothing, and rearms nothing, when APNs is not configured', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { store, statements } = fakeStore([scheduleRow()]);
    const sent = stubApns();
    await runScheduledStarts({ store, credentials: null, now: () => MONDAY_9AM_KL });

    expect(sent).toHaveLength(0);
    // Rearming here would silently skip a start that never went out.
    expect(statements.some((s) => s.sql.includes('UPDATE live_activity_schedules'))).toBe(false);
    expect(warn).toHaveBeenCalled();
  });

  it('disarms a schedule whose last day was deselected', async () => {
    const { store, statements } = fakeStore([scheduleRow({ days: '[]' })]);
    const sent = stubApns();
    await runScheduledStarts({ store, credentials: credentials(), now: () => MONDAY_9AM_KL });

    expect(sent).toHaveLength(1);
    // Zero is "never": nothing comes due again until the app re-registers.
    expect(rearmedTo(statements)).toBe(0);
  });

  it('sweeps schedules the app has stopped confirming, one minute in ten', async () => {
    const swept = (at: number) => {
      const { store, statements } = fakeStore([]);
      stubApns();
      return runScheduledStarts({ store, credentials: credentials(), now: () => at }).then(() =>
        statements.some((s) => s.sql.includes('updated_at <')),
      );
    };
    // A row only stops being refreshed when the install is gone, and a dead
    // schedule must not push at a stranger's phone forever.
    await expect(swept(MONDAY_9AM_KL)).resolves.toBe(true);
    await expect(swept(MONDAY_9AM_KL + 60_000)).resolves.toBe(false);
  });
});

describe('next scheduled start', () => {
  const local = (at: number, timeZone: string) =>
    new Intl.DateTimeFormat('en-GB', {
      timeZone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(at));

  it('finds the next selected weekday at the chosen local time', () => {
    // Saturday 09:00 in KL; the schedule is weekdays only.
    const from = Date.parse('2026-08-29T01:00:00Z');
    const next = nextScheduledStart(
      { days: [1, 2, 3, 4, 5], hour: 9, minute: 0, timeZone: KL },
      from,
    );
    expect(local(next!, KL)).toBe('Mon 09:00');
  });

  it('is strictly forward-looking, so a foreground never re-arms the start it just missed', () => {
    // The app re-registers at exactly 09:00, a moment after the cron fired.
    const next = nextScheduledStart({ days: [1], hour: 9, minute: 0, timeZone: KL }, MONDAY_9AM_KL);
    expect(next).toBe(MONDAY_9AM_KL + 7 * 24 * 60 * 60 * 1000);
  });

  it('keeps a 09:00 shift at 09:00 across a spring-forward', () => {
    // 2026-03-08 is when New York loses an hour.
    const friday = Date.parse('2026-03-06T14:00:00Z');
    const next = nextScheduledStart({ days: [0], hour: 9, minute: 0, timeZone: NY }, friday);
    expect(local(next!, NY)).toBe('Sun 09:00');
    // 13:00Z is 09:00 EDT. Adding a flat 24h to Saturday's start would have
    // landed at 10:00 and been an hour late every day until autumn.
    expect(new Date(next!).toISOString()).toBe('2026-03-08T13:00:00.000Z');
  });

  it('keeps a 09:00 shift at 09:00 across a fall-back', () => {
    const friday = Date.parse('2026-10-30T13:00:00Z');
    const next = nextScheduledStart({ days: [0], hour: 9, minute: 0, timeZone: NY }, friday);
    expect(local(next!, NY)).toBe('Sun 09:00');
    expect(new Date(next!).toISOString()).toBe('2026-11-01T14:00:00.000Z');
  });

  it('handles an offset that is not a whole hour', () => {
    const from = Date.parse('2026-08-29T01:00:00Z');
    const next = nextScheduledStart({ days: [1], hour: 9, minute: 0, timeZone: CHATHAM }, from);
    expect(local(next!, CHATHAM)).toBe('Mon 09:00');
  });

  it('never fires with no days selected', () => {
    expect(nextScheduledStart({ days: [], hour: 9, minute: 0, timeZone: KL }, MONDAY_9AM_KL)).toBe(
      null,
    );
    expect(
      nextScheduledStart({ days: [9, -1, 1.5], hour: 9, minute: 0, timeZone: KL }, MONDAY_9AM_KL),
    ).toBe(null);
  });

  it('falls back to UTC rather than throwing on a zone it cannot read', () => {
    const from = Date.parse('2026-08-30T00:00:00Z'); // Sunday
    const next = nextScheduledStart(
      { days: [1], hour: 9, minute: 0, timeZone: 'Nowhere/Fake' },
      from,
    );
    expect(new Date(next!).toISOString()).toBe('2026-08-31T09:00:00.000Z');
  });

  it('reads an offset and a wall clock consistently', () => {
    expect(zoneOffsetMs(MONDAY_9AM_KL, KL)).toBe(8 * 60 * 60 * 1000);
    expect(wallClockToInstant(2026, 8, 31, 9, 0, KL)).toBe(MONDAY_9AM_KL);
  });
});
