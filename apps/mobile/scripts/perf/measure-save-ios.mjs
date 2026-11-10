#!/usr/bin/env node
/**
 * Save timing on an iOS simulator, against a release build bundled with
 * EXPO_PUBLIC_PERF_TRACE=1 (see utils/perfTrace.ts and the README's
 * Performance measurement section): a quick-entry save, and an edit of an
 * existing entry, each from a cold launch on the same database snapshot.
 *
 * Per run: restore the snapshot, cold launch, wait for the post-launch report,
 * then tap + and Quick entry, type an entry and tap Save; and again from a
 * cold launch, open the first entry in the list, pick another category and tap
 * Update. Collects the `quick_add_save` and `editor_update` frame reports and
 * the spans timed during each.
 *
 * Taps and typing go through the `agent-device` command T3 Code's
 * `device_open` returns, so the run shows in the Device panel. Coordinates are
 * screen points; the defaults are an iPhone 18 Pro (402 x 874) with the
 * default bottom bar, the data set's newest entry being an expense.
 *
 *   node scripts/perf/measure-save-ios.mjs --device <udid> --golden <dir> \
 *     --agent-device <command> [--device-set ~/.simlock/devices/ios] \
 *     [--runs 8] [--out save.json] [--text "Coffee 5"] \
 *     [--fab 352,738] [--quick 105,632] [--save 357,427] \
 *     [--row 200,300] [--category 300,149] [--update 200,805]
 */
import { writeFileSync } from 'node:fs';

import {
  APP_BUNDLE,
  median,
  option,
  restoreIosGolden,
  run,
  simctlArgs,
  sleep,
  startIosPerfLog,
  tryRun,
  waitFor,
} from './lib.mjs';

const device = option('device');
const golden = option('golden');
const agentDevice = option('agent-device');
const runs = Number(option('runs', '8'));
const out = option('out');
const text = option('text', 'Coffee 5');
const point = (name, fallback) => option(name, fallback).split(',');
const fab = point('fab', '352,738');
const quick = point('quick', '105,632');
const save = point('save', '357,427');
const row = point('row', '200,300');
const category = point('category', '300,149');
const update = point('update', '200,805');
const LABELS = ['quick_add_save', 'editor_update'];

if (!device || !golden || !agentDevice) {
  console.error(
    'usage: measure-save-ios.mjs --device <udid> --golden <dir> --agent-device <command>',
  );
  process.exit(1);
}

const ui = (...args) => tryRun(agentDevice, args);
const tap = ([x, y]) => ui('press', x, y);
const log = await startIosPerfLog(device);

async function coldLaunch() {
  tryRun('xcrun', simctlArgs('terminate', device, APP_BUNDLE));
  restoreIosGolden(device, golden);
  await sleep(1500);
  log.clear();
  run('xcrun', simctlArgs('launch', device, APP_BUNDLE));
  await waitFor(log.events, (events) => events.some((event) => event.kind === 'post_launch'));
  // Past the tab preloads, so they are not counted against the save.
  await sleep(1500);
  // Attach the automation session to the app that is already running.
  ui('open', APP_BUNDLE);
  await sleep(500);
}

async function report(label) {
  await waitFor(log.events, (events) => events.some((event) => event.label === label), 10000);
  // The spans line follows the frame report.
  await sleep(600);
  const events = log.events();
  const frames = events.find((event) => event.kind === 'interaction' && event.label === label);
  if (!frames) return null;
  const spans = events.find((event) => event.kind === 'spans' && event.phase === label)?.spans;
  return {
    maxGapMs: frames.maxGapMs,
    jankMs: frames.jankMs,
    longFrames: frames.longFrames,
    gaps: frames.gaps,
    spans: spans ?? {},
  };
}

const results = [];
for (let index = 0; index < runs; index += 1) {
  await coldLaunch();
  tap(fab);
  await sleep(1500);
  tap(quick);
  await sleep(2000);
  ui('type', text);
  await sleep(1500);
  tap(save);
  const quickSave = await report('quick_add_save');

  await coldLaunch();
  tap(row);
  await sleep(2000);
  tap(category);
  await sleep(800);
  tap(update);
  const editorUpdate = await report('editor_update');

  console.log(
    `run ${index + 1}: quick save jank ${quickSave?.jankMs}ms (max gap ${quickSave?.maxGapMs}ms) | edit jank ${editorUpdate?.jankMs}ms (max gap ${editorUpdate?.maxGapMs}ms)`,
  );
  results.push({ run: index + 1, quick_add_save: quickSave, editor_update: editorUpdate });
}
log.stop();

const medians = {};
for (const label of LABELS) {
  for (const key of ['maxGapMs', 'jankMs', 'longFrames']) {
    medians[`${label}.${key}`] = median(results.map((result) => result[label]?.[key]));
  }
  const spanNames = new Set(results.flatMap((result) => Object.keys(result[label]?.spans ?? {})));
  for (const name of spanNames) {
    medians[`${label}.span:${name}`] = median(
      results.map((result) => result[label]?.spans?.[name]?.[0]),
    );
  }
}
console.table(medians);
if (out) writeFileSync(out, JSON.stringify({ device, results, medians }, null, 2));
