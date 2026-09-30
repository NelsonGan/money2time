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
import { writeFileSync } from 'node:fs';

import {
  adb,
  adbShell,
  androidLauncherActivity,
  androidPerfEvents,
  APP_BUNDLE,
  median,
  option,
  restoreAndroidGolden,
  sleep,
  tryRun,
  waitFor,
} from './lib.mjs';

const runs = Number(option('runs', '10'));
const after = Number(option('after', '1000'));
const fab = option('fab', '949,2016').split(',');
const out = option('out');
const device = option('device', 'emulator-5554');
const sh = (cmd) => adbShell(device, cmd);
const events = () => androidPerfEvents(device);

const act = androidLauncherActivity(device);
const results = [];
for (let i = 0; i < runs; i++) {
  tryRun(adb, ['-s', device, 'shell', 'am', 'force-stop', APP_BUNDLE]);
  restoreAndroidGolden(device);
  tryRun(adb, ['-s', device, 'logcat', '-c']);
  await sleep(1500);
  sh(`am start -n ${act} -a android.intent.action.MAIN -c android.intent.category.LAUNCHER`);
  const ev = await waitFor(events, (e) => e.some((x) => x.kind === 'startup'), 30000, 30);
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
  const ev2 = await waitFor(events, (e) => e.some((x) => x.label === 'fab_press'), 10000, 100);
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
const medians = Object.fromEntries(
  ['tapAfterSplash', 'tapToHandler', 'maxGapMs', 'jankMs', 'longFrames'].map((k) => [
    k,
    median(results.map((r) => r[k])),
  ]),
);
console.table(medians);
if (out) writeFileSync(out, JSON.stringify({ after, results, medians }, null, 2));
