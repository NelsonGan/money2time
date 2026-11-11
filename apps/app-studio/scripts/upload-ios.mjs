#!/usr/bin/env node
/**
 * upload-ios.mjs
 * Uploads exported screenshots to App Store Connect via the `asc` CLI.
 *
 *   node scripts/upload-ios.mjs --dir ./money2time-screenshots-all [--device phone|ipad|duo] [--concurrency 6] [--dry-run]
 *
 * Locales upload six at a time, like the Studio's Upload to Store. Each
 * locale's lines print together once it finishes.
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
  iosReady, uploadIOSLocale, iosVersion, forEachLimit, IOS_LOCALE_MAP, UPLOAD_CONCURRENCY,
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
const concurrency = Number(getArg('--concurrency', UPLOAD_CONCURRENCY)) || UPLOAD_CONCURRENCY;

const ready = await iosReady();
if (!ready.ok) {
  console.error(`Not ready: ${ready.why}`);
  process.exit(1);
}

console.log(`\n🍎 App Store Connect — ${device}${dryRun ? ' (dry run, nothing is written)' : ''}`);
console.log(`   ${ready.detail}, app ${process.env.ASC_APP_ID}`);
console.log(`   Screenshots dir: ${path.resolve(screenshotsDir)}\n`);

let failures = 0;

// Every locale needs the same version: look it up once rather than in each of
// the parallel uploads.
await iosVersion();

await forEachLimit(Object.keys(IOS_LOCALE_MAP), concurrency, async (ourLocale) => {
  const dir = path.join(screenshotsDir, ourLocale);
  if (!fs.existsSync(dir)) { console.log(`⚠  No folder for "${ourLocale}", skipping`); return; }

  const pngs = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.png'));
  if (!pngs.length) { console.log(`⚠  Empty folder for "${ourLocale}", skipping`); return; }

  // Buffered so parallel locales do not interleave their lines.
  const lines = [`📂 ${ourLocale}  (${pngs.length} screenshots)`];
  try {
    const result = await uploadIOSLocale({
      device, locale: ourLocale, dir, dryRun, log: (line) => lines.push(line),
    });
    if (result.skipped) lines.push(`   ⚠  ${result.reason}`);
    else {
      for (const ascLocale of result.uploaded) lines.push(`   ✓ ${ascLocale}`);
      for (const err of result.errors) { failures++; lines.push(`   ✗ ${err}`); }
    }
  } catch (err) {
    failures++;
    lines.push(`   ✗ ${err.message}`);
  }
  console.log(lines.join('\n'));
});

console.log(
  failures ? `\n⚠️  Finished with ${failures} failure(s)\n`
  : dryRun ? '\n✅ Dry run complete, nothing was written\n'
  : '\n✅ iOS upload complete\n');
process.exit(failures ? 1 : 0);
