/**
 * Uploading, in terms of the two CLIs rather than the two REST APIs.
 *
 * `asc` and `gplay` already hold the credentials — an App Store Connect key in
 * the macOS keychain, a Play service account under `~/.gplay` — so nothing in
 * this repo touches a `.p8` or a service-account JSON any more. What is left
 * here is the part that is ours: which of our locales maps to which of the
 * stores', and the order the commands go in.
 *
 * Shared by the Next API routes and by `scripts/upload-*.mjs`, so the button
 * and the command line cannot drift.
 */

import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import {
  IOS_LOCALE_MAP, ANDROID_LOCALE_MAP,
  IOS_DEVICE_TYPE, ANDROID_IMAGE_TYPES,
  ANDROID_MAX_SCREENSHOTS, ANDROID_MAX_IMAGES, IOS_MAX_SCREENSHOTS,
  ANDROID_ICON_FILE,
} from './storeLocales.mjs';

const MAX_BUFFER = 32 * 1024 * 1024;

/**
 * Run a CLI and resolve with its output. Never rejects on a non-zero exit —
 * callers decide what a failure means, and a whole run should not be lost
 * because one locale is missing from a store.
 *
 * @returns {Promise<{ok: boolean, code: number, stdout: string, stderr: string}>}
 */
export function run(bin, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(bin, args, { maxBuffer: MAX_BUFFER, ...opts }, (err, stdout, stderr) => {
      resolve({
        ok: !err,
        code: err?.code ?? 0,
        stdout: String(stdout ?? ''),
        stderr: String(stderr ?? err?.message ?? ''),
      });
    });
  });
}

/** Run and parse stdout as JSON, which is what both CLIs emit by default. */
export async function runJson(bin, args, opts) {
  const res = await run(bin, args, opts);
  if (!res.ok) return { ...res, json: null };
  try {
    return { ...res, json: JSON.parse(res.stdout) };
  } catch {
    return { ...res, json: null };
  }
}

/** The first line of a CLI failure, which is the part worth showing. */
export function briefError(res) {
  const text = (res.stderr || res.stdout || '').trim();
  return text.split('\n').find(l => l.trim()) ?? `exited ${res.code}`;
}

// ── Availability ─────────────────────────────────────────────────────────────

export async function iosReady() {
  if (!process.env.ASC_APP_ID) return { ok: false, why: 'ASC_APP_ID is not set' };
  const res = await runJson('asc', ['auth', 'status']);
  if (!res.ok) return { ok: false, why: 'the asc CLI is not installed or not on PATH' };
  const creds = res.json?.credentials ?? [];
  if (!creds.length) return { ok: false, why: 'asc has no stored credential — run `asc auth login`' };
  const name = (creds.find(c => c.isDefault) ?? creds[0]).name;
  return { ok: true, detail: `asc profile "${name}"` };
}

export async function androidReady() {
  if (!process.env.ANDROID_PACKAGE_NAME) return { ok: false, why: 'ANDROID_PACKAGE_NAME is not set' };
  const res = await runJson('gplay', ['auth', 'status']);
  if (!res.ok) return { ok: false, why: 'the gplay CLI is not installed or not on PATH' };

  const profiles = res.json?.profiles ?? [];
  if (!profiles.length) return { ok: false, why: 'gplay has no profile — run `gplay setup`' };

  // One machine can hold several Play accounts, so an app that is not on the
  // default one names its profile in GPLAY_PROFILE and gplay picks it up from
  // the environment. Report the profile that will actually be used, not the
  // default, or the status line quietly names the wrong account.
  const wanted = process.env.GPLAY_PROFILE;
  if (wanted && !profiles.some(p => p.name === wanted)) {
    return {
      ok: false,
      why: `gplay has no profile "${wanted}" — run \`gplay auth login --service-account <path> --profile ${wanted} --set-default=false\``,
    };
  }

  return { ok: true, detail: `gplay profile "${wanted ?? res.json?.profile ?? profiles[0].name}"` };
}

// ── Concurrency ──────────────────────────────────────────────────────────────

/**
 * How many locales the upload scripts send at once, the same as the Studio's
 * Upload to Store (`MAX_UPLOAD_CONCURRENCY` in `UploadModal.tsx`). Most of an
 * upload is waiting for the store to process each image, so one locale at a
 * time took about six times as long.
 */
export const UPLOAD_CONCURRENCY = 6;

/** Run `fn` on every item, at most `limit` at once. Items finish in any order. */
export async function forEachLimit(items, limit, fn) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
}

// ── Staging ──────────────────────────────────────────────────────────────────

/**
 * Write one locale's captured PNGs to `<root>/<locale>/`, replacing whatever
 * was there. Both CLIs take a directory, so the browser's base64 has to land
 * on disk before either of them can see it.
 *
 * @param {Array<{filename: string, data: string}>} screenshots base64, no data: prefix
 * @returns {string} the directory written
 */
export function stageLocale(root, locale, screenshots) {
  // Both values arrive in a request body: keep them from naming any path
  // outside the staging folder (`../`, an absolute path, a dotfile).
  if (typeof locale !== 'string' || !/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(locale)) {
    throw new Error(`Not a locale: ${String(locale).slice(0, 40)}`);
  }
  if (!Array.isArray(screenshots)) throw new Error('No screenshots to stage.');
  for (const shot of screenshots) {
    const name = shot?.filename;
    if (typeof name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,120}\.(png|jpe?g)$/i.test(name) || name.includes('..')) {
      throw new Error(`Not a screenshot file name: ${String(name).slice(0, 60)}`);
    }
    if (typeof shot.data !== 'string') throw new Error(`No image data for ${name}.`);
  }
  const dir = path.join(root, locale);
  if (path.dirname(path.resolve(dir)) !== path.resolve(root)) throw new Error('Staging path escaped its folder.');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  for (const shot of screenshots) {
    fs.writeFileSync(path.join(dir, shot.filename), Buffer.from(shot.data, 'base64'));
  }
  return dir;
}

/** PNGs in a directory, in the order both stores will show them. */
export function sortedPngs(dir) {
  return fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.png')).sort();
}

// ── iOS ──────────────────────────────────────────────────────────────────────

/**
 * Resolve the App Store version this upload targets, and cache it: every
 * locale in a run wants the same answer and it costs a round trip.
 */
let iosVersionCache = null;

export async function iosVersion({ refresh = false } = {}) {
  if (iosVersionCache && !refresh) return iosVersionCache;

  const appId = process.env.ASC_APP_ID;
  const res = await runJson('asc', ['versions', 'list', '--app', appId]);
  if (!res.json) throw new Error(`asc versions list failed: ${briefError(res)}`);

  const editable = ['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED'];
  const versions = (res.json.data ?? []).filter(v => v.attributes?.platform === 'IOS');
  const version = versions.find(v => {
    const a = v.attributes ?? {};
    return editable.includes(a.appStoreState ?? a.appVersionState);
  });

  if (!version) {
    throw new Error('No editable iOS version. Create one in App Store Connect first.');
  }

  iosVersionCache = {
    id: version.id,
    versionString: version.attributes.versionString,
    /**
     * A first release has no "What's New": there is no previous version for it
     * to be new against, so App Store Connect refuses the field with "Attribute
     * 'whatsNew' cannot be edited at this time". An app with exactly one
     * version has never shipped, and ASC does not let a second version exist
     * until the first has, so the count is the whole test.
     */
    isFirstRelease: versions.length <= 1,
  };
  return iosVersionCache;
}

/**
 * The version-localization id for an ASC locale, creating the localization if
 * the version does not have it yet. `asc screenshots upload` and
 * `asc localizations update` both key off this rather than the locale code.
 *
 * `create: false` makes it read-only, which is what a dry run needs: creating
 * a localization is itself a write, and a rehearsal that quietly added four
 * empty locales to the version would be lying about doing nothing.
 */
export async function iosLocalizationId(versionId, ascLocale, { create = true } = {}) {
  const list = await runJson('asc', [
    'localizations', 'list', '--version', versionId, '--locale', ascLocale,
  ]);
  const found = list.json?.data?.find(l => l.attributes?.locale === ascLocale);
  if (found) return { id: found.id, created: false };

  if (!create) return { id: null, created: false, wouldCreate: true };

  const created = await runJson('asc', [
    'localizations', 'create', '--version', versionId, '--locale', ascLocale,
  ]);
  const id = created.json?.data?.id;
  if (!id) throw new Error(`could not create localization ${ascLocale}: ${briefError(created)}`);
  return { id, created: true };
}

/**
 * Upload one locale's screenshots to every App Store locale it maps to.
 * `--replace` clears the set first, so a re-run replaces rather than appends.
 *
 * @param {(line: string) => void} log
 */
export async function uploadIOSLocale({ device, locale, dir, dryRun = false, log = () => {} }) {
  const deviceType = IOS_DEVICE_TYPE[device];
  if (!deviceType) throw new Error(`no App Store device type for "${device}"`);

  const ascLocales = IOS_LOCALE_MAP[locale];
  if (!ascLocales?.length) return { skipped: true, reason: 'no App Store locale' };

  const version = await iosVersion();
  const uploaded = [];
  const errors = [];

  for (const ascLocale of ascLocales) {
    try {
      const { id, created, wouldCreate } = await iosLocalizationId(version.id, ascLocale, { create: !dryRun });
      if (created) log(`  created localization ${ascLocale}`);
      if (wouldCreate) {
        log(`  would create localization ${ascLocale}, and upload into it`);
        uploaded.push(ascLocale);
        continue;
      }

      const res = await run('asc', [
        'screenshots', 'upload',
        '--version-localization', id,
        '--path', dir,
        '--device-type', deviceType,
        '--replace',
        '--max-screenshots', String(IOS_MAX_SCREENSHOTS),
        // asc refuses a real --replace without --confirm (the deletions are the
        // point of it), while a dry run previews them without one. Leaving it
        // off failed every locale before a single file was sent.
        ...(dryRun ? ['--dry-run'] : ['--confirm']),
      ]);
      if (!res.ok) throw new Error(briefError(res));
      uploaded.push(ascLocale);
    } catch (err) {
      errors.push(`${ascLocale}: ${err.message}`);
    }
  }

  return { uploaded, errors, version: version.versionString };
}

/**
 * Write one locale's listing text to App Store Connect.
 *
 * Three calls rather than one, and the split matters: a single PATCH carrying
 * every field fails whole. "What's New" is the field most likely to be refused
 * — it does not exist on a first release — and bundling it meant one rejected
 * attribute took the description and the keywords down with it.
 */
export async function uploadIOSDescription({ locale, copy, dryRun = false, log = () => {} }) {
  const ascLocales = IOS_LOCALE_MAP[locale];
  if (!ascLocales?.length) return { skipped: true };

  const version = await iosVersion();
  const updated = [];
  const errors = [];
  const notes = [];

  for (const ascLocale of ascLocales) {
    try {
      const { wouldCreate } = await iosLocalizationId(version.id, ascLocale, { create: !dryRun });
      if (dryRun) {
        log(`  would write ${ascLocale}${wouldCreate ? ' (creating it first)' : ''}`);
        updated.push(ascLocale);
        continue;
      }

      let wrote = false;

      // 1. Version fields that are editable whenever the version is.
      const versionArgs = ['localizations', 'update', '--version', version.id, '--locale', ascLocale];
      if (copy.description)  versionArgs.push('--description', copy.description);
      if (copy.keywords)     versionArgs.push('--keywords', copy.keywords);
      if (copy.supportUrl)   versionArgs.push('--support-url', copy.supportUrl);
      if (copy.marketingUrl) versionArgs.push('--marketing-url', copy.marketingUrl);

      if (versionArgs.length > 6) {
        const res = await run('asc', versionArgs);
        if (!res.ok) throw new Error(briefError(res));
        wrote = true;
      }

      // 2. What's New, alone, and only when the version can carry one.
      if (copy.whatsNew) {
        if (version.isFirstRelease) {
          notes.push(`version ${version.versionString} is a first release, so it has no What's New field`);
        } else {
          const res = await run('asc', [
            'localizations', 'update', '--version', version.id,
            '--locale', ascLocale, '--whats-new', copy.whatsNew,
          ]);
          if (res.ok) wrote = true;
          else notes.push(`${ascLocale} What's New: ${briefError(res)}`);
        }
      }

      // 3. App-info fields: the name and subtitle, which outlive the version.
      const infoArgs = ['localizations', 'update', '--type', 'app-info', '--locale', ascLocale];
      if (copy.name)              infoArgs.push('--name', copy.name);
      if (copy.subtitle)          infoArgs.push('--subtitle', copy.subtitle);
      if (copy.privacyPolicyUrl)  infoArgs.push('--privacy-policy-url', copy.privacyPolicyUrl);
      if (copy.privacyChoicesUrl) infoArgs.push('--privacy-choices-url', copy.privacyChoicesUrl);
      if (copy.privacyPolicyText) infoArgs.push('--privacy-policy-text', copy.privacyPolicyText);

      // 6 is the base call with no fields on it. Sending that asks asc to
      // update nothing, and it rightly refuses.
      if (infoArgs.length > 6) {
        const res = await run('asc', infoArgs);
        // An app-info localization can legitimately not exist for a locale the
        // app is not sold in. That is not a reason to fail the whole locale.
        if (res.ok) wrote = true;
        else notes.push(`app-info ${ascLocale}: ${briefError(res)}`);
      }

      if (wrote) updated.push(ascLocale);
    } catch (err) {
      errors.push(`${ascLocale}: ${err.message}`);
    }
  }

  return { updated, errors, notes, version: version.versionString, isFirstRelease: version.isFirstRelease };
}

// ── Android ──────────────────────────────────────────────────────────────────

/** Open a Play edit. Everything in one run goes into it, and it commits once. */
export async function androidEditCreate() {
  const pkg = process.env.ANDROID_PACKAGE_NAME;
  const res = await runJson('gplay', ['edits', 'create', '--package', pkg]);
  const id = res.json?.id;
  if (!id) throw new Error(`gplay edits create failed: ${briefError(res)}`);
  return id;
}

export async function androidEditCommit(editId) {
  const pkg = process.env.ANDROID_PACKAGE_NAME;
  const res = await run('gplay', ['edits', 'commit', '--package', pkg, '--edit', editId]);
  if (!res.ok) throw new Error(`gplay edits commit failed: ${briefError(res)}`);
}

/** Discard an edit. Nothing an uncommitted edit contains ever reached the store. */
export async function androidEditDelete(editId) {
  const pkg = process.env.ANDROID_PACKAGE_NAME;
  await run('gplay', ['edits', 'delete', '--package', pkg, '--edit', editId, '--confirm']);
}

/**
 * Upload one locale's images into an open edit, clearing the existing set
 * first so a re-run replaces rather than appends.
 *
 * There is no dry run here because `gplay images` has none. The edit is the
 * safety net instead: nothing an uncommitted edit contains reaches the store,
 * so a caller that wants a rehearsal opens an edit, uploads, and deletes it.
 */
export async function uploadAndroidLocale({ device, locale, dir, editId, log = () => {} }) {
  const pkg = process.env.ANDROID_PACKAGE_NAME;
  const imageTypes = ANDROID_IMAGE_TYPES[device];
  if (!imageTypes?.length) throw new Error(`no Play image type for "${device}"`);

  const playLocales = ANDROID_LOCALE_MAP[locale];
  if (!playLocales?.length) return { skipped: true, reason: 'no Play locale' };

  const cap = ANDROID_MAX_IMAGES[device] ?? ANDROID_MAX_SCREENSHOTS;
  const found = sortedPngs(dir);
  const send = found.slice(0, cap);
  const dropped = found.slice(cap);
  if (dropped.length) log(`  over Play's limit of ${cap} per gallery, skipping: ${dropped.join(', ')}`);

  const uploaded = [];
  const errors = [];

  for (const playLocale of playLocales) {
    try {
      // Each gallery is cleared and rewritten on its own, so a re-run replaces
      // rather than appends, and the cap applies per gallery rather than
      // across them.
      for (const imageType of imageTypes) {
        // A locale with no listing yet has nothing to clear, and says so.
        await run('gplay', [
          'images', 'delete-all', '--package', pkg, '--edit', editId,
          '--locale', playLocale, '--type', imageType, '--confirm',
        ]);

        for (const filename of send) {
          const res = await run('gplay', [
            'images', 'upload', '--package', pkg, '--edit', editId,
            '--locale', playLocale, '--type', imageType,
            '--file', path.join(dir, filename),
          ]);
          if (!res.ok) throw new Error(`${imageType} ${filename}: ${briefError(res)}`);
        }
      }
      uploaded.push(playLocale);
    } catch (err) {
      errors.push(`${playLocale}: ${err.message}`);
    }
  }

  return { uploaded, errors, count: send.length, galleries: imageTypes, dropped };
}

// ── Android: the listing icon ────────────────────────────────────────────────

/**
 * Every locale Play holds a listing for, read from inside an open edit.
 *
 * A wider set than ANDROID_LOCALE_MAP, and deliberately read from Play rather
 * than from the map: a locale opened once in Play Console is a listing this
 * tool has never written to, and for the icon that gap is the whole problem.
 * A listing the icon skips keeps whatever artwork it was last given, forever.
 *
 * Reads through the caller's edit, and the `--edit` is the load-bearing part:
 * Play keeps a single edit per app, so a read that opens one of its own
 * invalidates the caller's, and every later call against it fails with "This
 * Edit has been deleted". `gplay listings locales` would answer this too, and
 * takes an `--edit` for the same reason — what must not happen is either of
 * them being called without one.
 *
 * An app with no listings at all is not an error here, just an empty answer;
 * the caller decides that there is nothing to write to.
 */
export async function androidListingLocales(editId) {
  const pkg = process.env.ANDROID_PACKAGE_NAME;
  const res = await runJson('gplay', ['listings', 'list', '--package', pkg, '--edit', editId]);
  if (!res.json) throw new Error(`gplay listings list failed: ${briefError(res)}`);
  return (res.json.listings ?? []).map(l => l.language).filter(Boolean);
}

/** The repo's Play icon, as an absolute path. */
export function androidIconPath(root = process.cwd()) {
  return path.join(root, ANDROID_ICON_FILE);
}

/**
 * Put the app icon on one Play listing, inside an open edit.
 *
 * Play's icon is a listing asset, not something read out of the bundle: the
 * launcher icon in the AAB never becomes the store icon, and each locale keeps
 * its own. Change the artwork in Play Console and only the default listing
 * moves; every other locale still serves whatever it was given last. So this
 * is written per locale, over every locale Play knows about.
 *
 * `delete-all` first, because `icon` is a single slot and clearing it is the
 * only way to be sure what is left is what was just sent.
 *
 * @param {{ playLocale: string, file: string, editId: string }} args
 */
export async function uploadAndroidIcon({ playLocale, file, editId }) {
  const pkg = process.env.ANDROID_PACKAGE_NAME;
  const [imageType] = ANDROID_IMAGE_TYPES.icon;

  await run('gplay', [
    'images', 'delete-all', '--package', pkg, '--edit', editId,
    '--locale', playLocale, '--type', imageType, '--confirm',
  ]);

  const res = await run('gplay', [
    'images', 'upload', '--package', pkg, '--edit', editId,
    '--locale', playLocale, '--type', imageType, '--file', file,
  ]);
  if (!res.ok) throw new Error(briefError(res));

  return { locale: playLocale };
}

/**
 * Play's release notes, which is where "What's New" lives on this side.
 *
 * Not on the listing: a release note belongs to a RELEASE inside a TRACK, so
 * unlike the App Store there is no single place to put it. This lists the
 * tracks that actually have a release, which is what the caller has to choose
 * between.
 */
export async function androidTracks() {
  const pkg = process.env.ANDROID_PACKAGE_NAME;
  const editId = await androidEditCreate();
  try {
    const res = await runJson('gplay', ['tracks', 'list', '--package', pkg, '--edit', editId]);
    const tracks = res.json?.tracks ?? [];
    return tracks
      .filter(t => (t.releases ?? []).length)
      .map(t => ({
        track: t.track,
        releases: t.releases.map(r => ({
          name: r.name,
          status: r.status,
          versionCodes: r.versionCodes ?? [],
        })),
      }));
  } finally {
    await androidEditDelete(editId);
  }
}

/** Play truncates a release note past this, so it is cut here where it shows. */
export const ANDROID_RELEASE_NOTE_MAX = 500;

/**
 * Set the release note on every release in one track, in every locale.
 *
 * `tracks patch` rather than `update`: the release carries its version codes
 * and rollout state, and a PUT built only from release notes would drop them.
 *
 * @param {Record<string, {whatsNew?: string}>} localizations
 */
export async function uploadAndroidReleaseNotes({ track, localizations, dryRun = false, log = () => {} }) {
  const pkg = process.env.ANDROID_PACKAGE_NAME;

  const releaseNotes = [];
  const byLocale = {};
  for (const [ourLocale, copy] of Object.entries(localizations)) {
    if (!copy.whatsNew) continue;
    for (const playLocale of ANDROID_LOCALE_MAP[ourLocale] ?? []) {
      releaseNotes.push({
        language: playLocale,
        text: copy.whatsNew.slice(0, ANDROID_RELEASE_NOTE_MAX),
      });
      (byLocale[ourLocale] ??= []).push(playLocale);
    }
  }
  if (!releaseNotes.length) return { updated: [], byLocale: {}, errors: ['nothing to write'] };

  const editId = await androidEditCreate();
  let committed = false;
  try {
    const got = await runJson('gplay', ['tracks', 'get', '--package', pkg, '--edit', editId, '--track', track]);
    const releases = got.json?.releases ?? [];
    if (!releases.length) {
      return { updated: [], byLocale: {}, errors: [`track "${track}" has no release to write notes on`] };
    }

    const patched = releases.map(r => ({ ...r, releaseNotes }));
    log(`${track}: ${releases.length} release(s), ${releaseNotes.length} locales`);

    const res = await run('gplay', [
      'tracks', 'patch', '--package', pkg, '--edit', editId,
      '--track', track, '--releases', JSON.stringify(patched),
    ]);
    if (!res.ok) return { updated: [], byLocale: {}, errors: [briefError(res)] };

    if (dryRun) {
      log('dry run, edit discarded');
      return { updated: releaseNotes.map(n => n.language), byLocale, errors: [] };
    }

    await androidEditCommit(editId);
    committed = true;
    return { updated: releaseNotes.map(n => n.language), byLocale, errors: [] };
  } finally {
    // Anything that did not commit — a dry run, a failed patch, a throw — is
    // discarded here, and an uncommitted edit never reached the store.
    if (!committed) await androidEditDelete(editId);
  }
}

/**
 * The locale Play treats as this app's default. It is the one listing Play
 * will not let go untitled, so it is also the one worth borrowing from.
 */
export async function androidDefaultLanguage() {
  const pkg = process.env.ANDROID_PACKAGE_NAME;
  let editId;
  try {
    editId = await androidEditCreate();
  } catch {
    return null;
  }
  try {
    const res = await runJson('gplay', ['details', 'get', '--package', pkg, '--edit', editId]);
    return res.json?.defaultLanguage ?? null;
  } finally {
    await androidEditDelete(editId);
  }
}

/**
 * The listing Play holds right now, read as the same Fastlane-shaped files
 * `push` writes, keyed by Play locale. Null if it could not be read at all,
 * which is different from an app that genuinely has no listings.
 *
 * @returns {Promise<Record<string, {title?: string, shortDescription?: string, videoUrl?: string}> | null>}
 */
async function androidCurrentListings(dir) {
  const pkg = process.env.ANDROID_PACKAGE_NAME;

  fs.rmSync(dir, { recursive: true, force: true });
  const res = await run('gplay', ['metadata', 'pull', '--package', pkg, '--dir', dir]);
  if (!res.ok) return null;
  if (!fs.existsSync(dir)) return {};

  const read = (locale, file) => {
    const p = path.join(dir, locale, file);
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : undefined;
  };

  /** @type {Record<string, {title?: string, shortDescription?: string, videoUrl?: string}>} */
  const listings = {};
  for (const locale of fs.readdirSync(dir)) {
    if (!fs.statSync(path.join(dir, locale)).isDirectory()) continue;
    listings[locale] = {
      title: read(locale, 'title.txt'),
      shortDescription: read(locale, 'short_description.txt'),
      videoUrl: read(locale, 'video_url.txt'),
    };
  }
  return listings;
}

/**
 * Write listing text for every locale as the Fastlane-shaped files `gplay`
 * reads, then push them. `gplay metadata push` opens its own edit and commits
 * it, so this does not share the screenshot edit — a listing and its images
 * are independent writes on Play.
 *
 * A push sends the whole listing and Play replaces the whole listing with what
 * it is sent, so a directory holding nothing but `full_description.txt` blanks
 * the title and the short description. Play refuses that outright for the
 * default language — "this app doesn't have a title set for the default
 * language" — and would quietly accept it for every other locale, which is the
 * worse half. This tool only owns the description, so the rest of each listing
 * is read back from Play first and written out unchanged.
 *
 * @param {Record<string, {name?: string, subtitle?: string, description?: string}>} localizations
 */
export async function uploadAndroidDescriptions({ root, localizations, dryRun = false, log = () => {} }) {
  const pkg = process.env.ANDROID_PACKAGE_NAME;

  const current = await androidCurrentListings(`${root}-current`);
  if (!current) {
    return {
      updated: [], byLocale: {},
      errors: ['could not read the current listings, and pushing without them would blank every title'],
    };
  }

  // A locale Play has never seen has no title to keep, so it inherits the
  // default language's rather than going up empty.
  const fallback = current[await androidDefaultLanguage()] ?? {};

  fs.rmSync(root, { recursive: true, force: true });
  const written = [];
  const errors = [];
  /** @type {Record<string, string[]>} */
  const byLocale = {};

  for (const [ourLocale, copy] of Object.entries(localizations)) {
    for (const playLocale of ANDROID_LOCALE_MAP[ourLocale] ?? []) {
      const live = current[playLocale] ?? {};
      const title = copy.name ?? live.title ?? fallback.title;
      const shortDescription = copy.subtitle ?? live.shortDescription ?? fallback.shortDescription;

      // Play rejects a listing with no title, so a locale that has none to
      // write and none to keep is dropped rather than failing the whole push.
      if (!title) { errors.push(`${playLocale}: no title to write and none on Play to keep`); continue; }

      const dir = path.join(root, playLocale);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'title.txt'), title);
      if (shortDescription) fs.writeFileSync(path.join(dir, 'short_description.txt'), shortDescription);
      if (copy.description)  fs.writeFileSync(path.join(dir, 'full_description.txt'), copy.description);
      if (live.videoUrl)     fs.writeFileSync(path.join(dir, 'video_url.txt'), live.videoUrl);

      written.push(playLocale);
      (byLocale[ourLocale] ??= []).push(playLocale);
    }
  }

  if (!written.length) return { updated: [], byLocale: {}, errors };
  log(`Pushing ${written.length} listings`);

  // One edit, opened and committed by gplay itself, so either every listing
  // lands or none does.
  const res = await run('gplay', [
    'metadata', 'push', '--package', pkg, '--dir', root,
    ...(dryRun ? ['--dry-run'] : ['--confirm']),
  ]);
  if (!res.ok) return { updated: [], byLocale: {}, errors: [...errors, briefError(res)] };

  return { updated: written, byLocale, errors };
}

export {
  IOS_LOCALE_MAP, ANDROID_LOCALE_MAP, IOS_DEVICE_TYPE, ANDROID_IMAGE_TYPES,
  ANDROID_ICON_FILE,
};
