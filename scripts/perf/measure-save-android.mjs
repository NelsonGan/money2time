#!/usr/bin/env node
/**
 * Quick-add save timing on an Android emulator, against a release build bundled
 * with EXPO_PUBLIC_PERF_TRACE=1 (see utils/perfTrace.ts and README.md here).
 *
 * Per run: restore the snapshot at /data/local/tmp/golden.tar, cold launch,
 * wait for the post-launch report, tap +, tap Quick entry, type an entry, tap
 * save, and collect the fab_press / quick_add_open / quick_add_save reports.
 * Coordinates are screen pixels (find them with `uiautomator dump` or argent's
 * `describe`); the save button's is with the keyboard up.
 *
 *   node scripts/perf/measure-save-android.mjs --runs 8 --out save.json \
 *     --fab 949,2016 --quick 282,1794 --save 963,1195 [--text "14.5%slunch"] [--device emulator-5554]
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

const runs = Number(option('runs', '8'));
const out = option('out');
const fab = option('fab').split(',');
const quick = option('quick').split(',');
const save = option('save').split(',');
const text = option('text', '14.5%slunch');
const device = option('device', 'emulator-5554');
const sh = (cmd) => adbShell(device, cmd);
const events = () => androidPerfEvents(device);
const LABELS = ['fab_press', 'quick_add_open', 'quick_add_save'];

const act = androidLauncherActivity(device);
const results = [];
for (let i = 0; i < runs; i++) {
  tryRun(adb, ['-s', device, 'shell', 'am', 'force-stop', APP_BUNDLE]);
  restoreAndroidGolden(device);
  tryRun(adb, ['-s', device, 'logcat', '-c']);
  await sleep(1500);
  sh(`am start -W -n ${act} -a android.intent.action.MAIN -c android.intent.category.LAUNCHER`);
  await waitFor(events, (e) => e.some((x) => x.kind === 'post_launch'));
  await sleep(1000);
  sh(`input tap ${fab[0]} ${fab[1]}`);
  await sleep(1500);
  sh(`input tap ${quick[0]} ${quick[1]}`);
  await sleep(1800);
  sh(`input text "${text}"`);
  await sleep(1500);
  sh(`input tap ${save[0]} ${save[1]}`);
  const ev = await waitFor(events, (e) => e.some((x) => x.label === 'quick_add_save'), 8000);
  const r = { run: i + 1 };
  for (const label of LABELS) {
    const x = ev.find((item) => item.label === label);
    r[label] = x
      ? {
          maxGapMs: x.maxGapMs,
          jankMs: x.jankMs,
          longFrames: x.longFrames,
          firstFrameMs: x.firstFrameMs,
          gaps: x.gaps,
        }
      : null;
  }
  console.log(
    `run ${i + 1}: save max ${r.quick_add_save?.maxGapMs} jank ${r.quick_add_save?.jankMs} | open max ${r.quick_add_open?.maxGapMs} | fab max ${r.fab_press?.maxGapMs}`,
  );
  results.push(r);
  await sleep(1000);
}
const medians = {};
for (const label of LABELS) {
  for (const k of ['maxGapMs', 'jankMs', 'longFrames', 'firstFrameMs'])
    medians[`${label}.${k}`] = median(results.map((r) => r[label]?.[k]));
}
console.table(medians);
if (out) writeFileSync(out, JSON.stringify({ results, medians }, null, 2));
