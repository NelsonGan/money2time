import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const plugin = require('../../plugins/withStripFrameworkSymbols') as {
  addPodfilePostIntegrate: (contents: string) => string;
  STRIP_SCRIPT: string;
};

const PODFILE = `target 'Money2Time' do
  post_install do |installer|
    react_native_post_install(installer)
  end
end
`;

describe('withStripFrameworkSymbols', () => {
  it('adds one post_integrate hook after the target block', () => {
    const out = plugin.addPodfilePostIntegrate(PODFILE);
    expect(out.startsWith(PODFILE.trimEnd())).toBe(true);
    expect(out.match(/^post_integrate do \|installer\|$/gm)).toHaveLength(1);
    expect(plugin.addPodfilePostIntegrate(out)).toBe(out);
  });

  it('refuses to add a second post_integrate hook', () => {
    expect(() =>
      plugin.addPodfilePostIntegrate(`${PODFILE}post_integrate do |installer|\nend\n`),
    ).toThrow(/already has a post_integrate/);
  });

  // Ruby double-quoted strings interpolate `#{`, `#$` and `#@`.
  it('embeds a script Ruby will not interpolate', () => {
    expect(plugin.STRIP_SCRIPT).not.toMatch(/#[{$@]/);
  });

  const darwin = process.platform === 'darwin' ? it : it.skip;

  function runScript(
    configuration: string,
    { readOnly = false, platform = 'iphoneos' }: { readOnly?: boolean; platform?: string } = {},
  ) {
    const root = mkdtempSync(path.join(tmpdir(), 'money2time-strip-'));
    const framework = path.join(root, 'Frameworks/Example.framework');
    mkdirSync(framework, { recursive: true });
    // Any unstripped Mach-O works; the system's own tools are stripped.
    const source = path.join(root, 'example.c');
    writeFileSync(
      source,
      'static int helper(void) { return 1; }\nint run(void) { return helper(); }\n',
    );
    execFileSync('xcrun', [
      'clang',
      '-dynamiclib',
      '-g',
      source,
      '-o',
      path.join(framework, 'Example'),
    ]);
    execFileSync('/usr/libexec/PlistBuddy', [
      '-c',
      'Add :CFBundleExecutable string Example',
      path.join(framework, 'Info.plist'),
    ]);
    copyFileSync(path.join(framework, 'Example'), path.join(root, 'original'));
    if (readOnly) chmodSync(path.join(framework, 'Example'), 0o444);
    const result = spawnSync('/bin/sh', ['-c', plugin.STRIP_SCRIPT], {
      encoding: 'utf8',
      env: {
        ...process.env,
        CONFIGURATION: configuration,
        PLATFORM_NAME: platform,
        TARGET_BUILD_DIR: root,
        FRAMEWORKS_FOLDER_PATH: 'Frameworks',
        CODE_SIGNING_ALLOWED: 'NO',
      },
    });
    const symbols = execFileSync('nm', [path.join(framework, 'Example')], { encoding: 'utf8' });
    const sizes = [path.join(root, 'original'), path.join(framework, 'Example')].map(
      (file) => statSync(file).size,
    );
    rmSync(root, { recursive: true, force: true });
    return { status: result.status, stdout: result.stdout, symbols, sizes };
  }

  darwin('strips local symbols in Release and keeps the exported ones', () => {
    const { status, symbols, sizes } = runScript('Release');
    expect(status).toBe(0);
    expect(symbols).toContain('_run');
    expect(symbols).not.toContain('_helper');
    expect(sizes[1]).toBeLessThan(sizes[0]);
  });

  // A failed strip must not fail the release build.
  darwin('skips a framework strip cannot write', () => {
    const { status, stdout, symbols, sizes } = runScript('Release', { readOnly: true });
    expect(status).toBe(0);
    expect(stdout).toContain('warning: could not strip');
    expect(symbols).toContain('_helper');
    expect(sizes[1]).toBe(sizes[0]);
  });

  // Stripping invalidates the signature, and an unsigned simulator build
  // never gets a new one: the app would not launch.
  darwin('leaves simulator builds alone', () => {
    const { status, symbols, sizes } = runScript('Release', { platform: 'iphonesimulator' });
    expect(status).toBe(0);
    expect(symbols).toContain('_helper');
    expect(sizes[1]).toBe(sizes[0]);
  });

  darwin('leaves Debug builds alone', () => {
    const { status, symbols, sizes } = runScript('Debug');
    expect(status).toBe(0);
    expect(symbols).toContain('_helper');
    expect(sizes[1]).toBe(sizes[0]);
  });
});
