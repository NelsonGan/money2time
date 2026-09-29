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
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : d;
};
const runs = Number(opt('runs', '8'));
const out = opt('out');
const fab = opt('fab').split(',');
const quick = opt('quick').split(',');
const save = opt('save').split(',');
const text = opt('text', '14.5%slunch');
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
async function waitFor(pred, timeout = 30000) {
  const t = Date.now();
  while (Date.now() - t < timeout) {
    const e = events();
    if (pred(e)) return e;
    await sleep(250);
  }
  return events();
}
function activity() {
  const r = sh(
    `cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.LAUNCHER ${bundle}`,
  );
  return r
    .split('\n')
    .find((l) => l.startsWith(`${bundle}/`))
    .trim();
}

const act = activity();
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
  sh(`am start -W -n ${act} -a android.intent.action.MAIN -c android.intent.category.LAUNCHER`);
  await waitFor((e) => e.some((x) => x.kind === 'post_launch'));
  await sleep(1000);
  sh(`input tap ${fab[0]} ${fab[1]}`);
  await sleep(1500);
  sh(`input tap ${quick[0]} ${quick[1]}`);
  await sleep(1800);
  sh(`input text "${text}"`);
  await sleep(1500);
  sh(`input tap ${save[0]} ${save[1]}`);
  const ev = await waitFor((e) => e.some((x) => x.label === 'quick_add_save'), 8000);
  const pick = (label) => ev.find((x) => x.label === label) ?? null;
  const r = { run: i + 1 };
  for (const label of ['fab_press', 'quick_add_open', 'quick_add_save']) {
    const x = pick(label);
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
const med = (vals) => {
  const v = vals.filter((x) => typeof x === 'number').sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};
const medians = {};
for (const label of ['fab_press', 'quick_add_open', 'quick_add_save']) {
  for (const k of ['maxGapMs', 'jankMs', 'longFrames', 'firstFrameMs'])
    medians[`${label}.${k}`] = med(results.map((r) => r[label]?.[k]));
}
console.table(medians);
if (out) writeFileSync(out, JSON.stringify({ results, medians }, null, 2));
