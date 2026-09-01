import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { LiveEarningsSession } from '~/features/widgets/lib/liveEarnings';
import { MS_PER_HOUR, MS_PER_MINUTE } from '~/features/widgets/lib/liveEarnings';
import {
  buildLiveEarningsTicks,
  buildLiveEarningsWidgetPayload,
  LIVE_EARNINGS_COARSE_STEP_MINUTES,
  LIVE_EARNINGS_FINE_STEP_MINUTES,
  LIVE_EARNINGS_FINE_WINDOW_MINUTES,
  LIVE_EARNINGS_MAX_TICKS,
  LIVE_EARNINGS_WIDGET_URL,
} from '~/features/widgets/lib/liveEarningsWidget';

const NOW = new Date(2023, 10, 14, 9, 0, 0).getTime();
const RATE = 60;

function sessionOf(hours: number, startedAt = NOW): LiveEarningsSession {
  return { startedAt, endsAt: startedAt + hours * MS_PER_HOUR, hourlyRate: RATE };
}

const money = (value: number) => `$${value.toFixed(2)}`;

const accent = { accentLightHex: 0x1f8a6f, accentDarkHex: 0x34c99a };

describe('buildLiveEarningsTicks', () => {
  it('opens on the moment it was built, so the widget is right immediately', () => {
    const ticks = buildLiveEarningsTicks(sessionOf(8), money, NOW);
    expect(ticks[0].at).toBe(NOW);
    expect(ticks[0].label).toBe('$0.00');
  });

  it('closes on the session end carrying its full value', () => {
    const session = sessionOf(4);
    const ticks = buildLiveEarningsTicks(session, money, NOW);
    const last = ticks[ticks.length - 1];
    expect(last.at).toBe(session.endsAt);
    expect(last.label).toBe('$240.00');
    expect(last.progress).toBe(1);
  });

  it('steps by the minute through the first hour, then more coarsely', () => {
    const ticks = buildLiveEarningsTicks(sessionOf(8), money, NOW);
    expect(ticks[1].at - ticks[0].at).toBe(LIVE_EARNINGS_FINE_STEP_MINUTES * MS_PER_MINUTE);

    const pastFineWindow = ticks.findIndex(
      (tick) => tick.at - NOW >= LIVE_EARNINGS_FINE_WINDOW_MINUTES * MS_PER_MINUTE,
    );
    expect(ticks[pastFineWindow + 1].at - ticks[pastFineWindow].at).toBe(
      LIVE_EARNINGS_COARSE_STEP_MINUTES * MS_PER_MINUTE,
    );
  });

  it('fits a whole 8-hour session inside one timeline, well under the cap', () => {
    const ticks = buildLiveEarningsTicks(sessionOf(8), money, NOW);
    expect(ticks.length).toBeLessThanOrEqual(LIVE_EARNINGS_MAX_TICKS);
    // The point of the two-speed schedule: the last entry really is the end of
    // the session, so the widget never runs out of timeline mid-shift.
    expect(ticks[ticks.length - 1].at).toBe(sessionOf(8).endsAt);
  });

  it('never repeats an instant, so no two entries fight over the same minute', () => {
    const ticks = buildLiveEarningsTicks(sessionOf(8), money, NOW);
    expect(new Set(ticks.map((tick) => tick.at)).size).toBe(ticks.length);
  });

  it('leaves room under the cap for the closing tick', () => {
    // The two-speed schedule is what keeps this true: minute-by-minute for the
    // whole 8 hours would be 480 entries, well past what WidgetKit tolerates.
    const ticks = buildLiveEarningsTicks(sessionOf(8), money, NOW);
    expect(ticks.length).toBeLessThan(LIVE_EARNINGS_MAX_TICKS);
    expect(ticks[ticks.length - 1].at).toBe(sessionOf(8).endsAt);
  });

  it('rises monotonically, in both time and money', () => {
    const ticks = buildLiveEarningsTicks(sessionOf(8), money, NOW);
    for (let i = 1; i < ticks.length; i += 1) {
      expect(ticks[i].at).toBeGreaterThan(ticks[i - 1].at);
      expect(ticks[i].value).toBeGreaterThan(ticks[i - 1].value);
      expect(ticks[i].progress).toBeGreaterThan(ticks[i - 1].progress);
    }
  });

  it('collapses a session that is already over to its final figure', () => {
    const session = sessionOf(1);
    const ticks = buildLiveEarningsTicks(session, money, session.endsAt + MS_PER_HOUR);
    expect(ticks).toHaveLength(1);
    expect(ticks[0].at).toBe(session.endsAt);
    expect(ticks[0].label).toBe('$60.00');
  });

  it('starts a backdated session part-way up rather than at zero', () => {
    const session = sessionOf(4, NOW - 2 * MS_PER_HOUR);
    const ticks = buildLiveEarningsTicks(session, money, NOW);
    expect(ticks[0].label).toBe('$120.00');
    expect(ticks[0].progress).toBeCloseTo(0.5, 6);
  });
});

describe('buildLiveEarningsWidgetPayload', () => {
  const copy = {
    rateText: '$60.00/hr',
    endsText: 'Ends 5:00 PM',
    idleText: 'Not tracking',
  };

  it('carries the session total, which is what the progress bar is scaled to', () => {
    const payload = buildLiveEarningsWidgetPayload({
      session: sessionOf(4),
      copy,
      accent,
      formatAmount: money,
      now: NOW,
    });
    expect(payload.active).toBe(true);
    expect(payload.totalText).toBe('$240.00');
    expect(payload.ticks.length).toBeGreaterThan(1);
  });

  it('writes an idle payload rather than nothing when no session runs', () => {
    const payload = buildLiveEarningsWidgetPayload({
      session: null,
      copy,
      accent,
      formatAmount: money,
      now: NOW,
    });
    // The widget has to be told a session ended, or it goes on rendering a
    // timeline that is no longer true.
    expect(payload.active).toBe(false);
    expect(payload.ticks).toEqual([]);
    expect(payload.idleText).toBe('Not tracking');
    expect(payload.accentLightHex).toBe(accent.accentLightHex);
  });

  it('always names a deep link, so a tap has somewhere to go', () => {
    for (const session of [sessionOf(2), null]) {
      const payload = buildLiveEarningsWidgetPayload({
        session,
        copy,
        accent,
        formatAmount: money,
        now: NOW,
      });
      expect(payload.openUrl).toMatch(/^money2time:\/\//);
    }
  });
});

/**
 * Where a tap on the Live Activity lands.
 *
 * The card's Swift lives in the config plugin (`ios/` is generated and
 * gitignored), so this reads it from there. Nothing else would notice it going
 * missing: without a `widgetURL` a tap still opens the app, just on whatever
 * screen it was last left on, which looks like the link working until you
 * watch where it actually lands.
 */
describe('the live-earnings Live Activity as a tap target', () => {
  const PLUGIN = path.resolve(__dirname, '../../plugins/withMoney2TimeWidgets.js');
  const source = readFileSync(PLUGIN, 'utf8');

  it('opens the same route the ticker widget does', () => {
    const declared = source.match(/let liveEarningsOpenUrl = URL\(string: "([^"]+)"\)/);
    expect(declared?.[1]).toBe(LIVE_EARNINGS_WIDGET_URL);
  });

  it('carries the link on the Lock Screen and in the Dynamic Island', () => {
    const start = source.indexOf('struct Money2TimeLiveEarningsWidget: Widget {');
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf('\n}\n', start);
    expect(end).toBeGreaterThan(start);
    // The two presentations are separate closures on ActivityConfiguration, so
    // a link on one does not reach the other.
    const body = source.slice(start, end);
    expect(body.match(/\.widgetURL\(liveEarningsOpenUrl\)/g)).toHaveLength(2);
  });
});
