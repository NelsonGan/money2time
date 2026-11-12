#!/usr/bin/env node
/**
 * upload-android.mjs
 * Uploads exported screenshots to Google Play via the `gplay` CLI.
 *
 *   node scripts/upload-android.mjs --dir ./money2time-screenshots-all [--device phone|tablet|feature] [--concurrency 6] [--dry-run]
 *   node scripts/upload-android.mjs --device icon [--file <png>] [--dry-run]
 *
 * `--dir` holds one folder per locale, which is what "Export All Locales"
 * unzips to. Everything goes into a single Play edit and commits once, so a
 * failure part-way through leaves the listing untouched rather than half
 * updated. Locales upload into that edit six at a time, like the Studio's
 * Upload to Store.
 *
 * `--device icon` is the odd one: there is no per-locale artwork to walk, just
 * the one file in the repo, written to every listing Play holds.
 *
 * Credentials live in `gplay` itself (`gplay setup`), not here. The only thing
 * this needs is which package to write to:
 *   ANDROID_PACKAGE_NAME
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import {
  androidReady, androidEditCreate, androidEditCommit, androidEditDelete,
  uploadAndroidLocale, uploadAndroidIcon, androidListingLocales, androidIconPath,
  forEachLimit, parseConcurrency, ANDROID_LOCALE_MAP,
} from '../src/data/storeUpload.mjs';

// Next reads .env.local on its own; a plain node script has to be told. The
// imported module only reads process.env inside its functions, so doing this
// after the imports are hoisted is still in time.
dotenv.config({ path: ['.env.local', '.env'], quiet: true });

const args = process.argv.slice(2);
const getArg = (flag, fallback) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : fallback; };

const screenshotsDir = getArg('--dir', './money2time-screenshots-all');
const device = getArg('--device', 'phone');
/**
 * `gplay images` has no dry run of its own, so this rehearses the real thing:
 * the images really are uploaded, into an edit that is then discarded. An
 * uncommitted edit never reaches the store.
 */
const dryRun = args.includes('--dry-run');
let concurrency;
try {
  concurrency = parseConcurrency(getArg('--concurrency', undefined));
} catch (err) {
  console.error(`\n❌ ${err.message}\n`);
  process.exit(1);
}

const ready = await androidReady();
if (!ready.ok) {
  console.error(`Not ready: ${ready.why}`);
  process.exit(1);
}

console.log(`\n🤖 Google Play — ${device}${dryRun ? ' (dry run, the edit is discarded at the end)' : ''}`);
console.log(`   ${ready.detail}, package ${process.env.ANDROID_PACKAGE_NAME}`);
if (device !== 'icon') console.log(`   Screenshots dir: ${path.resolve(screenshotsDir)}\n`);

const editId = await androidEditCreate();
console.log(`Edit ${editId}\n`);

let failures = 0;

try {
  if (device === 'icon') {
    // Play's listing locales, not ours: the icon has to reach the listings the
    // locale map has never written to, which are the ones still on old art.
    // Read through the edit already open — a second edit would invalidate it.
    const file = path.resolve(getArg('--file', androidIconPath()));
    if (!fs.existsSync(file)) throw new Error(`No icon at ${file}`);

    const playLocales = await androidListingLocales(editId);
    if (!playLocales.length) throw new Error('Play holds no listing for this app to put an icon on');
    console.log(`🎨 ${path.relative(process.cwd(), file)} → ${playLocales.length} listings\n`);

    for (const playLocale of playLocales) {
      try {
        await uploadAndroidIcon({ playLocale, file, editId });
        console.log(`   ✓ ${playLocale}`);
      } catch (err) {
        failures++;
        console.log(`   ✗ ${playLocale}: ${err.message}`);
      }
    }
  } else {
  await forEachLimit(Object.keys(ANDROID_LOCALE_MAP), concurrency, async (ourLocale) => {
    const dir = path.join(screenshotsDir, ourLocale);
    // Buffered so parallel locales do not interleave their lines.
    const lines = [];
    try {
      if (!fs.existsSync(dir)) { console.log(`⚠  No folder for "${ourLocale}", skipping`); return; }
      const pngs = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.png'));
      if (!pngs.length) { console.log(`⚠  Empty folder for "${ourLocale}", skipping`); return; }
      lines.push(`📂 ${ourLocale}  (${pngs.length} screenshots)`);

      const result = await uploadAndroidLocale({
        device, locale: ourLocale, dir, editId, log: (line) => lines.push(line),
      });
      if (result.skipped) lines.push(`   ⚠  ${result.reason}`);
      else {
        const where = result.galleries.length > 1 ? ` → ${result.galleries.join(' + ')}` : '';
        for (const playLocale of result.uploaded) lines.push(`   ✓ ${playLocale} (${result.count})${where}`);
        for (const err of result.errors) { failures++; lines.push(`   ✗ ${err}`); }
      }
    } catch (err) {
      // One locale throwing must not abandon the others mid-upload; the edit
      // is discarded below once every locale has finished.
      failures++;
      if (!lines.length) lines.push(`📂 ${ourLocale}`);
      lines.push(`   ✗ ${err.message}`);
    }
    console.log(lines.join('\n'));
  });
  }

  if (failures) {
    await androidEditDelete(editId);
    console.error(`\n❌ ${failures} failure(s), edit discarded — nothing changed\n`);
    process.exit(1);
  }

  if (dryRun) {
    await androidEditDelete(editId);
    console.log('\n✅ Dry run complete, edit discarded — nothing changed\n');
  } else {
    await androidEditCommit(editId);
    console.log('\n✅ Android upload complete — saved as a draft in Play Console\n');
  }
} catch (err) {
  await androidEditDelete(editId);
  console.error(`\n❌ Upload failed, edit discarded\n${err.message}\n`);
  process.exit(1);
}
