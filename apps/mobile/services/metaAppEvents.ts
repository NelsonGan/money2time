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
 * - in a preview build (`preview`), which only testers install;
 * - on Google Play's pre-launch test devices (`test_lab`), which are not
 *   installs from ads;
 * - when the device's region is in the EEA (with the EU's outermost regions
 *   and Åland), the UK and its Crown Dependencies and Gibraltar, or
 *   Switzerland, where ad measurement needs consent the app does not ask for.
 *
 * Neither SDK loads without `start()`; a launch that does not start calls
 * `disable()`, which on iOS turns off the automatic logging an earlier start
 * remembered.
 */

import { getLocales } from 'expo-localization';
import { Platform } from 'react-native';

import { getMetaAppEventsModule } from '~/modules/meta-app-events';

import { getAppVariant } from './posthog';

/**
 * EEA (EU, Iceland, Liechtenstein, Norway), the UK and Switzerland, plus the
 * places a device reports under their own region code while the GDPR or a
 * GDPR-equivalent law applies: the EU's outermost regions and Åland, and the
 * Crown Dependencies and Gibraltar.
 */
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
  // EU outermost regions and Åland (CLDR's IC and EA: Canary Islands, Ceuta and Melilla).
  'AX',
  'GF',
  'GP',
  'MQ',
  'RE',
  'YT',
  'MF',
  'IC',
  'EA',
  // Crown Dependencies and Gibraltar.
  'GG',
  'JE',
  'IM',
  'GI',
]);

export type MetaAppEventsDecision =
  | { start: true; debug: boolean }
  | {
      start: false;
      reason: 'platform' | 'development' | 'preview' | 'test_lab' | 'consent_region';
    };

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
  if (input.appVariant === 'preview') return { start: false, reason: 'preview' };
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
