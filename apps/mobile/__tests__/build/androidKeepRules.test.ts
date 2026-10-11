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

  it('keeps expo-notifications, whose scheduled reminders fail to save without it', () => {
    expect(unappliedRules().map(({ pkg }) => pkg)).toContain('expo-notifications');
    expect(buildPropertiesAndroid().extraProguardRules).toContain(
      '-keep class expo.modules.notifications.** { *; }',
    );
  });
});
