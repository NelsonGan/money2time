#!/usr/bin/env node
/**
 * upload-ios.mjs
 * Uploads exported screenshots to App Store Connect via the `asc` CLI.
 *
 *   node scripts/upload-ios.mjs --dir ./money2time-screenshots-all [--device phone|ipad|duo] [--dry-run]
 *
 * `--dir` holds one folder per locale, which is what "Export All Locales"
 * unzips to:
 *   ricecal-screenshots-all/
 *     en/  01-today.png  02-features.png  …
 *     ms/  …
 *
 * Credentials live in `asc` itself (`asc auth login`), not here. The only
 * thing this needs is which app to write to:
 *   ASC_APP_ID   numeric App ID, not the bundle id
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import {
  iosReady, uploadIOSLocale, IOS_LOCALE_MAP,
} from '../src/data/storeUpload.mjs';

// Next reads .env.local on its own; a plain node script has to be told. The
// imported module only reads process.env inside its functions, so doing this
// after the imports are hoisted is still in time.
dotenv.config({ path: ['.env.local', '.env'], quiet: true });

const args = process.argv.slice(2);
const getArg = (flag, fallback) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : fallback; };

const screenshotsDir = getArg('--dir', './money2time-screenshots-all');
const device = getArg('--device', 'phone');
const dryRun = args.includes('--dry-run');

const ready = await iosReady();
if (!ready.ok) {
  console.error(`Not ready: ${ready.why}`);
  process.exit(1);
}

console.log(`\n🍎 App Store Connect — ${device}${dryRun ? ' (dry run, nothing is written)' : ''}`);
console.log(`   ${ready.detail}, app ${process.env.ASC_APP_ID}`);
console.log(`   Screenshots dir: ${path.resolve(screenshotsDir)}\n`);

let failures = 0;

for (const ourLocale of Object.keys(IOS_LOCALE_MAP)) {
  const dir = path.join(screenshotsDir, ourLocale);
  if (!fs.existsSync(dir)) { console.log(`⚠  No folder for "${ourLocale}", skipping`); continue; }

  const pngs = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.png'));
  if (!pngs.length) { console.log(`⚠  Empty folder for "${ourLocale}", skipping`); continue; }

  console.log(`📂 ${ourLocale}  (${pngs.length} screenshots)`);

  try {
    const result = await uploadIOSLocale({
      device, locale: ourLocale, dir, dryRun, log: (line) => console.log(line),
    });
    if (result.skipped) { console.log(`   ⚠  ${result.reason}`); continue; }
    for (const ascLocale of result.uploaded) console.log(`   ✓ ${ascLocale}`);
    for (const err of result.errors) { failures++; console.log(`   ✗ ${err}`); }
  } catch (err) {
    failures++;
    console.error(`   ✗ ${err.message}`);
  }
}

console.log(
  failures ? `\n⚠️  Finished with ${failures} failure(s)\n`
  : dryRun ? '\n✅ Dry run complete, nothing was written\n'
  : '\n✅ iOS upload complete\n');
process.exit(failures ? 1 : 0);
