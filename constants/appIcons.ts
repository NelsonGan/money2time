import type { ImageSourcePropType } from 'react-native';

import type { AppIconId } from '~/types';

export type { AppIconId };

/**
 * The home-screen icon variants the user can pick between.
 *
 * Ids are the app's own, not the mascot pose behind the artwork: an id ends up
 * in a DB row, in the iOS alternate-icon name and in the Android
 * activity-alias, so it has to survive the artwork being redrawn or swapped for
 * a different pose. The artwork itself is composed by
 * `scripts/generate-app-icons.mjs`, which owns the id -> mascot mapping.
 *
 * `alternateName` is what the OS knows the icon by, and must stay in step with
 * the `expo-alternate-app-icons` entries in app.json — `__tests__/constants/
 * appIcons.test.ts` fails the build if the two drift apart. `null` is the
 * primary icon, which is not an "alternate" on either platform.
 */
export interface AppIconVariant {
  id: AppIconId;
  /** Name registered with the OS, or null for the app's primary icon. */
  alternateName: string | null;
  /** i18n key of the picker label. */
  labelKey: string;
  /**
   * Whether the variant can be picked without Pro. Gating on "is this the
   * default?" instead would be one character shorter and wrong: `purse` is an
   * alternate that is deliberately free, and the two are not the same question.
   */
  free: boolean;
  /** Tile as it appears in light mode, for the in-app picker. */
  previewLight: ImageSourcePropType;
  /** Tile as it appears in dark mode, for the in-app picker. */
  previewDark: ImageSourcePropType;
}

export const APP_ICONS: readonly AppIconVariant[] = [
  {
    id: 'classic',
    alternateName: null,
    labelKey: 'app_icon.classic',
    free: true,
    previewLight: require('~/assets/app-icons/classic/preview-light.png'),
    previewDark: require('~/assets/app-icons/classic/preview-dark.png'),
  },
  {
    // The icon the app wore immediately before the current mascot. Free, and
    // second in the picker so the two icons anyone can pick sit together: it is
    // not a reward, it is the way back for users who liked what they had.
    id: 'purse',
    alternateName: 'Purse',
    labelKey: 'app_icon.purse',
    free: true,
    previewLight: require('~/assets/app-icons/purse/preview-light.png'),
    previewDark: require('~/assets/app-icons/purse/preview-dark.png'),
  },
  {
    id: 'party',
    alternateName: 'Party',
    labelKey: 'app_icon.party',
    free: false,
    previewLight: require('~/assets/app-icons/party/preview-light.png'),
    previewDark: require('~/assets/app-icons/party/preview-dark.png'),
  },
  {
    id: 'love',
    alternateName: 'Love',
    labelKey: 'app_icon.love',
    free: false,
    previewLight: require('~/assets/app-icons/love/preview-light.png'),
    previewDark: require('~/assets/app-icons/love/preview-dark.png'),
  },
  {
    id: 'nice',
    alternateName: 'Nice',
    labelKey: 'app_icon.nice',
    free: false,
    previewLight: require('~/assets/app-icons/nice/preview-light.png'),
    previewDark: require('~/assets/app-icons/nice/preview-dark.png'),
  },
  {
    id: 'detective',
    alternateName: 'Detective',
    labelKey: 'app_icon.detective',
    free: false,
    previewLight: require('~/assets/app-icons/detective/preview-light.png'),
    previewDark: require('~/assets/app-icons/detective/preview-dark.png'),
  },
  {
    id: 'chill',
    alternateName: 'Chill',
    labelKey: 'app_icon.chill',
    free: false,
    previewLight: require('~/assets/app-icons/chill/preview-light.png'),
    previewDark: require('~/assets/app-icons/chill/preview-dark.png'),
  },
  {
    id: 'sleepy',
    alternateName: 'Sleepy',
    labelKey: 'app_icon.sleepy',
    free: false,
    previewLight: require('~/assets/app-icons/sleepy/preview-light.png'),
    previewDark: require('~/assets/app-icons/sleepy/preview-dark.png'),
  },
  {
    id: 'piggy',
    alternateName: 'Piggy',
    labelKey: 'app_icon.piggy',
    free: false,
    previewLight: require('~/assets/app-icons/piggy/preview-light.png'),
    previewDark: require('~/assets/app-icons/piggy/preview-dark.png'),
  },
  {
    id: 'cards',
    alternateName: 'Cards',
    labelKey: 'app_icon.cards',
    free: false,
    previewLight: require('~/assets/app-icons/cards/preview-light.png'),
    previewDark: require('~/assets/app-icons/cards/preview-dark.png'),
  },
];

/**
 * Alternate icons that have been dropped from the picker but must stay
 * registered with the OS, newest retirement first.
 *
 * Removing an alternate outright is not safe on Android, and the failure is
 * unrecoverable rather than cosmetic. Switching icons there enables an
 * `activity-alias` and DISABLES whatever component the app was launched
 * through, which on the default icon is `MainActivity` itself. A component's
 * disabled state survives an app update, and an alias that is no longer in the
 * manifest simply ceases to exist — so a user sitting on a retired icon would
 * update into an app with `MainActivity` disabled and no alias to replace it:
 * no launcher entry at all, and no way back in to fix it.
 *
 * So the alias stays in `app.json`, pointed at the DEFAULT variant's artwork
 * rather than its own (the artwork is deleted; only the entry point survives).
 * A device still on it keeps a working launcher icon that already looks right,
 * and `AppContext` moves it back to the primary icon on the next launch, which
 * is what finally re-enables `MainActivity`. `appIconIdForAlternateName` maps a
 * retired name to the default, so nothing downstream has to know about it.
 *
 * An entry may be deleted once no install can still be sitting on it.
 */
export const RETIRED_ALTERNATE_NAMES: readonly string[] = [
  // The coin-and-clock icon that preceded the mascot, offered free in 1.5.2 and
  // replaced in the picker by `purse`, the era the app actually wore last.
  'Clock',
];

export function isRetiredAlternateName(name: string | null | undefined): boolean {
  return typeof name === 'string' && RETIRED_ALTERNATE_NAMES.includes(name);
}

/** The icon a fresh install ships with. */
export const DEFAULT_APP_ICON_ID: AppIconId = 'classic';

export function isAppIconId(value: unknown): value is AppIconId {
  return typeof value === 'string' && APP_ICONS.some((icon) => icon.id === value);
}

export function appIconById(id: AppIconId): AppIconVariant {
  return APP_ICONS.find((icon) => icon.id === id) ?? APP_ICONS[0];
}

/** Maps what the OS reports back to an id. An unknown name means the primary icon. */
export function appIconIdForAlternateName(name: string | null | undefined): AppIconId {
  if (!name) return DEFAULT_APP_ICON_ID;
  return APP_ICONS.find((icon) => icon.alternateName === name)?.id ?? DEFAULT_APP_ICON_ID;
}
