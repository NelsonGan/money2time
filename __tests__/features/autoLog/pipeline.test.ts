import {
  buildListenerConfigJson,
  parseAndroidCaptureJson,
  parseIosPendingAlertsJson,
  parseListenerStatusJson,
  parseSeenAppsJson,
  PAYMENT_CAPTURES_DIR,
  sortCaptureFileNames,
} from '~/features/autoLog/lib/captureQueue';
import { buildAlertDraft } from '~/features/autoLog/lib/draft';
import { parsePaymentAlert } from '~/features/autoLog/lib/parser';
import { PAYMENT_APPS } from '~/features/autoLog/lib/paymentApps';
import {
  androidCapturePackages,
  iosSourceKey,
  matchesIgnorePhrase,
  newAlertSource,
  parsePaymentAlertPrefs,
  paymentAlertSourceKey,
  serializePaymentAlertPrefs,
  withAlertSource,
} from '~/features/autoLog/lib/prefs';

import { account, prefs, source } from './helpers';

// The plugin's Kotlin writes the queue the JS side reads; the folder name is
// the contract between them.

const plugin = require('../../../plugins/withMoney2TimePaymentCapture.js') as {
  PAYMENT_CAPTURES_DIR?: string;
};

describe('the Android capture queue', () => {
  it('reads a listener capture file into an alert', () => {
    const file = '1759493100000-0b1c.json';
    const capture = parseAndroidCaptureJson(
      file,
      JSON.stringify({
        v: 1,
        package: 'com.example.bank',
        appLabel: 'Example Bank',
        postedAt: 1759493100000,
        key: '0|com.example.bank|7|null|10123',
        title: 'Card transaction',
        text: "You've spent RM25.00 at",
        bigText: "You've spent RM25.00 at STARBUCKS with card ending 1234.",
        subText: 'Savings',
      }),
    );
    expect(capture).toMatchObject({
      id: '1759493100000-0b1c',
      channel: 'android_notification',
      sourceKey: 'com.example.bank',
      sourceLabel: 'Example Bank',
      capturedAt: new Date(1759493100000).toISOString(),
      title: 'Card transaction',
      body: "You've spent RM25.00 at STARBUCKS with card ending 1234.",
      extra: ['Savings'],
      nativeKey: '0|com.example.bank|7|null|10123',
    });
  });

  it('takes the newest message of a messaging-style notification (bank SMS)', () => {
    const capture = parseAndroidCaptureJson(
      '1759493100000-a.json',
      JSON.stringify({
        package: 'com.google.android.apps.messaging',
        title: 'MAYBANK',
        messages: [{ text: 'older' }, { text: 'RM25.00 debited at SHELL' }],
      }),
    );
    expect(capture?.body).toBe('RM25.00 debited at SHELL');
  });

  it('degrades to nothing on malformed or empty files', () => {
    expect(parseAndroidCaptureJson('1-a.json', '{')).toBeNull();
    expect(parseAndroidCaptureJson('1-a.json', JSON.stringify({ package: 'x' }))).toBeNull();
    expect(parseAndroidCaptureJson('1-a.json', JSON.stringify({ text: 'RM1' }))).toBeNull();
  });

  it('only lists finished capture files, oldest first', () => {
    expect(
      sortCaptureFileNames([
        '1759493200000-b.json',
        '1759493100000-a.json',
        '1759493300000-c.json.part',
        'config.json',
        'status.json',
      ]),
    ).toEqual(['1759493100000-a.json', '1759493200000-b.json']);
  });

  it('shares its folder name with the config plugin', () => {
    expect(plugin.PAYMENT_CAPTURES_DIR).toBe(PAYMENT_CAPTURES_DIR);
  });

  it('reads the listener status and seen apps defensively', () => {
    expect(parseListenerStatusJson('nope').connected).toBe(false);
    expect(
      parseListenerStatusJson(JSON.stringify({ connected: true, lastNotificationAt: 5 })),
    ).toMatchObject({
      connected: true,
      lastNotificationAt: 5,
    });
    expect(
      parseSeenAppsJson(
        JSON.stringify([
          { package: 'a', label: 'A', lastSeenAt: 1 },
          { package: 'b', lastSeenAt: 2 },
          { label: 'no package' },
        ]),
      ).map((app) => app.package),
    ).toEqual(['b', 'a']);
  });

  it('writes the config the listener reads', () => {
    expect(
      JSON.parse(buildListenerConfigJson({ enabled: true, packages: ['x'], allowShell: false })),
    ).toMatchObject({
      v: 1,
      enabled: true,
      optedOut: false,
      packages: ['x'],
      allowShell: false,
      testTag: 'm2t-payment-alert-test',
    });
    expect(
      JSON.parse(
        buildListenerConfigJson({
          enabled: false,
          packages: [],
          allowShell: false,
          optedOut: true,
        }),
      ),
    ).toMatchObject({ enabled: false, optedOut: true });
  });
});

describe('the iOS alert queue', () => {
  it('reads what the Log Payment Alert intent queued', () => {
    const [capture] = parseIosPendingAlertsJson(
      JSON.stringify([
        {
          id: 'i1',
          createdAt: '2026-10-03T12:00:00.000Z',
          source: 'Maybank ',
          title: 'Card transaction',
          message: 'You spent RM25.00 at SHELL',
          accountId: 'visa',
        },
        { id: 'broken' },
      ]),
    );
    expect(capture).toMatchObject({
      id: 'i1',
      channel: 'ios_alert',
      sourceKey: 'maybank',
      sourceLabel: 'Maybank',
      presetAccountId: 'visa',
      body: 'You spent RM25.00 at SHELL',
    });
    expect(parseIosPendingAlertsJson('{')).toEqual([]);
  });

  it('folds the From value into one source key', () => {
    expect(iosSourceKey('  MAYBANK  2U ')).toBe('maybank 2u');
    expect(iosSourceKey(null)).toBe('ios');
  });
});

describe('payment alert prefs', () => {
  it('round-trips and survives a corrupt blob', () => {
    const withBank = withAlertSource(
      prefs(),
      source({ sourceKey: 'com.example.bank', accountId: 'savings' }),
    );
    const parsed = parsePaymentAlertPrefs(serializePaymentAlertPrefs(withBank));
    expect(
      parsed.sources[paymentAlertSourceKey('android_notification', 'com.example.bank')]?.accountId,
    ).toBe('savings');
    expect(parsePaymentAlertPrefs('not json').alertsEnabled).toBe(false);
    expect(parsePaymentAlertPrefs(JSON.stringify({ sources: { x: { nope: 1 } } })).sources).toEqual(
      {},
    );
  });

  it('gives the listener only enabled Android sources, and nothing when off', () => {
    let value = withAlertSource(prefs(), source({ sourceKey: 'b.bank' }));
    value = withAlertSource(value, source({ sourceKey: 'a.wallet' }));
    value = withAlertSource(value, source({ sourceKey: 'c.off', enabled: false }));
    value = withAlertSource(value, source({ channel: 'ios_alert', sourceKey: 'maybank' }));
    expect(androidCapturePackages(value)).toEqual(['a.wallet', 'b.bank']);
    expect(androidCapturePackages({ ...value, alertsEnabled: false })).toEqual([]);
  });

  it('starts a new source with no guessed account', () => {
    const created = newAlertSource(
      { channel: 'android_notification', sourceKey: 'x', label: 'X' },
      '2026-10-04T00:00:00.000Z',
    );
    expect(created.accountId).toBeNull();
    expect(created).not.toHaveProperty('mode');
    expect(created).not.toHaveProperty('accountMode');
  });

  it('matches global and per-source ignore phrases as whole words', () => {
    const value = prefs({ ignorePhrases: ['cashback'] });
    expect(matchesIgnorePhrase(value, null, 'you got rm5 cashback')).toBe(true);
    expect(
      matchesIgnorePhrase(value, source({ ignorePhrases: ['parking'] }), 'parking fee rm2'),
    ).toBe(true);
    expect(matchesIgnorePhrase(value, null, 'cashbacks are great')).toBe(false);
  });
});

describe('malformed native timestamps', () => {
  it('ignores captures whose timestamp exceeds the Date range', () => {
    expect(() =>
      parseAndroidCaptureJson(
        '9999999999999999999999-alert.json',
        JSON.stringify({ package: 'bank', text: 'Spent RM5', postedAt: 1e100 }),
      ),
    ).not.toThrow();
    expect(
      parseAndroidCaptureJson(
        '9999999999999999999999-alert.json',
        JSON.stringify({ package: 'bank', text: 'Spent RM5', postedAt: 1e100 }),
      ),
    ).toBeNull();
  });
});

describe('buildAlertDraft', () => {
  const accounts = [account({ id: 'myr', currency: 'MYR' })];

  it('dates the transaction at the alert and notes the merchant', () => {
    const draft = buildAlertDraft({
      parse: parsePaymentAlert({ body: 'You spent RM25.00 at SHELL' }),
      capturedAt: '2026-10-03T12:00:00.000Z',
      accountId: 'myr',
      categoryId: 'fuel',
      accounts,
      reportingCurrency: 'MYR',
    });
    expect(draft).toMatchObject({
      type: 'expense',
      amount: 25,
      currency: 'MYR',
      date: '2026-10-03T12:00:00.000Z',
      accountId: 'myr',
      categoryId: 'fuel',
      note: 'SHELL',
    });
  });

  it('keeps the billed amount of a foreign spend as the account amount', () => {
    const draft = buildAlertDraft({
      parse: parsePaymentAlert({ body: 'USD 12.00 (RM 56.30) at AMAZON.COM was approved' }),
      capturedAt: '2026-10-03T12:00:00.000Z',
      accountId: 'myr',
      categoryId: null,
      accounts,
      reportingCurrency: 'MYR',
    });
    expect(draft).toMatchObject({ currency: 'USD', amount: 12, accountAmount: 56.3 });
  });

  it('values a foreign spend at what the bank charged, not the market rate', () => {
    const parse = parsePaymentAlert({ body: 'USD 12.00 (RM 56.30) at AMAZON.COM was approved' });
    const draft = buildAlertDraft({
      parse,
      capturedAt: '2026-10-03T12:00:00.000Z',
      accountId: 'myr',
      categoryId: null,
      accounts,
      reportingCurrency: 'MYR',
    });
    expect(draft).toMatchObject({
      reportingCurrency: 'MYR',
      reportingAmount: 56.3,
      fxRate: 4.691667,
    });

    // A second amount in some other currency says nothing about the reporting one.
    const elsewhere = buildAlertDraft({
      parse,
      capturedAt: '2026-10-03T12:00:00.000Z',
      accountId: 'myr',
      categoryId: null,
      accounts,
      reportingCurrency: 'SGD',
    });
    expect(elsewhere).not.toHaveProperty('reportingAmount');
  });

  it('does not create a transaction for a wallet reload', () => {
    const draft = buildAlertDraft({
      parse: parsePaymentAlert({ body: 'Reload of RM100.00 successful.' }),
      capturedAt: '2026-10-03T12:00:00.000Z',
      accountId: 'wallet',
      categoryId: null,
      accounts,
      reportingCurrency: 'MYR',
    });
    expect(draft).toBeNull();
  });
});

describe('the curated payment app list', () => {
  it('has no duplicate packages', () => {
    const packages = PAYMENT_APPS.map((app) => app.package);
    expect(new Set(packages).size).toBe(packages.length);
  });
});
