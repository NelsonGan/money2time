/**
 * Strips local and debug symbols from the frameworks embedded in the iOS app.
 *
 * An archive strips the app's own executable, but not the dynamic frameworks
 * CocoaPods copies into `Frameworks/`: pod targets are never "installed", and
 * prebuilt ones (React, Hermes, Turso, MapLibre) are copied as shipped. In the
 * 1.7.4 archive those 21 frameworks took 58 MB, 18.7 MB of it symbol tables.
 *
 * `strip -x -S` removes only local and debug symbols. Exported symbols stay, so
 * dyld still links everything, and a binary's UUID does not change, so the
 * dSYMs uploaded for crash symbolication still match. It is what Xcode's own
 * install step does to a dylib (`STRIP_STYLE = non-global`).
 *
 * The phase must run after "[CP] Embed Pods Frameworks", which only exists
 * once `pod install` has integrated the project, so it is added from a Podfile
 * `post_integrate` hook rather than from a project mod. Stripping invalidates
 * the framework's signature, so it is re-signed with the command CocoaPods'
 * embed script uses; the app itself is signed after every build phase.
 * Release only: Debug keeps its symbols for the debugger.
 */
const { withPodfile } = require('@expo/config-plugins');

const PODFILE_MARKER = '# withStripFrameworkSymbols';
const PHASE_NAME = '[Money2Time] Strip framework symbols';

const STRIP_SCRIPT = `set -e
[ "$CONFIGURATION" = "Release" ] || exit 0
frameworks="$TARGET_BUILD_DIR/$FRAMEWORKS_FOLDER_PATH"
[ -d "$frameworks" ] || exit 0
for framework in "$frameworks"/*.framework; do
  executable=$(basename "$framework" .framework)
  if name=$(/usr/libexec/PlistBuddy -c "Print :CFBundleExecutable" "$framework/Info.plist" 2>/dev/null); then
    executable=$name
  fi
  binary="$framework/$executable"
  [ -f "$binary" ] || continue
  before=$(stat -f%z "$binary")
  xcrun strip -x -S "$binary" 2>/dev/null
  [ "$(stat -f%z "$binary")" = "$before" ] && continue
  if [ -n "\${EXPANDED_CODE_SIGN_IDENTITY:-}" ] && [ "\${CODE_SIGNING_REQUIRED:-}" != "NO" ] && [ "\${CODE_SIGNING_ALLOWED:-}" != "NO" ]; then
    /usr/bin/codesign --force --sign "$EXPANDED_CODE_SIGN_IDENTITY" \${OTHER_CODE_SIGN_FLAGS:-} --preserve-metadata=identifier,entitlements "$framework"
  fi
done
`;

const PODFILE_POST_INTEGRATE = `
${PODFILE_MARKER}: strip the embedded frameworks after CocoaPods embeds them.
post_integrate do |installer|
  installer.aggregate_targets.each do |aggregate|
    project = aggregate.user_project
    aggregate.user_targets.each do |target|
      next unless target.product_type == 'com.apple.product-type.application'
      phase = target.shell_script_build_phases.find { |p| p.name == ${JSON.stringify(PHASE_NAME)} } ||
        target.new_shell_script_build_phase(${JSON.stringify(PHASE_NAME)})
      phase.shell_script = ${JSON.stringify(STRIP_SCRIPT)}
      phase.always_out_of_date = '1'
      # Last, so it runs after "[CP] Embed Pods Frameworks".
      target.build_phases.delete(phase)
      target.build_phases << phase
    end
    project.save
  end
end
`;

function addPodfilePostIntegrate(contents) {
  if (contents.includes(PODFILE_MARKER)) return contents;
  if (/^\s*post_integrate\b/m.test(contents)) {
    throw new Error('withStripFrameworkSymbols: the Podfile already has a post_integrate hook.');
  }
  return `${contents.trimEnd()}\n${PODFILE_POST_INTEGRATE}`;
}

function withStripFrameworkSymbols(config) {
  return withPodfile(config, (cfg) => {
    cfg.modResults.contents = addPodfilePostIntegrate(cfg.modResults.contents);
    return cfg;
  });
}

module.exports = withStripFrameworkSymbols;
module.exports.addPodfilePostIntegrate = addPodfilePostIntegrate;
module.exports.STRIP_SCRIPT = STRIP_SCRIPT;
