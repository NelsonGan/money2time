/**
 * Meta app events: lets Meta Ads Manager count the installs and app launches
 * its ads bring in, so a campaign shows a real cost per install and an App
 * promotion campaign can optimize for installs. Design and privacy rules:
 * "Meta app events" in the README's Analytics section.
 *
 * The SDK sends only its automatic install and app-launch events. It never
 * gets the app user ID, an advertising ID, financial data or anything a user
 * types, and the app never asks for App Tracking Transparency. It does not
 * start:
 *
 * - in a development bundle, unless `EXPO_PUBLIC_META_APP_EVENTS_DEV=1`
 *   (then with the SDK's debug logging on);
 * - on Google Play's pre-launch test devices (`test_lab`), which are not
 *   installs from ads;
 * - when the device's region is in the EEA, the UK or Switzerland, where ad
 *   measurement needs consent the app does not ask for. A launch that does not
 *   start also switches off what the SDK remembers from an earlier one.
 */

import { getLocales } from 'expo-localization';
import { Platform } from 'react-native';

import { getMetaAppEventsModule } from '~/modules/meta-app-events';

import { getAppVariant } from './posthog';

/** EEA (EU, Iceland, Liechtenstein, Norway), the UK and Switzerland. */
export const META_CONSENT_REGIONS: ReadonlySet<string> = new Set([
  'AT',
  'BE',
  'BG',
  'HR',
  'CY',
  'CZ',
  'DK',
  'EE',
  'FI',
  'FR',
  'DE',
  'GR',
  'HU',
  'IE',
  'IT',
  'LV',
  'LT',
  'LU',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SK',
  'SI',
  'ES',
  'SE',
  'IS',
  'LI',
  'NO',
  'GB',
  'CH',
]);

export type MetaAppEventsDecision =
  | { start: true; debug: boolean }
  | { start: false; reason: 'platform' | 'development' | 'test_lab' | 'consent_region' };

export function decideMetaAppEvents(input: {
  platform: string;
  isDevelopment: boolean;
  devOverride: boolean;
  appVariant: string;
  regionCode: string | null | undefined;
}): MetaAppEventsDecision {
  if (input.platform !== 'ios' && input.platform !== 'android') {
    return { start: false, reason: 'platform' };
  }
  if (input.isDevelopment && !input.devOverride) return { start: false, reason: 'development' };
  if (input.appVariant === 'test_lab') return { start: false, reason: 'test_lab' };
  if (META_CONSENT_REGIONS.has((input.regionCode ?? '').toUpperCase())) {
    return { start: false, reason: 'consent_region' };
  }
  return { start: true, debug: input.isDevelopment };
}

let started = false;

/** Called once at launch (App.tsx). Never throws; measurement is best effort. */
export function startMetaAppEvents(): void {
  if (started) return;
  started = true;
  const native = getMetaAppEventsModule();
  if (!native) return;
  let decision: MetaAppEventsDecision;
  try {
    decision = decideMetaAppEvents({
      platform: Platform.OS,
      isDevelopment: typeof __DEV__ !== 'undefined' && __DEV__,
      devOverride: process.env.EXPO_PUBLIC_META_APP_EVENTS_DEV === '1',
      appVariant: getAppVariant(),
      regionCode: getLocales()[0]?.regionCode,
    });
  } catch {
    return;
  }
  const run = decision.start ? native.start(decision.debug) : native.disable();
  void Promise.resolve(run).catch(() => {});
}
