/**
 * Disables lint on Android *release* builds for every Android subproject.
 *
 * Why: reanimated's prefab ships `libreanimated.so` and only sets
 * `doNotStrip` for the debug build type. On release, `stripReleaseDebugSymbols`
 * rewrites that .so in the prefab dir while `bundleReleaseLocalLintAar` is
 * concurrently zipping it into the lint AAR, producing the intermittent
 * EAS failure:
 *
 *   Execution failed for task ':react-native-reanimated:bundleReleaseLocalLintAar'.
 *   > Could not add file '.../libreanimated.so' to ZIP '.../out.aar'.
 *
 * Lint on node_modules library modules adds nothing to a production build, so
 * turning off `checkReleaseBuilds` removes the whole lintVitalRelease ->
 * bundleReleaseLocalLintAar chain (the same chain withGradleMemory was bumping
 * heap for) and the race with it.
 *
 * `checkReleaseBuilds` is read by AGP very early during a project's evaluation,
 * so it must be set *before* the module evaluates. The root build.gradle runs
 * too late (some subprojects are already evaluated by the time its trailing
 * code runs). The hook therefore lives in settings.gradle, where
 * `gradle.beforeProject` is guaranteed to fire before each project is
 * configured.
 */
const { withSettingsGradle } = require('@expo/config-plugins');

const MARKER = '// money2time: disable release lint';

const SNIPPET = `
${MARKER} (avoids reanimated bundleReleaseLocalLintAar ZIP race)
gradle.beforeProject { project ->
    def disableReleaseLint = {
        project.android.lint {
            checkReleaseBuilds false
            abortOnError false
        }
    }
    project.plugins.withId("com.android.library", disableReleaseLint)
    project.plugins.withId("com.android.application", disableReleaseLint)
}
`;

module.exports = function withAndroidReleaseLint(config) {
  return withSettingsGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') {
      throw new Error('withAndroidReleaseLint: expected settings.gradle to be Groovy.');
    }
    if (!cfg.modResults.contents.includes(MARKER)) {
      cfg.modResults.contents += `\n${SNIPPET}`;
    }
    return cfg;
  });
};
