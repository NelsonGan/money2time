// Dev-only hook the update-app-studio-screenshots skill's capture script calls
// through Metro's debugger (Runtime.evaluate): seed a locale's preview profile
// and read what the scripted screens need to type and tap.
import { LogBox } from 'react-native';

import { I18n } from '~/lib/i18n';
import { MAX_SHOWS, recordCloudBackupPromptShown } from '~/services/cloudBackupPrompt';
import { markCurrentFeatureAnnouncementsSeen } from '~/services/featureAnnouncementState';

import { PREVIEW_PROFILE_FOR_LOCALE, PREVIEW_PROFILES } from './index';
import type { PreviewSeedProfile, PreviewSeedSummary } from './shared';

type Generate = (profile: PreviewSeedProfile) => Promise<PreviewSeedSummary>;

// Keep the pop-ups a new install gets (what's-new announcements, the cloud
// backup nudge on Settings) from covering the screens being captured.
async function silencePrompts(appUserId: string | null | undefined) {
  if (appUserId) await markCurrentFeatureAnnouncementsSeen(appUserId);
  for (let shown = 0; shown < MAX_SHOWS; shown += 1) await recordCloudBackupPromptShown();
}

interface AppStudioHook {
  seedStatus: string | null;
  seed: (locale: string) => string;
  info: (locale: string) => {
    profile: PreviewSeedProfile;
    food: string;
    dining: string;
    people: string[];
  };
  t: (key: string, locale: string) => string;
}

export function installAppStudioHook(generate: Generate, appUserId: string | null | undefined) {
  if (!__DEV__) return;
  // Dev error and warning toasts would land in the screenshots.
  LogBox.ignoreAllLogs(true);
  const profileFor = (locale: string) => {
    const profile = PREVIEW_PROFILE_FOR_LOCALE[locale];
    if (!profile) throw new Error(`No preview profile for ${locale}`);
    return profile;
  };
  const hook: AppStudioHook = {
    seedStatus: null,
    seed: (locale) => {
      hook.seedStatus = null;
      silencePrompts(appUserId)
        .then(() => generate(profileFor(locale)))
        .then(
          (summary) => {
            hook.seedStatus = `ok:${summary.transactions}`;
          },
          (error: unknown) => {
            hook.seedStatus = `error:${String(error)}`;
          },
        );
      return 'started';
    },
    info: (locale) => {
      const profile = profileFor(locale);
      const data = PREVIEW_PROFILES[profile];
      return {
        profile,
        food: data.categories.food,
        dining: data.categories.dining,
        people: (data.splits[0]?.participants ?? []).map((person) => person.name),
      };
    },
    t: (key, locale) => I18n.t(key, { locale }),
  };
  (globalThis as { __appStudio?: AppStudioHook }).__appStudio = hook;
}
