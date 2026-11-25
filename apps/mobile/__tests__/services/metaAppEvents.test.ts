jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('~/services/posthog', () => ({ getAppVariant: () => 'production' }));
jest.mock('~/modules/meta-app-events', () => ({ getMetaAppEventsModule: jest.fn() }));
jest.mock('expo-localization', () => ({ getLocales: jest.fn(() => [{ regionCode: 'MY' }]) }));

import { decideMetaAppEvents, META_CONSENT_REGIONS } from '~/services/metaAppEvents';

const base = {
  platform: 'ios',
  isDevelopment: false,
  devOverride: false,
  appVariant: 'production',
  regionCode: 'MY',
};

describe('decideMetaAppEvents', () => {
  it('starts a store build in the campaign markets, without debug logging', () => {
    expect(decideMetaAppEvents(base)).toEqual({ start: true, debug: false });
    expect(decideMetaAppEvents({ ...base, platform: 'android', regionCode: 'SG' })).toEqual({
      start: true,
      debug: false,
    });
  });

  it('starts when the region is unknown', () => {
    expect(decideMetaAppEvents({ ...base, regionCode: null })).toEqual({
      start: true,
      debug: false,
    });
  });

  it('never starts on web', () => {
    expect(decideMetaAppEvents({ ...base, platform: 'web' })).toEqual({
      start: false,
      reason: 'platform',
    });
  });

  it('keeps development bundles quiet unless asked, then logs', () => {
    expect(decideMetaAppEvents({ ...base, isDevelopment: true })).toEqual({
      start: false,
      reason: 'development',
    });
    expect(decideMetaAppEvents({ ...base, isDevelopment: true, devOverride: true })).toEqual({
      start: true,
      debug: true,
    });
  });

  it("skips Google Play's pre-launch test devices", () => {
    expect(decideMetaAppEvents({ ...base, platform: 'android', appVariant: 'test_lab' })).toEqual({
      start: false,
      reason: 'test_lab',
    });
  });

  it('skips regions where ad measurement needs consent, in any case', () => {
    for (const region of ['DE', 'fr', 'GB', 'CH', 'NO', 'IE']) {
      expect(decideMetaAppEvents({ ...base, regionCode: region })).toEqual({
        start: false,
        reason: 'consent_region',
      });
    }
  });

  it('covers the 27 EU members, the 3 other EEA states, the UK and Switzerland', () => {
    expect(META_CONSENT_REGIONS.size).toBe(32);
    for (const market of ['MY', 'SG', 'US', 'ID', 'TW', 'HK', 'CN']) {
      expect(META_CONSENT_REGIONS.has(market)).toBe(false);
    }
  });
});

describe('startMetaAppEvents', () => {
  // A fresh module per test: the service starts at most once per launch.
  function load(native: unknown) {
    let api!: typeof import('~/services/metaAppEvents');
    jest.isolateModules(() => {
      (require('~/modules/meta-app-events').getMetaAppEventsModule as jest.Mock).mockReturnValue(
        native,
      );
      api = require('~/services/metaAppEvents');
    });
    return api;
  }

  it('does nothing without the native module', () => {
    expect(() => load(null).startMetaAppEvents()).not.toThrow();
  });

  it('switches the SDK off when this launch may not measure, once per launch', () => {
    const native = { start: jest.fn(async () => true), disable: jest.fn(async () => {}) };
    const { startMetaAppEvents } = load(native);
    (globalThis as { __DEV__?: boolean }).__DEV__ = true;
    try {
      startMetaAppEvents();
      startMetaAppEvents();
    } finally {
      delete (globalThis as { __DEV__?: boolean }).__DEV__;
    }
    expect(native.start).not.toHaveBeenCalled();
    expect(native.disable).toHaveBeenCalledTimes(1);
  });

  it('starts a store build once per launch', () => {
    const native = { start: jest.fn(async () => true), disable: jest.fn(async () => {}) };
    const { startMetaAppEvents } = load(native);
    startMetaAppEvents();
    startMetaAppEvents();
    expect(native.start).toHaveBeenCalledTimes(1);
    expect(native.start).toHaveBeenCalledWith(false);
    expect(native.disable).not.toHaveBeenCalled();
  });

  it('swallows a native failure', async () => {
    const native = { start: jest.fn(() => Promise.reject(new Error('x'))), disable: jest.fn() };
    load(native).startMetaAppEvents();
    await Promise.resolve();
    expect(native.start).toHaveBeenCalled();
  });
});
