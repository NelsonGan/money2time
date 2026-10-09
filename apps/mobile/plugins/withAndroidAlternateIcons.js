const {
  AndroidConfig,
  withAndroidColorsNight,
  withAndroidManifest,
} = require('@expo/config-plugins');

const { assignColorValue } = AndroidConfig.Colors;
const { getMainApplicationOrThrow } = AndroidConfig.Manifest;

const NIGHT_BACKDROP = '#17212E';
const PRIMARY_COLOR_NAME = 'iconBackground';
const MAIN_ACTIVITY = '.MainActivity';

/**
 * The two things expo-alternate-app-icons leaves undone on Android.
 *
 * Must be registered BEFORE `expo-alternate-app-icons` in app.json, which reads
 * backwards but is right: Expo composes manifest mods so that each new one wraps
 * the ones already registered and hands its result down, i.e. the LAST plugin
 * listed runs FIRST. This one edits the aliases the other plugin writes, so it
 * has to be the earlier entry. Listing it after fails silently rather than
 * loudly: it simply finds no aliases yet and copies nothing.
 *
 * ## 1. Deep links have to survive an icon change
 *
 * Android switches launcher icons by enabling one `activity-alias` and disabling
 * whatever component the app was launched through. On the default icon that
 * component is `MainActivity` itself, so picking any alternate icon *disables
 * MainActivity* — and MainActivity is where Expo puts the `money2time://` and
 * `exp+money2time://` VIEW filters. Every home-screen widget opens the app by
 * one of those URLs (see withMoney2TimeWidgets) and so does the Shortcuts
 * auto-log, so a user who changed their icon would find that none of them opened
 * anything: the intent resolved to a disabled component.
 *
 * Copying MainActivity's non-launcher filters onto each alias fixes it from both
 * ends. While an alias is the enabled entry point it answers those URLs itself,
 * and because it does, a deep link can no longer land the app on MainActivity
 * while an alias is live, which is what made the disable target wrong in the
 * first place. The LAUNCHER filter is deliberately not copied — the alias
 * already has its own, and a second one would put a duplicate icon on the home
 * screen.
 *
 * Still broken by design, and only for developers: an explicit
 * `am start -n <pkg>/.MainActivity` (which `expo run:android` uses) fails on a
 * device that is currently on an alternate icon. Launch it through the launcher,
 * or switch back to the default icon first.
 *
 * ## 2. Dark backdrops
 *
 * Android has no light/dark launcher icons the way iOS 18 does, so there is no
 * appearance to declare. What it does have is ordinary resource qualification:
 * an adaptive icon's background layer is `@color/iconBackground<Variant>`, and a
 * `values-night` override of that colour is what a launcher running in dark mode
 * resolves. Every variant's foreground is the chick on transparency, so the
 * backdrop is the only thing that has to change and no extra artwork is needed.
 *
 * This half is best-effort by nature: launchers cache icon bitmaps aggressively
 * and most only re-resolve them on a package change, so an icon may not flip
 * until the next app update or reboot. The reliable dark-mode story on Android
 * is the themed (monochrome) layer, which every variant also ships. Nothing here
 * can make an icon *wrong*, so the upside is free.
 *
 * `iconBackground` (no suffix) is the name Expo's own adaptive-icon plugin uses
 * for the primary icon; the suffixed names come from expo-alternate-app-icons,
 * which derives them from the PascalCase icon name.
 */
module.exports = function withAndroidAlternateIcons(config, alternateIconNames = []) {
  config = withAndroidManifest(config, (config) => {
    const mainApplication = getMainApplicationOrThrow(config.modResults);
    const aliases = mainApplication['activity-alias'] ?? [];
    if (aliases.length === 0) return config;

    const mainActivity = (mainApplication.activity ?? []).find(
      (activity) => activity.$?.['android:name'] === MAIN_ACTIVITY,
    );
    const forwarded = (mainActivity?.['intent-filter'] ?? []).filter(
      (filter) =>
        !(filter.category ?? []).some(
          (category) => category.$?.['android:name'] === 'android.intent.category.LAUNCHER',
        ),
    );
    if (forwarded.length === 0) return config;

    for (const alias of aliases) {
      if (!alias.$?.['android:name']?.startsWith(MAIN_ACTIVITY)) continue;
      alias['intent-filter'] = [...(alias['intent-filter'] ?? []), ...forwarded];
    }

    return config;
  });

  const colorNames = [
    PRIMARY_COLOR_NAME,
    ...alternateIconNames.map((name) => `${PRIMARY_COLOR_NAME}${name}`),
  ];

  return withAndroidColorsNight(config, (config) => {
    for (const name of colorNames) {
      config.modResults = assignColorValue(config.modResults, {
        value: NIGHT_BACKDROP,
        name,
      });
    }
    return config;
  });
};
