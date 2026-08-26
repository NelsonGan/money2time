import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import {
  APP_ICONS,
  appIconById,
  appIconIdForAlternateName,
  DEFAULT_APP_ICON_ID,
  isAppIconId,
} from '~/constants/appIcons';

const REPO_ROOT = path.resolve(__dirname, '../..');
const ICONS_DIR = path.join(REPO_ROOT, 'assets/app-icons');

interface AlternateIconEntry {
  name: string;
  ios: { light: string; dark: string; tinted: string };
  android: { foregroundImage: string; monochromeImage: string; backgroundColor: string };
}

const appJson = JSON.parse(readFileSync(path.join(REPO_ROOT, 'app.json'), 'utf8')) as {
  expo: {
    ios: { icon: { light: string; dark: string; tinted: string } };
    android: { icon: string; adaptiveIcon: { foregroundImage: string; monochromeImage: string } };
    web: { favicon: string };
    plugins: (string | [string, unknown])[];
  };
};

function pluginConfig<T>(name: string): T {
  const entry = appJson.expo.plugins.find(
    (plugin): plugin is [string, T] => Array.isArray(plugin) && plugin[0] === name,
  );
  if (!entry) throw new Error(`Plugin "${name}" is not configured in app.json`);
  return entry[1];
}

const alternates = pluginConfig<AlternateIconEntry[]>('expo-alternate-app-icons');
const nightBackgroundNames = pluginConfig<string[]>('./plugins/withAndroidAlternateIcons');

/**
 * The artwork is wired up by path in app.json and consumed by a config plugin
 * during `expo prebuild`, which only runs on an EAS build. A rename or a
 * variant added to the catalogue but not to app.json is therefore invisible to
 * typecheck, lint and the rest of the suite, and would first surface as an
 * ENOENT that fails the release build after CI has already gone green.
 */
describe('app icon catalogue', () => {
  it('starts with the shipped icon and marks it as the primary one', () => {
    expect(APP_ICONS[0].id).toBe(DEFAULT_APP_ICON_ID);
    expect(APP_ICONS[0].alternateName).toBeNull();
    expect(APP_ICONS.filter((icon) => icon.alternateName === null)).toHaveLength(1);
  });

  it('has a unique id and alternate name per variant', () => {
    expect(new Set(APP_ICONS.map((icon) => icon.id)).size).toBe(APP_ICONS.length);
    const names = APP_ICONS.map((icon) => icon.alternateName).filter(Boolean);
    expect(new Set(names).size).toBe(names.length);
  });

  it.each(APP_ICONS.map((icon) => icon.id))('%s ships every face', (id) => {
    const faces = [
      'icon-light.png',
      'icon-dark.png',
      'icon-tinted.png',
      'foreground.png',
      'monochrome.png',
      'preview-light.png',
      'preview-dark.png',
    ];
    const missing = faces.filter((face) => !existsSync(path.join(ICONS_DIR, id, face)));

    expect(missing).toEqual([]);
  });

  // The App Store rejects an icon that carries an alpha channel. Byte 25 of a
  // PNG is the IHDR colour type: 2 is RGB, 6 is RGBA.
  it.each(APP_ICONS.map((icon) => icon.id))('%s has no alpha in its 1024 tiles', (id) => {
    const withAlpha = ['icon-light.png', 'icon-dark.png', 'icon-tinted.png'].filter(
      (face) => readFileSync(path.join(ICONS_DIR, id, face))[25] !== 2,
    );

    expect(withAlpha).toEqual([]);
  });

  it('resolves an OS-reported name back to its variant', () => {
    APP_ICONS.forEach((icon) => {
      expect(appIconIdForAlternateName(icon.alternateName)).toBe(icon.id);
    });
  });

  it('falls back to the shipped icon for anything it does not recognise', () => {
    expect(appIconIdForAlternateName('SomeIconWeRetired')).toBe(DEFAULT_APP_ICON_ID);
    expect(appIconIdForAlternateName(null)).toBe(DEFAULT_APP_ICON_ID);
    expect(isAppIconId('SomeIconWeRetired')).toBe(false);
    expect(appIconById(DEFAULT_APP_ICON_ID).id).toBe(DEFAULT_APP_ICON_ID);
  });
});

describe('app.json icon wiring', () => {
  it('registers exactly the catalogue’s alternates, in order', () => {
    const expected = APP_ICONS.map((icon) => icon.alternateName).filter(Boolean);

    expect(alternates.map((entry) => entry.name)).toEqual(expected);
  });

  it('gives every alternate a light, dark and tinted face plus Android layers', () => {
    alternates.forEach((entry) => {
      const id = appIconIdForAlternateName(entry.name);
      expect(entry.ios.light).toBe(`./assets/app-icons/${id}/icon-light.png`);
      expect(entry.ios.dark).toBe(`./assets/app-icons/${id}/icon-dark.png`);
      expect(entry.ios.tinted).toBe(`./assets/app-icons/${id}/icon-tinted.png`);
      expect(entry.android.foregroundImage).toBe(`./assets/app-icons/${id}/foreground.png`);
      expect(entry.android.monochromeImage).toBe(`./assets/app-icons/${id}/monochrome.png`);
    });
  });

  it('points the primary icon at the shipped variant on both platforms', () => {
    expect(appJson.expo.ios.icon).toEqual({
      light: `./assets/app-icons/${DEFAULT_APP_ICON_ID}/icon-light.png`,
      dark: `./assets/app-icons/${DEFAULT_APP_ICON_ID}/icon-dark.png`,
      tinted: `./assets/app-icons/${DEFAULT_APP_ICON_ID}/icon-tinted.png`,
    });
    expect(appJson.expo.android.adaptiveIcon.foregroundImage).toBe(
      `./assets/app-icons/${DEFAULT_APP_ICON_ID}/foreground.png`,
    );
  });

  // The legacy Android launcher icon and the web favicon used to point at a
  // hand-cut copy of the shipped tile under assets/android/. Nothing regenerated
  // it, so redrawing the mascot updated every icon except those two and left
  // them on the old chick with nothing to catch it.
  it('draws the legacy launcher icon and the favicon from the generated tile', () => {
    const shipped = `./assets/app-icons/${DEFAULT_APP_ICON_ID}/icon-light.png`;

    expect(appJson.expo.android.icon).toBe(shipped);
    expect(appJson.expo.web.favicon).toBe(shipped);
  });

  it('references only files that exist', () => {
    const referenced = [
      ...Object.values(appJson.expo.ios.icon),
      ...Object.values(appJson.expo.android.adaptiveIcon).filter((value) =>
        value.startsWith('./assets/'),
      ),
      appJson.expo.android.icon,
      appJson.expo.web.favicon,
      ...alternates.flatMap((entry) => [
        ...Object.values(entry.ios),
        entry.android.foregroundImage,
        entry.android.monochromeImage,
      ]),
    ];
    const missing = referenced.filter((asset) => !existsSync(path.join(REPO_ROOT, asset)));

    expect(missing).toEqual([]);
  });

  // A night colour is looked up by name, so a variant missing from this list
  // simply keeps its cream backdrop in dark mode with nothing to flag it.
  it('gives every alternate a night backdrop override', () => {
    expect(nightBackgroundNames).toEqual(alternates.map((entry) => entry.name));
  });

  // The Android fix-up plugin edits the aliases expo-alternate-app-icons writes,
  // and Expo runs manifest mods in reverse registration order, so it has to be
  // the EARLIER entry to run second. Getting this backwards fails silently: the
  // plugin finds no aliases yet and copies no deep-link filters onto them, and
  // nothing downstream complains until a user with an alternate icon taps a
  // widget and the app does not open.
  it('lists the Android fix-ups before the plugin that creates the aliases', () => {
    const order = appJson.expo.plugins.map((plugin) =>
      Array.isArray(plugin) ? plugin[0] : plugin,
    );

    expect(order.indexOf('./plugins/withAndroidAlternateIcons')).toBeLessThan(
      order.indexOf('expo-alternate-app-icons'),
    );
  });
});
