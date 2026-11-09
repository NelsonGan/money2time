/**
 * One of our locale codes to many of the stores'.
 *
 * Plain ESM rather than TypeScript so the Next routes and the CLI scripts can
 * both import it — a locale map that disagrees between the web UI and the
 * command line is a listing that half-updates and nobody notices.
 *
 * `en` goes out to every English variant the store keeps separately, `zh` to
 * both scripts, and so on: the copy is identical, so a variant with no listing
 * of its own is worse than a duplicate.
 */

/** @type {Record<string, string[]>} */
export const IOS_LOCALE_MAP = {
  en: ['en-US', 'en-GB', 'en-AU', 'en-CA'],
  ms: ['ms'],
  zh: ['zh-Hans', 'zh-Hant'],  // zh-HK is not an App Store Connect locale
  id: ['id'],
  th: ['th'],
  vi: ['vi'],
  ja: ['ja'],
  ko: ['ko'],
  hi: ['hi'],
  es: ['es-ES', 'es-MX'],
  fr: ['fr-FR', 'fr-CA'],
  de: ['de-DE'],
  pt: ['pt-BR', 'pt-PT'],
  it: ['it'],
  nl: ['nl-NL'],
  ru: ['ru'],
  tr: ['tr'],
  pl: ['pl'],
  uk: ['uk'],
  sv: ['sv'],
  nb: ['no'],
  da: ['da'],
  // fil: Filipino has no App Store Connect localization.
};

/** @type {Record<string, string[]>} */
export const ANDROID_LOCALE_MAP = {
  en: ['en-US', 'en-GB'],
  ms: ['ms'],
  zh: ['zh-CN', 'zh-TW', 'zh-HK'],
  id: ['id'],
  th: ['th'],
  vi: ['vi'],
  ja: ['ja-JP'],
  ko: ['ko-KR'],
  hi: ['hi-IN'],
  fil: ['fil'],
  es: ['es-ES', 'es-419'],
  fr: ['fr-FR', 'fr-CA'],
  de: ['de-DE'],
  pt: ['pt-BR', 'pt-PT'],
  it: ['it-IT'],
  nl: ['nl-NL'],
  ru: ['ru-RU'],
  tr: ['tr-TR'],
  pl: ['pl-PL'],
  uk: ['uk'],
  sv: ['sv-SE'],
  nb: ['no-NO'],
  da: ['da-DK'],
};

/**
 * `asc` device types. This tool exports the phone set at 1284 × 2778, which is
 * the 6.5" slot (`asc screenshots sizes --display-type APP_IPHONE_65`), and the
 * iPhone Duo set at 2853 × 2007, the open inner display in landscape
 * (`APP_IPHONE_DUO`). The Duo is App Store only: Play has no such device.
 */
export const IOS_DEVICE_TYPE = {
  phone: 'IPHONE_65',
  ipad: 'IPAD_PRO_3GEN_129',
  duo: 'IPHONE_DUO',
};

/**
 * `gplay` image types, as a list per device.
 *
 * Tablet is two galleries, not one. Play keeps 7-inch and 10-inch screenshots
 * separately and asks for both before it will treat an app as tablet-ready, so
 * one set of tablet art goes to each. The same 2732 × 2048 export satisfies
 * both: Play's rule is 320px to 3840px a side with the long side no more than
 * twice the short one, and 4:3 is well inside it.
 */
export const ANDROID_IMAGE_TYPES = {
  phone: ['phoneScreenshots'],
  tablet: ['sevenInchScreenshots', 'tenInchScreenshots'],
  feature: ['featureGraphic'],
  icon: ['icon'],
};

/**
 * Play accepts at most 8 screenshots per device type
 * (https://support.google.com/googleplay/android-developer/answer/9866151).
 * The phone set is 7 scenes so nothing is dropped today, but the cap is
 * enforced here rather than discovered mid-upload if a scene is ever added.
 * App Store Connect allows 10.
 */
export const ANDROID_MAX_SCREENSHOTS = 8;
export const IOS_MAX_SCREENSHOTS = 10;

/**
 * How many images each Play gallery holds, by our device name. The screenshot
 * galleries take a set; the feature graphic and the icon are single slots, and
 * sending a second image to one silently becomes the one Play keeps.
 */
export const ANDROID_MAX_IMAGES = {
  phone: ANDROID_MAX_SCREENSHOTS,
  tablet: ANDROID_MAX_SCREENSHOTS,
  feature: 1,
  icon: 1,
};

/**
 * Play's app icon, which is a listing asset rather than anything read out of
 * the bundle: 512 x 512 PNG, and the launcher icon inside the AAB never
 * replaces it. Shipped in the repo so the button has something to send.
 */
export const ANDROID_ICON_FILE = 'public/assets/icons/play_store_512.png';
