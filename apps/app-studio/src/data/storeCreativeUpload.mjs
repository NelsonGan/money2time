/** Shared Asset Library uploads for Header images and animated Search videos. */
import { run, iosVersion, iosLocalizationId } from './storeUpload.mjs';
import { IOS_LOCALE_MAP } from './storeLocales.mjs';
import sharp from 'sharp';
import { validateCreativeImage } from './creativeImage.mjs';
import { validateVideoBytes, validateCreativeVideo, SEARCH_VIDEO } from './creativeVideo.mjs';
import { createHash, randomUUID } from 'node:crypto';

export const CREATIVE_UPLOAD_SPECS = Object.freeze({
  header: { width: 3840, height: 1646, placementType: 'PRODUCT_PAGE_HEADER_ASSET' },
  search: { width: 3840, height: 2560, placementType: 'APP_STORE_SEARCH_RESULTS_ASSET' },
});
const API_ORIGIN = 'https://api.appstoreconnect.apple.com';
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const EDITABLE_STATES = new Set(['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED']);
const READY_STATES = new Set(['COMPLETE', 'PREPARE_FOR_SUBMISSION', 'READY_FOR_REVIEW', 'ACCEPTED', 'APPROVED']);
// A development hot reload must not orphan a job or release its field lock.
const locks = globalThis.__money2timeCreativeLocks ??= new Map();
// Keep the uploaded asset available to subsequent polls and retries. Never
// repeat its reservation just because Apple's processing outlasts a request.
const creativeJobs = globalThis.__money2timeCreativeJobs ??= new Map();
const JOB_TTL_MS = 60 * 60_000;
const MAX_JOBS = 128;
let tokenPromise;
let tokenExpiresAt = 0;

/** Keep the CLI's keychain credentials and signed token on the server. */
async function token() {
  if (!tokenPromise || Date.now() >= tokenExpiresAt) {
    tokenExpiresAt = Date.now() + 5 * 60_000;
    tokenPromise = run('asc', ['auth', 'token', '--confirm']).then(result => {
      if (!result.ok || !result.stdout.trim()) throw new Error('Could not authorize App Store uploads. Check your App Store credentials.');
      return result.stdout.trim();
    }).catch(error => { tokenPromise = undefined; throw error; });
  }
  return tokenPromise;
}

async function ascRequest(path, { method = 'GET', body } = {}) {
  const url = new URL(path, API_ORIGIN);
  if (url.origin !== API_ORIGIN || !url.pathname.startsWith('/v1/')) throw new Error('Unexpected App Store API URL.');
  const response = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(45_000),
    redirect: 'error',
  });
  if (response.status === 204) return {};
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) { tokenPromise = undefined; tokenExpiresAt = 0; }
    throw Object.assign(new Error(result.errors?.map(e => e.detail || e.title).join('; ') || `App Store request failed (${response.status}).`), { status: response.status });
  }
  return result;
}

/** Validate before opening a reservation or changing any remote fields. */
export function validateCreativeUpload(input = {}) {
  if (!Object.hasOwn(CREATIVE_UPLOAD_SPECS, input.placement)) throw new Error('Choose Header or Search Results.');
  return input.placement === 'search' ? validateVideoBytes(input) : validateCreativeImage(input);
}

/** Apple's Asset Library currently rejects JPEG creatives; send an opaque RGB PNG. */
export async function prepareCreativeImage(bytes) {
  const image = await sharp(bytes, { limitInputPixels: 3840 * 2560, failOn: 'warning' })
    .removeAlpha().toColourspace('srgb').png().toBuffer();
  if (image.length > MAX_IMAGE_BYTES) throw new Error('The upload image exceeds 10 MB. Reduce image detail and try again.');
  return image;
}

async function allPages(request, path) {
  const data = [];
  do {
    const result = await request(path);
    if (!Array.isArray(result.data)) throw new Error('App Store returned an invalid asset list.');
    data.push(...result.data);
    path = result.links?.next;
  } while (path);
  return data;
}

async function requireEditableVersion(request, id) {
  const { data } = await request(`/v1/appStoreVersions/${id}`);
  if (data?.attributes?.platform !== 'IOS' || !EDITABLE_STATES.has(data.attributes.appStoreState ?? data.attributes.appVersionState)) {
    throw new Error('The app version is no longer editable. Choose an editable version in App Store Connect.');
  }
}

async function exclusively(key, task) {
  const previous = locks.get(key) ?? Promise.resolve();
  let release;
  const next = new Promise(resolve => { release = resolve; });
  locks.set(key, next);
  await previous;
  try { return await task(); }
  finally { release(); if (locks.get(key) === next) locks.delete(key); }
}

/** Upload the exact byte ranges Apple reserves, without forwarding the ASC token. */
async function transferAsset(operations, bytes, fetchBinary) {
  if (!Array.isArray(operations) || !operations.length) throw new Error('App Store did not reserve an asset upload.');
  const sorted = [...operations].sort((a, b) => a.offset - b.offset);
  let covered = 0;
  for (const operation of sorted) {
    if (!Number.isInteger(operation.offset) || !Number.isInteger(operation.length) || operation.offset !== covered || operation.length <= 0 || operation.offset + operation.length > bytes.length) {
      throw new Error('App Store returned invalid asset upload ranges.');
    }
    const url = new URL(operation.url);
    if (url.protocol !== 'https:' || url.username || url.password || operation.method !== 'PUT') throw new Error('App Store returned an invalid asset upload destination.');
    covered += operation.length;
  }
  if (covered !== bytes.length) throw new Error('App Store did not reserve the complete asset.');
  for (const operation of sorted) {
    const response = await fetchBinary(operation.url, {
      method: operation.method,
      headers: Object.fromEntries((operation.requestHeaders ?? []).map(h => [h.name, h.value])),
      body: bytes.subarray(operation.offset, operation.offset + operation.length),
      signal: AbortSignal.timeout(60_000),
      redirect: 'error',
    });
    if (!response.ok) throw new Error(`Asset transfer failed (${response.status}). Existing creatives were kept.`);
  }
}

async function waitForAsset(request, job, wait, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  do {
    const { data } = await request(`/v1/${job.mediaType}/${job.assetId}`);
    const attributes = data?.attributes ?? {};
    const state = attributes.state;
    const ready = job.mediaType === 'appAssetLibraryVideos'
      ? typeof attributes.videoAsset === 'string' && /^https?:\/\//.test(attributes.videoAsset) && attributes.specId
      : attributes.imageAsset?.width && attributes.imageAsset?.height;
    if (READY_STATES.has(state) && ready) return data;
    if (!READY_STATES.has(state) && !['AWAITING_UPLOAD', 'UPLOAD_COMPLETE', 'PROCESSING'].includes(state)) {
      const details = attributes.stateDetails?.map(d => d.description || d.code).filter(Boolean).join('; ');
      throw Object.assign(new Error(`App Store could not process the creative (${state ?? 'unknown state'}${details ? `: ${details}` : ''}). Existing creatives were kept.`), { unusableAsset: true });
    }
    if (Date.now() >= deadline) break;
    await wait(1500);
  } while (Date.now() < deadline);
  return null;
}

function placementBody(localizationId, placementType, media, placementGroup) {
  return { data: {
    type: 'appAssetLibraryPlacements',
    attributes: { placementType, ...(placementGroup ? { placementGroup } : {}) },
    relationships: {
      appStoreVersionLocalization: { data: { type: 'appStoreVersionLocalizations', id: localizationId } },
      [media.type === 'appAssetLibraryImages' ? 'image' : 'video']: { data: media },
    },
  } };
}

async function replacePlacement(request, localizationId, placementType, media) {
  return exclusively(`${localizationId}:${placementType}`, async () => {
    const readCurrent = async () => (await allPages(request, `/v1/appStoreVersionLocalizations/${localizationId}/placements?include=image,video&limit=200`))
      .filter(p => p.attributes?.placementType === placementType && p.attributes.state === 'ACTIVE');
    const current = await readCurrent();
    if (current.length === 1 && current[0].relationships?.[media.type === 'appAssetLibraryImages' ? 'image' : 'video']?.data?.id === media.id) return;
    // Keep enough information to recover either an image or a video.
    const previous = current.map(p => {
      const media = p.relationships?.image?.data ?? p.relationships?.video?.data;
      if (!media) throw new Error('Could not read the existing creative. It was kept.');
      return { id: p.id, media, body: placementBody(localizationId, placementType, media, p.attributes.placementGroup) };
    });
    try {
      for (const old of previous) {
        await request(`/v1/appAssetLibraryPlacements/${old.id}`, { method: 'DELETE' });
      }
      await request('/v1/appAssetLibraryPlacements', {
        method: 'POST',
        body: placementBody(localizationId, placementType, media),
      });
    } catch (error) {
      // A failed response does not tell us whether Apple committed the write.
      // Reconcile with the actual field before declaring failure or restoring.
      let actual;
      try { actual = await readCurrent(); }
      catch {
        throw new Error(`${error.message} Could not verify the current creative. Check this field in App Store Connect before retrying.`);
      }
      if (actual.length === 1 && actual[0].relationships?.[media.type === 'appAssetLibraryImages' ? 'image' : 'video']?.data?.id === media.id) return;
      const sameMedia = (p, old) => {
        const media = p.relationships?.image?.data ?? p.relationships?.video?.data;
        return media?.type === old.media.type && media?.id === old.media.id
          && (p.attributes.placementGroup || undefined) === old.body.data.attributes.placementGroup;
      };
      // Preserve a creative installed concurrently outside this Studio.
      if (actual.some(p => !previous.some(old => sameMedia(p, old)))) {
        throw new Error(`${error.message} The field changed during upload. Its current creative was kept; check App Store Connect.`);
      }
      const missing = previous.filter(old => !actual.some(p => sameMedia(p, old)));
      const recoveryErrors = [];
      for (const old of missing) {
        try { await request('/v1/appAssetLibraryPlacements', { method: 'POST', body: old.body }); }
        catch {
          // The restore itself can also succeed with a lost response.
          try { if (!(await readCurrent()).some(p => sameMedia(p, old))) recoveryErrors.push(old.id); }
          catch { recoveryErrors.push(old.id); }
        }
      }
      if (recoveryErrors.length) throw new Error(`${error.message} Could not restore the previous creative. Restore it from Asset Library in App Store Connect.`);
      throw new Error(`${error.message}${missing.length ? ' The previous creative was restored.' : ' Existing creatives were kept.'}`);
    }
  });
}

function uploadOptions({
  request: requestOnce = ascRequest,
  fetchBinary = fetch,
  appId = process.env.ASC_APP_ID,
  version = () => iosVersion({ refresh: true }),
  localization = iosLocalizationId,
  wait = ms => new Promise(resolve => setTimeout(resolve, ms)),
  processingTimeoutMs = 90_000,
  prepareImage = prepareCreativeImage,
  prepareVideo = validateCreativeVideo,
  jobs = creativeJobs,
} = {}) {
  // Retry transient reads only. Retrying a write could duplicate assets or placements.
  const request = async (path, init = {}) => {
    for (let attempt = 0; ; attempt++) {
      try { return await requestOnce(path, init); }
      catch (error) {
        if ((init.method ?? 'GET') !== 'GET' || attempt >= 2 || ![429, 500, 502, 503, 504].includes(error.status)) throw error;
        await wait(500 * 2 ** attempt);
      }
    }
  };
  return { request, fetchBinary, appId, version, localization, wait, processingTimeoutMs, prepareImage, prepareVideo, jobs };
}

function pruneJobs(jobs) {
  for (const [id, job] of jobs) if (job.expiresAt < Date.now() && !locks.has(`creative:${job.key}`)) jobs.delete(id);
}

export function validateCreativeResume({ resumeToken } = {}) {
  if (typeof resumeToken !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(resumeToken)) {
    throw new Error('Provide a valid creative upload reference.');
  }
}

async function finishCreativeJob(job, { request, localization, wait, processingTimeoutMs, jobs }) {
  job.expiresAt = Date.now() + JOB_TTL_MS;
  try {
    const asset = await waitForAsset(request, job, wait, processingTimeoutMs);
    const result = { uploaded: [], errors: [], version: job.version.versionString, count: 0, assetId: job.assetId, resumeToken: job.id };
    if (!asset) return { ...result, pending: true };
    const spec = CREATIVE_UPLOAD_SPECS[job.placement];
    const dimensions = job.mediaType === 'appAssetLibraryVideos'
      ? asset.attributes.previewFrameImage?.image : asset.attributes.imageAsset;
    const expected = job.mediaType === 'appAssetLibraryVideos' ? SEARCH_VIDEO : spec;
    if (dimensions && (dimensions.width !== expected.width || dimensions.height !== expected.height)) {
      throw Object.assign(new Error('App Store processed an unexpected creative size. Existing creatives were kept.'), { unusableAsset: true });
    }
    // Always target the original version, even if a later draft is now selected.
    await requireEditableVersion(request, job.version.id);
    for (const ascLocale of IOS_LOCALE_MAP[job.locale]) {
      try {
        const { id } = await localization(job.version.id, ascLocale);
        if (!id) throw new Error('Could not find the App Store language.');
        await replacePlacement(request, id, spec.placementType, { type: job.mediaType, id: job.assetId });
        result.uploaded.push(ascLocale);
      } catch (error) { result.errors.push(`${ascLocale}: ${error.message}`); }
    }
    return { ...result, count: result.uploaded.length };
  } catch (error) {
    if (error.unusableAsset) { jobs.delete(job.id); throw error; }
    // A read or placement failure still leaves the uploaded asset resumable.
    throw Object.assign(error, { resumeToken: job.id });
  }
}

/** Continue processing the same creative without creating another reservation. */
export async function resumeIOSCreative(input, options) {
  validateCreativeResume(input);
  const opts = uploadOptions(options);
  pruneJobs(opts.jobs);
  const job = opts.jobs.get(input.resumeToken);
  if (!job || job.appId !== opts.appId) throw new Error('This upload reference has expired or the Studio restarted. Check the creative in App Store Connect Asset Library before uploading again.');
  return exclusively(`creative:${job.key}`, async () => {
    await requireEditableVersion(opts.request, job.version.id);
    return finishCreativeJob(job, opts);
  });
}

/** One Studio language shares one library asset across its App Store variants. */
export async function uploadIOSCreative(input, options) {
  const opts = uploadOptions(options);
  const { request, fetchBinary, appId, version, prepareImage, prepareVideo, jobs } = opts;
  const source = validateCreativeUpload(input);
  const { placement, locale } = input;
  const locales = IOS_LOCALE_MAP[locale];
  if (!locales?.length) return { skipped: true, reason: 'Filipino has no App Store localization', uploaded: [], errors: [] };
  if (!appId) throw new Error('App Store app is not configured.');
  const isVideo = placement === 'search';
  const bytes = isVideo ? (await prepareVideo(input)).bytes : await prepareImage(source);
  const mediaType = isVideo ? 'appAssetLibraryVideos' : 'appAssetLibraryImages';
  const selectedVersion = await version();
  await requireEditableVersion(request, selectedVersion.id);
  const key = JSON.stringify([appId, selectedVersion.id, placement, locale, createHash('sha256').update(bytes).digest('hex')]);
  return exclusively(`creative:${key}`, async () => {
    pruneJobs(jobs);
    const existing = [...jobs.values()].find(job => job.key === key);
    if (existing) return finishCreativeJob(existing, opts);
    if (jobs.size >= MAX_JOBS) throw new Error('Too many recent creative uploads. Wait for existing uploads to finish before trying again.');
    const { data: library } = await request(`/v1/apps/${appId}/assetLibrary`);
    if (!library?.id || library.type !== 'appAssetLibraries') throw new Error('Asset Library is not available for this app.');
    const filename = `money2time-${placement}-${locale}.${isVideo ? 'mp4' : 'png'}`;
    const { data: reservation } = await request(`/v1/${mediaType}`, {
      method: 'POST',
      body: { data: {
        type: mediaType,
        attributes: { category: 'CREATIVE_ASSETS', fileName: filename, fileSize: bytes.length },
        relationships: { assetLibrary: { data: { type: 'appAssetLibraries', id: library.id } } },
      } },
    });
    if (!reservation?.id) throw new Error('App Store did not create an asset reservation.');
    // No placement is touched until transfer and processing both succeed.
    await transferAsset(reservation.attributes?.uploadOperations, bytes, fetchBinary);
    await request(`/v1/${mediaType}/${reservation.id}`, {
      method: 'PATCH', body: { data: { type: mediaType, id: reservation.id, attributes: { uploaded: true } } },
    });
    const job = { id: randomUUID(), key, appId, version: selectedVersion, placement, locale, mediaType, assetId: reservation.id, expiresAt: Date.now() + JOB_TTL_MS };
    jobs.set(job.id, job);
    return finishCreativeJob(job, opts);
  });
}
