import fs from 'fs';
import path from 'path';

const plugin = require('../../plugins/withMetaAppEvents.js') as {
  META_PACKAGES: string[];
  META_INIT_PROVIDER: string;
  MANIFEST_META_DATA: Record<string, string>;
  applyMetaInfoPlist: (plist: Record<string, unknown>, options: unknown) => Record<string, unknown>;
  applyMetaManifest: (manifest: unknown) => {
    manifest: {
      $: Record<string, string>;
      queries: { package: { $: { 'android:name': string } }[] }[];
      application: {
        'meta-data': { $: Record<string, string> }[];
        provider: { $: Record<string, string> }[];
      }[];
    };
  };
  applyMetaStrings: (
    strings: unknown,
    options: unknown,
  ) => {
    resources: { string: { $: { name: string }; _: string }[] };
  };
};

const options = {
  appId: '1607958107752114',
  clientToken: 'fae834e5547bfca86abb71dc25bba784',
  displayName: 'Money2Time',
};

const appJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../../app.json'), 'utf8')) as {
  expo: {
    plugins: unknown[];
    ios: { infoPlist: Record<string, unknown> };
    android: { blockedPermissions: string[] };
  };
};

function emptyManifest() {
  return {
    manifest: {
      $: { 'xmlns:android': 'http://schemas.android.com/apk/res/android' },
      application: [{ $: { 'android:name': '.MainApplication' } }],
    },
  };
}

describe('withMetaAppEvents', () => {
  it('is configured in app.json with the Money2Time Meta app', () => {
    const entry = appJson.expo.plugins.find(
      (p) => Array.isArray(p) && p[0] === './plugins/withMetaAppEvents',
    ) as [string, typeof options];
    expect(entry?.[1]).toEqual(options);
  });

  it('rejects a malformed app ID or client token', () => {
    expect(() => plugin.applyMetaInfoPlist({}, { ...options, appId: 'fb123' })).toThrow();
    expect(() => plugin.applyMetaInfoPlist({}, { ...options, clientToken: 'abc' })).toThrow();
  });

  it('keeps the iOS SDK from logging or collecting the advertising ID on its own', () => {
    const plist = plugin.applyMetaInfoPlist({ CFBundleDisplayName: 'Money2Time' }, options);
    expect(plist).toMatchObject({
      CFBundleDisplayName: 'Money2Time',
      FacebookAppID: options.appId,
      FacebookClientToken: options.clientToken,
      FacebookAutoLogAppEventsEnabled: false,
      FacebookAdvertiserIDCollectionEnabled: false,
    });
  });

  it('never asks for App Tracking Transparency', () => {
    expect(appJson.expo.ios.infoPlist).not.toHaveProperty('NSUserTrackingUsageDescription');
  });

  it('keeps the Android SDK from starting, logging or matching on its own', () => {
    const manifest = plugin.applyMetaManifest(emptyManifest());
    const metaData = Object.fromEntries(
      manifest.manifest.application[0]['meta-data'].map((m) => [
        m.$['android:name'],
        m.$['android:value'],
      ]),
    );
    expect(metaData).toEqual(plugin.MANIFEST_META_DATA);
    expect(metaData['com.facebook.sdk.ApplicationId']).toBe('@string/facebook_app_id');
    for (const key of [
      'com.facebook.sdk.AutoInitEnabled',
      'com.facebook.sdk.AutoLogAppEventsEnabled',
      'com.facebook.sdk.AdvertiserIDCollectionEnabled',
      'com.facebook.sdk.AutoLogMetaDataEnabled',
    ]) {
      expect(metaData[key]).toBe('false');
    }
  });

  it("removes the SDK's startup provider, once, however often it runs", () => {
    const twice = plugin.applyMetaManifest(plugin.applyMetaManifest(emptyManifest()));
    expect(twice.manifest.$['xmlns:tools']).toBe('http://schemas.android.com/tools');
    expect(twice.manifest.application[0].provider).toEqual([
      { $: { 'android:name': plugin.META_INIT_PROVIDER, 'tools:node': 'remove' } },
    ]);
    expect(plugin.META_INIT_PROVIDER).toBe('com.facebook.internal.FacebookInitProvider');
  });

  it('declares the Meta apps once, however often it runs', () => {
    const twice = plugin.applyMetaManifest(plugin.applyMetaManifest(emptyManifest()));
    const names = twice.manifest.queries.flatMap((q) => q.package.map((p) => p.$['android:name']));
    expect(names).toEqual(plugin.META_PACKAGES);
  });

  it('puts the IDs in string resources', () => {
    const strings = plugin.applyMetaStrings({ resources: {} }, options);
    const byName = Object.fromEntries(strings.resources.string.map((s) => [s.$.name, s._]));
    expect(byName).toEqual({
      facebook_app_id: options.appId,
      facebook_client_token: options.clientToken,
    });
  });

  it("blocks the advertising-ID and Privacy Sandbox permissions the SDK's manifest adds", () => {
    expect(appJson.expo.android.blockedPermissions).toEqual(
      expect.arrayContaining([
        'com.google.android.gms.permission.AD_ID',
        'android.permission.ACCESS_ADSERVICES_AD_ID',
        'android.permission.ACCESS_ADSERVICES_ATTRIBUTION',
        'android.permission.ACCESS_ADSERVICES_CUSTOM_AUDIENCE',
        'android.permission.ACCESS_ADSERVICES_TOPICS',
      ]),
    );
  });
});
