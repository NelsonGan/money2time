#!/usr/bin/env node
/**
 * Post payment notifications on an Android emulator or device, so the payment
 * alert listener (plugins/withMoney2TimePaymentCapture.js) captures them the
 * way it would a bank's. Uses `adb shell cmd notification post`, which posts as
 * the `com.android.shell` package: the listener accepts that package only in
 * development builds (`allowShell` in its config), so this never works against
 * a store build. In the app, pick "Shell" under Recently active and select an
 * account. Alerts from an app without a selected account are skipped.
 *
 *   node scripts/post-test-alerts.mjs                  # every fixture alert
 *   node scripts/post-test-alerts.mjs my-card-spent    # fixtures by id
 *   node scripts/post-test-alerts.mjs --text "RM12.30 spent at KFC with card ending 1234" [--title "Maybank"]
 *   node scripts/post-test-alerts.mjs --list
 *
 * Options: --serial <adb serial>, --delay <ms between posts, default 1500>.
 * Fixtures come from __tests__/fixtures/payment-alerts/alerts.json, the same
 * synthetic corpus used by notification scanner evaluations.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = path.join(ROOT, '__tests__/fixtures/payment-alerts/alerts.json');

function adbPath() {
  const androidSdkRoot = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  const candidates = [
    androidSdkRoot && path.join(androidSdkRoot, 'platform-tools/adb'),
    '/opt/homebrew/share/android-commandlinetools/platform-tools/adb',
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) ?? 'adb';
}

function parseArgs(argv) {
  const args = { ids: [], delay: 1500, serial: null, text: null, title: 'Bank', list: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--serial') args.serial = argv[(i += 1)];
    else if (arg === '--delay') args.delay = Number(argv[(i += 1)]);
    else if (arg === '--text') args.text = argv[(i += 1)];
    else if (arg === '--title') args.title = argv[(i += 1)];
    else if (arg === '--list') args.list = true;
    else if (arg.startsWith('--')) throw new Error(`Unknown option: ${arg}`);
    else args.ids.push(arg);
  }
  return args;
}

/** One argument for `adb shell`, which re-splits on spaces: quote for the device shell. */
function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function post(adb, serial, tag, title, body) {
  const command = [
    'cmd',
    'notification',
    'post',
    '-S',
    'bigtext',
    '-t',
    shellQuote(title),
    shellQuote(tag),
    shellQuote(body),
  ].join(' ');
  execFileSync(adb, [...(serial ? ['-s', serial] : []), 'shell', command], { stdio: 'inherit' });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const fixtures = JSON.parse(readFileSync(FIXTURES, 'utf8')).alerts;
  if (args.list) {
    for (const alert of fixtures)
      console.log(`${alert.id.padEnd(32)} ${alert.title ?? ''} | ${alert.body}`);
    return;
  }
  const adb = adbPath();
  const alerts = args.text
    ? [{ id: `manual-${Date.now()}`, title: args.title, body: args.text }]
    : fixtures.filter((alert) => args.ids.length === 0 || args.ids.includes(alert.id));
  if (alerts.length === 0) {
    console.error('No matching fixture ids. Use --list to see them.');
    process.exit(1);
  }
  for (const [index, alert] of alerts.entries()) {
    // A distinct tag per post: the same tag would update one notification.
    post(adb, args.serial, `m2t-dev-${alert.id}`, alert.title ?? 'Bank', alert.body);
    console.log(`posted ${alert.id}`);
    if (index < alerts.length - 1) await sleep(args.delay);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
