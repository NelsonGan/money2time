/**
 * Helpers shared by the measurement scripts in this folder (see README.md).
 */
import { execFileSync } from 'node:child_process';

export const APP_BUNDLE = 'com.nelsongan.money2time';

export const adb = `${process.env.ANDROID_HOME ?? '/opt/homebrew/share/android-commandlinetools'}/platform-tools/adb`;

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** The value after `--name` on the command line, or `fallback` when it is absent. */
export function option(name, fallback) {
  const args = process.argv.slice(2);
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
}

export const run = (cmd, cmdArgs) => execFileSync(cmd, cmdArgs, { encoding: 'utf8' });

/** Like `run`, but a failed command gives an empty string. */
export function tryRun(cmd, cmdArgs) {
  try {
    return run(cmd, cmdArgs);
  } catch {
    return '';
  }
}

export const adbShell = (device, command) => run(adb, ['-s', device, 'shell', command]);

/** Every `[m2t-perf]` payload in a log dump (see utils/perfTrace.ts). */
export function parsePerfLines(text) {
  const events = [];
  for (const line of text.split('\n')) {
    const at = line.indexOf('[m2t-perf] ');
    if (at < 0) continue;
    const json = line.slice(at + '[m2t-perf] '.length).trim();
    // os_log can append a trailing quote or escape; take the outermost object.
    const end = json.lastIndexOf('}');
    try {
      events.push(JSON.parse(json.slice(0, end + 1).replace(/\\"/g, '"')));
    } catch {
      // Not one of ours, or truncated.
    }
  }
  return events;
}

/** What the app has logged on an Android device since the last `logcat -c`. */
export function androidPerfEvents(device) {
  return parsePerfLines(
    tryRun(adb, ['-s', device, 'logcat', '-d', '-v', 'raw', '-s', 'ReactNativeJS:*']),
  );
}

/** Polls `read` until `predicate` holds or `timeoutMs` passes, and returns the last read. */
export async function waitFor(read, predicate, timeoutMs = 30000, stepMs = 250) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = read();
    if (predicate(value)) return value;
    await sleep(stepMs);
  }
  return read();
}

/** The activity the launcher opens, which changes with the app icon picked in the app. */
export function androidLauncherActivity(device, bundle = APP_BUNDLE) {
  const resolved = adbShell(
    device,
    `cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.LAUNCHER ${bundle}`,
  );
  const line = resolved.split('\n').find((l) => l.startsWith(`${bundle}/`));
  return line ? line.trim() : `${bundle}/.MainActivity`;
}

/**
 * Puts the snapshot at /data/local/tmp/golden.tar back as the app's data (adb
 * runs as root on an emulator). `thenShell` runs on the device right after the
 * unpack, before the files are handed back to the app's user.
 */
export function restoreAndroidGolden(device, bundle = APP_BUNDLE, thenShell = '') {
  const files = `/data/data/${bundle}/files`;
  const owner = adbShell(device, `stat -c %U ${files}`).trim();
  const then = thenShell ? ` && ${thenShell}` : '';
  adbShell(
    device,
    `cd ${files} && rm -rf SQLite user-assets && tar -xf /data/local/tmp/golden.tar${then} && chown -R ${owner}:${owner} SQLite user-assets && restorecon -R SQLite user-assets >/dev/null 2>&1`,
  );
}

/** The median of the numbers in `values`, or null when there are none. */
export function median(values) {
  const list = values.filter((v) => typeof v === 'number').sort((a, b) => a - b);
  if (list.length === 0) return null;
  const mid = Math.floor(list.length / 2);
  return list.length % 2 ? list[mid] : (list[mid - 1] + list[mid]) / 2;
}
