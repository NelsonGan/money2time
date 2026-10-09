#!/usr/bin/env node
/**
 * Cold-start timing on an iOS simulator or Android emulator.
 *
 * Needs a release build bundled with EXPO_PUBLIC_PERF_TRACE=1, which makes the
 * app log `[m2t-perf]` lines (see utils/perfTrace.ts). Each run kills the app,
 * launches it, and waits for the `startup` line logged as the splash lifts and
 * the `post_launch` frame report that follows it.
 *
 *   node scripts/perf/measure-startup.mjs ios --device <udid> --runs 10
 *   node scripts/perf/measure-startup.mjs android --device emulator-5554 --runs 10
 *
 * Options: --bundle <id> (default com.nelsongan.money2time), --out <file.json>,
 * --settle <ms> pause between runs (default 2000), --golden <dir> restore the
 * app's database from a snapshot before every run so each launch starts from
 * the same state (iOS: a copy of Documents/SQLite and Documents/user-assets;
 * Android: a tar of files/SQLite and files/user-assets already pushed to
 * /data/local/tmp/golden.tar, pass any value), and --backup-due to mark the
 * daily auto-backup as due, which is what the first launch of each day does.
 *
 * `launch` is measured from the moment the launch command is issued (host
 * clock on iOS, whose simulator shares it; device clock on Android), so it
 * includes process creation and native init. Android also reports the OS's
 * own `am start -W` TotalTime, which runs until the first frame is drawn.
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

import {
  adb,
  androidLauncherActivity,
  APP_BUNDLE,
  median,
  option,
  parsePerfLines,
  restoreAndroidGolden,
  run,
  sleep,
  tryRun,
  waitFor,
} from './lib.mjs';

const platform = process.argv[2];
const device = option('device');
const runs = Number(option('runs', '10'));
const bundle = option('bundle', APP_BUNDLE);
const out = option('out');
const settleMs = Number(option('settle', '2000'));
const golden = option('golden');
const backupDue = process.argv.includes('--backup-due');
const STALE_BACKUP_AT = '2020-01-01T00:00:00.000Z';

if (!['ios', 'android'].includes(platform) || !device) {
  console.error('usage: measure-startup.mjs <ios|android> --device <id> [--runs N] [--out f]');
  process.exit(1);
}

// iOS: one `log stream` for the whole session, buffered into a string.
let iosLog = '';
let iosStream = null;
async function startIosStream() {
  iosStream = spawn('xcrun', [
    'simctl',
    'spawn',
    device,
    'log',
    'stream',
    '--level',
    'debug',
    '--style',
    'compact',
    '--predicate',
    'eventMessage CONTAINS "[m2t-perf]"',
  ]);
  iosStream.stdout.on('data', (chunk) => {
    iosLog += chunk.toString();
  });
  await sleep(1500);
}

// The frame report, then a moment for the marks line that follows it (builds
// from before that line existed never send it).
async function waitForPostLaunch(readText) {
  const read = () => parsePerfLines(readText());
  await waitFor(read, (list) => list.some((e) => e.kind === 'post_launch'));
  return waitFor(read, (list) => list.some((e) => e.kind === 'post_launch_marks'), 1000);
}

function restoreIos() {
  const container = run('xcrun', ['simctl', 'get_app_container', device, bundle, 'data']).trim();
  for (const dir of ['SQLite', 'user-assets']) {
    run('rm', ['-rf', `${container}/Documents/${dir}`]);
    run('cp', ['-R', `${golden}/${dir}`, `${container}/Documents/${dir}`]);
  }
  if (backupDue) {
    run('sqlite3', [
      `${container}/Documents/SQLite/money2time.db`,
      `UPDATE settings SET last_auto_backup_at = '${STALE_BACKUP_AT}';`,
    ]);
  }
}

function restoreAndroid() {
  const staleSql = backupDue
    ? `sqlite3 SQLite/money2time.db "UPDATE settings SET last_auto_backup_at = '${STALE_BACKUP_AT}';"`
    : '';
  restoreAndroidGolden(device, bundle, staleSql);
}

async function runOnce(index) {
  let t0;
  let osTotalTime = null;
  let events;
  if (platform === 'ios') {
    tryRun('xcrun', ['simctl', 'terminate', device, bundle]);
    if (golden) restoreIos();
    await sleep(settleMs);
    iosLog = '';
    t0 = Date.now();
    run('xcrun', ['simctl', 'launch', device, bundle]);
    events = await waitForPostLaunch(() => iosLog);
  } else {
    tryRun(adb, ['-s', device, 'shell', 'am', 'force-stop', bundle]);
    if (golden) restoreAndroid();
    tryRun(adb, ['-s', device, 'logcat', '-c']);
    await sleep(settleMs);
    const output = run(adb, [
      '-s',
      device,
      'shell',
      `date +%s%3N; am start -W -n ${activity} -a android.intent.action.MAIN -c android.intent.category.LAUNCHER`,
    ]);
    t0 = Number(output.split('\n')[0].trim());
    const total = output.match(/TotalTime:\s*(\d+)/);
    osTotalTime = total ? Number(total[1]) : null;
    events = await waitForPostLaunch(() =>
      tryRun(adb, ['-s', device, 'logcat', '-d', '-v', 'raw', '-s', 'ReactNativeJS:*']),
    );
  }
  const startup = events.find((e) => e.kind === 'startup');
  const post = events.find((e) => e.kind === 'post_launch');
  if (!startup) {
    console.error(`run ${index + 1}: no startup line`);
    return null;
  }
  const m = startup.marks;
  const since = (from, to) =>
    m[from] !== undefined && m[to] !== undefined ? m[to] - m[from] : null;
  const result = {
    run: index + 1,
    txCount: startup.txCount,
    launchToSplashHide: m.splash_hide - t0,
    launchToModulesStart: m.modules_start - t0,
    moduleEval: since('modules_start', 'index_eval'),
    indexToAppRender: since('index_eval', 'app_render'),
    fontsWait: since('app_render', 'fonts_ready'),
    toDataLoadStart:
      since('fonts_ready', 'data_load_start') ?? since('app_render', 'data_load_start'),
    dbInit: since('data_load_start', 'db_init'),
    toRecurring: since('db_init', 'recurring_run'),
    toTxListStart: since('recurring_run', 'tx_list_start'),
    txList: since('tx_list_start', 'tx_list'),
    toBalances: since('tx_list', 'balances'),
    dataLoad: since('data_load_start', 'data_load_end'),
    firstRender: since('data_load_end', 'content_render'),
    toLayout: since('content_render', 'content_layout'),
    toSplashHide: since('content_layout', 'splash_hide'),
    osTotalTime,
    postLaunchMaxGap: post?.maxGapMs ?? null,
    postLaunchJank: post?.jankMs ?? null,
    postLaunchLongFrames: post?.longFrames ?? null,
    postLaunchSettledAt: post?.settledAtMs ?? null,
  };
  // Kept per run rather than in the medians: what ran after the splash lifted
  // (ms after it) and the longest frame gaps ([ms into the window, gap ms]).
  const postMarks = events.find((e) => e.kind === 'post_launch_marks');
  const detail = { postLaunchMarks: postMarks?.marks ?? null, postLaunchGaps: post?.gaps ?? null };
  console.log(
    `run ${result.run}: launch→content ${result.launchToSplashHide}ms, data load ${result.dataLoad}ms (tx list ${result.txList}ms), first render ${result.firstRender}ms` +
      (osTotalTime !== null ? `, am start TotalTime ${osTotalTime}ms` : '') +
      (post ? `, post-launch jank ${post.jankMs}ms (max gap ${post.maxGapMs}ms)` : ''),
  );
  return { ...result, detail };
}

const activity = platform === 'android' ? androidLauncherActivity(device, bundle) : null;
if (platform === 'ios') await startIosStream();
const results = [];
for (let index = 0; index < runs; index += 1) {
  const result = await runOnce(index);
  if (result) results.push(result);
}
iosStream?.kill();

const keys = Object.keys(results[0] ?? {}).filter((key) => key !== 'run' && key !== 'detail');
const medians = Object.fromEntries(keys.map((key) => [key, median(results.map((r) => r[key]))]));
console.log('\nmedian of', results.length, 'runs:');
console.table(medians);
if (out) writeFileSync(out, JSON.stringify({ platform, device, results, medians }, null, 2));
