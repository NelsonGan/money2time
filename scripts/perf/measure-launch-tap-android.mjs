#!/usr/bin/env node
/**
 * How quickly the app answers a tap right after launch, on an Android emulator
 * running a release build bundled with EXPO_PUBLIC_PERF_TRACE=1.
 *
 * Per run: restore /data/local/tmp/golden.tar, cold launch, wait until the
 * splash lifts (the `startup` line), wait `--after` ms more, tap the + button,
 * and measure from the tap command to the button's handler running (the
 * fab_press report's `startedAt`; both on the device clock), plus the frame
 * gaps that follow. `adb shell input tap` adds the same overhead to every
 * build, so compare medians between builds rather than reading them absolutely.
 *
 *   node scripts/perf/measure-launch-tap-android.mjs --runs 10 --after 1000 --fab 949,2016 --out tap.json
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : d;
};
const runs = Number(opt('runs', '10'));
const after = Number(opt('after', '1000'));
const fab = opt('fab', '949,2016').split(',');
const out = opt('out');
const device = opt('device', 'emulator-5554');
const bundle = 'com.nelsongan.money2time';
const adb = `${process.env.ANDROID_HOME ?? '/opt/homebrew/share/android-commandlinetools'}/platform-tools/adb`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sh = (cmd) => execFileSync(adb, ['-s', device, 'shell', cmd], { encoding: 'utf8' });
const tryRun = (a) => {
  try {
    return execFileSync(adb, ['-s', device, ...a], { encoding: 'utf8' });
  } catch {
    return '';
  }
};

function events() {
  const text = tryRun(['logcat', '-d', '-v', 'raw', '-s', 'ReactNativeJS:*']);
  const list = [];
  for (const line of text.split('\n')) {
    const at = line.indexOf('[m2t-perf] ');
    if (at < 0) continue;
    try {
      list.push(JSON.parse(line.slice(at + 11).trim()));
    } catch {}
  }
  return list;
}
async function waitFor(pred, timeout = 30000, step = 50) {
  const t = Date.now();
  while (Date.now() - t < timeout) {
    const e = events();
    if (pred(e)) return e;
    await sleep(step);
  }
  return events();
}
const act = sh(
  `cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.LAUNCHER ${bundle}`,
)
  .split('\n')
  .find((l) => l.startsWith(`${bundle}/`))
  .trim();

const results = [];
for (let i = 0; i < runs; i++) {
  tryRun(['shell', 'am', 'force-stop', bundle]);
  const files = `/data/data/${bundle}/files`;
  const owner = sh(`stat -c %U ${files}`).trim();
  sh(
    `cd ${files} && rm -rf SQLite user-assets && tar -xf /data/local/tmp/golden.tar && chown -R ${owner}:${owner} SQLite user-assets && restorecon -R SQLite user-assets >/dev/null 2>&1`,
  );
  tryRun(['logcat', '-c']);
  await sleep(1500);
  sh(`am start -n ${act} -a android.intent.action.MAIN -c android.intent.category.LAUNCHER`);
  const ev = await waitFor((e) => e.some((x) => x.kind === 'startup'), 30000, 30);
  const startup = ev.find((x) => x.kind === 'startup');
  if (!startup) {
    console.log(`run ${i + 1}: no startup`);
    continue;
  }
  const splashAt = startup.marks.splash_hide;
  // Wait until `after` ms past the splash on the device clock.
  const now = Number(sh('date +%s%3N').trim());
  await sleep(Math.max(0, splashAt + after - now));
  const tapAt = Number(sh(`date +%s%3N; input tap ${fab[0]} ${fab[1]}`).split('\n')[0].trim());
  const ev2 = await waitFor((e) => e.some((x) => x.label === 'fab_press'), 10000, 100);
  const press = ev2.find((x) => x.label === 'fab_press');
  const r = {
    run: i + 1,
    tapAfterSplash: tapAt - splashAt,
    tapToHandler: press ? press.startedAt - tapAt : null,
    maxGapMs: press?.maxGapMs ?? null,
    jankMs: press?.jankMs ?? null,
    longFrames: press?.longFrames ?? null,
  };
  console.log(
    `run ${r.run}: tap at +${r.tapAfterSplash}ms, tap→handler ${r.tapToHandler}ms, then max gap ${r.maxGapMs}ms jank ${r.jankMs}ms`,
  );
  results.push(r);
  await sleep(2500);
}
const med = (k) => {
  const v = results
    .map((r) => r[k])
    .filter((x) => typeof x === 'number')
    .sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};
const medians = Object.fromEntries(
  ['tapAfterSplash', 'tapToHandler', 'maxGapMs', 'jankMs', 'longFrames'].map((k) => [k, med(k)]),
);
console.table(medians);
if (out) writeFileSync(out, JSON.stringify({ after, results, medians }, null, 2));
