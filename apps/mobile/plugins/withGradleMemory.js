/**
 * Bumps the Gradle daemon JVM args so Android release builds don't OOM
 * during the lintVitalAnalyzeRelease task.
 *
 * Default Expo gradle.properties ships -Xmx2048m -XX:MaxMetaspaceSize=512m,
 * which runs out of Metaspace once every Expo + RN module loads its lint
 * classes into the same daemon. Bumping to 4G heap + 1G metaspace fits
 * comfortably on the GitHub-hosted ubuntu-latest runner (16 GB RAM).
 */
const { withGradleProperties } = require('@expo/config-plugins');

const JVM_ARGS = '-Xmx4g -XX:MaxMetaspaceSize=1g -XX:+HeapDumpOnOutOfMemoryError';

module.exports = function withGradleMemory(config) {
  return withGradleProperties(config, (cfg) => {
    const props = cfg.modResults;
    const existing = props.find(
      (item) => item.type === 'property' && item.key === 'org.gradle.jvmargs',
    );
    if (existing) {
      existing.value = JVM_ARGS;
    } else {
      props.push({ type: 'property', key: 'org.gradle.jvmargs', value: JVM_ARGS });
    }
    return cfg;
  });
};
