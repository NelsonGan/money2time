import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Android release builds are minified (`enableMinifyInReleaseBuilds`, since
 * #543). A native module's keep rules only reach the app's R8 run if its Gradle
 * build declares them with `consumerProguardFiles`. Some ship a
 * `proguard-rules.pro` without doing that, so R8 never sees it.
 *
 * expo-notifications is one: R8 dropped the private `writeObject` that
 * `NotificationContent` relies on to store its JSON body as a string, Java
 * serialization fell back to the raw `org.json.JSONObject`, and every reminder
 * carrying `data` (the weekly and monthly reviews) failed to schedule on 1.5.12
 * with "Failed to schedule the notification. org.json.JSONObject" (Sentry
 * MONEY2TIME-R, ~3,700 events in five days). expo-task-manager is the other:
 * it restores saved tasks by class name with `Class.forName`, which R8 renames.
 *
 * So every such module's rules are copied into `extraProguardRules` in
 * app.json, and this fails if one is missing, including for a module added
 * later.
 */

const ROOT = path.resolve(__dirname, '../..');
const NODE_MODULES = path.join(ROOT, 'node_modules');

const appJson = JSON.parse(readFileSync(path.join(ROOT, 'app.json'), 'utf8')) as {
  expo: { plugins: (string | [string, Record<string, unknown>])[] };
};

function buildPropertiesAndroid(): {
  enableMinifyInReleaseBuilds?: boolean;
  extraProguardRules?: string;
} {
  const entry = appJson.expo.plugins.find(
    (plugin): plugin is [string, Record<string, unknown>] =>
      Array.isArray(plugin) && plugin[0] === 'expo-build-properties',
  );
  if (!entry) throw new Error('expo-build-properties is not configured in app.json');
  return (entry[1].android ?? {}) as ReturnType<typeof buildPropertiesAndroid>;
}

function packageDirs(): string[] {
  return readdirSync(NODE_MODULES).flatMap((name) => {
    if (name.startsWith('.')) return [];
    if (name.startsWith('@')) {
      return readdirSync(path.join(NODE_MODULES, name)).map((sub) =>
        path.join(NODE_MODULES, name, sub),
      );
    }
    return [path.join(NODE_MODULES, name)];
  });
}

/** Keep rules a module ships but never hands to the app's R8 run. */
function unappliedRules(): { pkg: string; rule: string }[] {
  return packageDirs().flatMap((dir) => {
    const rulesFile = path.join(dir, 'android', 'proguard-rules.pro');
    if (!existsSync(rulesFile)) return [];
    const gradle = ['build.gradle', 'build.gradle.kts']
      .map((file) => path.join(dir, 'android', file))
      .find(existsSync);
    if (!gradle || readFileSync(gradle, 'utf8').includes('consumerProguardFiles')) return [];
    return readFileSync(rulesFile, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'))
      .map((rule) => ({ pkg: path.relative(NODE_MODULES, dir), rule }));
  });
}

const normalize = (rule: string) => rule.replace(/\s+/g, '').replace(/;}$/, '}');

describe('Android release keep rules', () => {
  it('minifies release builds, which is what makes these rules necessary', () => {
    expect(buildPropertiesAndroid().enableMinifyInReleaseBuilds).toBe(true);
  });

  it('copies every keep rule a native module ships but does not apply itself', () => {
    const applied = (buildPropertiesAndroid().extraProguardRules ?? '').split('\n').map(normalize);
    const missing = unappliedRules().filter(({ rule }) => !applied.includes(normalize(rule)));
    expect(missing).toEqual([]);
  });

  it('keeps every class name that expo-blur looks up to scope its Android blur', () => {
    // expo-blur 15's ExpoBlurView found its blur root by walking up to the
    // nearest view whose class name equalled a literal, and fell back to the
    // whole content view.
    // R8 renamed the class (to `com.swmansion.rnscreens.s`), so in release the
    // bottom bar's blur redrew the entire window, root stack and pushed screens
    // included, on every frame, and crashed in `ViewGroup.dispatchDraw` under
    // `ScreenStack.performDraw` (PostHog 01a14e87, 01a15667, 01a15708).
    const source = readFileSync(
      path.join(NODE_MODULES, 'expo-blur/android/src/main/java/expo/modules/blur/ExpoBlurView.kt'),
      'utf8',
    );
    // expo-blur 58 dropped the lookup (Android blurs only inside an explicit
    // BlurTargetView, and BottomNav no longer blurs there), so the list is empty
    // today; the keep rule stays as a backstop and this fails if a later version
    // looks a class up by name again without one.
    const lookedUp = [...source.matchAll(/className == "([\w.$]+)"/g)].map((match) => match[1]);
    const applied = (buildPropertiesAndroid().extraProguardRules ?? '').split('\n');
    for (const className of lookedUp) {
      expect(applied).toContain(`-keepnames class ${className}`);
    }
  });

  // Since Expo SDK 58 both modules declare `consumerProguardFiles` themselves.
  // The app.json copies stay as a backstop in case a later version drops it.
  it.each([
    ['expo-notifications', '-keep class expo.modules.notifications.** { *; }'],
    ['expo-task-manager', '-keep class expo.modules.taskmanager.** { *; }'],
  ])('keeps %s, whose saved state fails to load without it', (pkg, rule) => {
    expect(buildPropertiesAndroid().extraProguardRules).toContain(rule);
    const gradle = readFileSync(path.join(NODE_MODULES, pkg, 'android', 'build.gradle'), 'utf8');
    const ownRules = readFileSync(
      path.join(NODE_MODULES, pkg, 'android', 'proguard-rules.pro'),
      'utf8',
    );
    if (gradle.includes('consumerProguardFiles')) {
      expect(ownRules.split('\n').map(normalize)).toContain(normalize(rule));
    } else {
      expect(unappliedRules().map((entry) => entry.pkg)).toContain(pkg);
    }
  });
});
