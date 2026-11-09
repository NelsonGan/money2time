import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { CREATIVE_UPLOAD_SPECS, prepareCreativeImage, resumeIOSCreative, uploadIOSCreative, validateCreativeResume, validateCreativeUpload } from '../src/data/storeCreativeUpload.mjs';

function jpeg(placement = 'header', components = 3) {
  const { width, height } = CREATIVE_UPLOAD_SPECS[placement];
  const bytes = Buffer.alloc(23);
  bytes.writeUInt16BE(0xffd8, 0);
  bytes.writeUInt16BE(0xffc0, 2);
  bytes.writeUInt16BE(17, 4);
  bytes[6] = 8;
  bytes.writeUInt16BE(height, 7);
  bytes.writeUInt16BE(width, 9);
  bytes[11] = components;
  bytes.writeUInt16BE(0xffd9, 21);
  return bytes;
}

function setup({ placement = 'header', existing = [], transferStatus = 200, states = ['PREPARE_FOR_SUBMISSION'], failLocale, failRecovery = false, editable = true } = {}) {
  const bytes = jpeg(placement);
  const calls = [];
  const transfers = [];
  const placements = new Map();
  const currentPlacements = (locale) => {
    if (!placements.has(locale)) placements.set(locale, structuredClone(existing));
    return placements.get(locale);
  };
  let placementIndex = 0;
  let stateIndex = 0;
  const opts = {
    prepareImage: async bytes => bytes,
    jobs: new Map(),
    appId: 'app',
    version: async () => ({ id: 'version', versionString: '2.0' }),
    localization: async (id, locale) => ({ id: locale }),
    wait: async () => {},
    processingTimeoutMs: 20,
    fetchBinary: async (url, init) => { transfers.push({ url, ...init }); return { ok: transferStatus === 200, status: transferStatus }; },
    request: async (path, { method = 'GET', body } = {}) => {
      calls.push({ path, method, body });
      if (path === '/v1/appStoreVersions/version') return { data: { attributes: { platform: 'IOS', appStoreState: editable ? 'PREPARE_FOR_SUBMISSION' : 'WAITING_FOR_REVIEW' } } };
      if (path === '/v1/apps/app/assetLibrary') return { data: { type: 'appAssetLibraries', id: 'library' } };
      if (path === '/v1/appAssetLibraryImages' && method === 'POST') return { data: { id: 'new-image', attributes: {
        uploadOperations: [
          { offset: 0, length: 10, method: 'PUT', url: 'https://uploads.apple.com/first', requestHeaders: [{ name: 'x-part', value: 'first' }] },
          { offset: 10, length: bytes.length - 10, method: 'PUT', url: 'https://uploads.apple.com/second', requestHeaders: [] },
        ],
      } } };
      if (path === '/v1/appAssetLibraryImages/new-image' && method === 'PATCH') return {};
      if (path === '/v1/appAssetLibraryImages/new-image') return { data: { attributes: {
        state: states[Math.min(stateIndex++, states.length - 1)], imageAsset: CREATIVE_UPLOAD_SPECS[placement],
      } } };
      if (path.includes('/placements?')) return { data: structuredClone(currentPlacements(path.split('/')[3])), links: {} };
      if (method === 'DELETE' && path.startsWith('/v1/appAssetLibraryPlacements/')) {
        const id = path.split('/').at(-1);
        for (const [locale, list] of placements) {
          const index = list.findIndex(p => p.id === id);
          if (index >= 0) { list.splice(index, 1); break; }
        }
        return {};
      }
      if (path === '/v1/appAssetLibraryPlacements' && method === 'POST') {
        const locale = body.data.relationships.appStoreVersionLocalization.data.id;
        const isNew = body.data.relationships.image?.data.id === 'new-image';
        if ((locale === failLocale && isNew) || (failRecovery && !isNew)) throw new Error('Placement rejected');
        const created = { ...structuredClone(body.data), id: `placement-${++placementIndex}` };
        created.attributes.state = 'ACTIVE';
        currentPlacements(locale).push(created);
        return { data: created };
      }
      throw new Error(`Unexpected request: ${method} ${path}`);
    },
  };
  return { input: { placement, locale: 'de', data: bytes.toString('base64') }, bytes, opts, calls, transfers, currentPlacements };
}

const oldCreative = (placement = 'header', mediaType = 'image') => ({
  id: 'old-creative',
  attributes: { placementType: CREATIVE_UPLOAD_SPECS[placement].placementType, state: 'ACTIVE', placementGroup: 'OLD_GROUP' },
  relationships: { [mediaType]: { data: { type: mediaType === 'image' ? 'appAssetLibraryImages' : 'appAssetLibraryVideos', id: 'old-media' } } },
});

test('validates format, dimensions, RGB, known language and size before any API request', async () => {
  const { input, opts, calls, bytes } = setup();
  assert.deepEqual(validateCreativeUpload(input), bytes);
  const wrongSize = Buffer.from(bytes); wrongSize.writeUInt16BE(100, 9);
  for (const patch of [
    { placement: '__proto__' }, { placement: 'phone' }, { locale: 'unknown' }, { locale: 'constructor' },
    { data: 'not an image' }, { data: bytes.subarray(0, -1).toString('base64') },
    { data: jpeg('search').toString('base64') }, { data: wrongSize.toString('base64') },
    { data: jpeg('header', 4).toString('base64') }, { data: 'A'.repeat(14 * 1024 * 1024) },
  ]) await assert.rejects(uploadIOSCreative({ ...input, ...patch }, opts));
  assert.equal(calls.length, 0);
});

test('uploads an image in reserved ranges, commits it, waits for processing, then assigns all English variants', async () => {
  const s = setup({ placement: 'header', states: ['UPLOAD_COMPLETE', 'COMPLETE', 'PREPARE_FOR_SUBMISSION'] });
  const result = await uploadIOSCreative({ ...s.input, locale: 'en' }, s.opts);
  assert.deepEqual(result.uploaded, ['en-US', 'en-GB', 'en-AU', 'en-CA']);
  assert.deepEqual(result.errors, []);
  assert.equal(result.version, '2.0');
  const reservation = s.calls.find(c => c.path === '/v1/appAssetLibraryImages');
  assert.deepEqual(reservation.body.data.attributes, { category: 'CREATIVE_ASSETS', fileName: 'money2time-header-en.png', fileSize: s.bytes.length });
  assert.deepEqual(reservation.body.data.relationships.assetLibrary.data, { type: 'appAssetLibraries', id: 'library' });
  assert.deepEqual(Buffer.concat(s.transfers.map(t => t.body)), s.bytes);
  assert.deepEqual(s.transfers[0].headers, { 'x-part': 'first' });
  assert.ok(s.transfers.every(t => !Object.hasOwn(t.headers, 'Authorization')));
  const commit = s.calls.find(c => c.method === 'PATCH');
  assert.deepEqual(commit.body.data.attributes, { uploaded: true });
  const placements = s.calls.filter(c => c.path === '/v1/appAssetLibraryPlacements');
  assert.equal(placements.length, 4);
  assert.ok(placements.every(p => p.body.data.attributes.placementType === 'PRODUCT_PAGE_HEADER_ASSET' && p.body.data.relationships.image.data.id === 'new-image'));
  assert.ok(s.calls.indexOf(commit) < s.calls.indexOf(placements[0]));
});

test('normalizes a real JPEG to an opaque RGB PNG and reserves its encoded byte size', async () => {
  const { width, height } = CREATIVE_UPLOAD_SPECS.header;
  const source = await sharp({ create: { width, height, channels: 3, background: '#FBF2EA' } }).jpeg().toBuffer();
  const png = await prepareCreativeImage(source);
  const metadata = await sharp(png).metadata();
  assert.equal(metadata.format, 'png');
  assert.equal(metadata.hasAlpha, false);
  assert.equal(metadata.channels, 3);
  assert.equal(metadata.width, width);
  assert.equal(metadata.height, height);
  const s = setup({ placement: 'header' });
  const request = s.opts.request;
  s.opts.prepareImage = prepareCreativeImage;
  s.opts.request = async (path, init) => {
    const result = await request(path, init);
    if (path === '/v1/appAssetLibraryImages' && init?.method === 'POST') {
      result.data.attributes.uploadOperations = [{ offset: 0, length: init.body.data.attributes.fileSize, method: 'PUT', url: 'https://uploads.apple.com/image', requestHeaders: [] }];
    }
    return result;
  };
  await uploadIOSCreative({ ...s.input, data: source.toString('base64') }, s.opts);
  const reservation = s.calls.find(c => c.path === '/v1/appAssetLibraryImages');
  assert.equal(reservation.body.data.attributes.fileSize, png.length);
  assert.deepEqual(s.transfers[0].body, png);
});

test('an undecodable JPEG fails locally before reserving an image or changing placements', async () => {
  const s = setup();
  s.opts.prepareImage = prepareCreativeImage;
  await assert.rejects(uploadIOSCreative(s.input, s.opts));
  assert.equal(s.calls.length, 0);
});

test('retries transient Asset Library reads but never repeats reservation writes', async () => {
  const s = setup();
  const request = s.opts.request;
  let reads = 0;
  s.opts.request = async (path, init) => {
    if (path === '/v1/apps/app/assetLibrary' && ++reads < 3) throw Object.assign(new Error('Apple server unavailable'), { status: 500 });
    return request(path, init);
  };
  const result = await uploadIOSCreative(s.input, s.opts);
  assert.equal(reads, 3);
  assert.deepEqual(result.errors, []);
  const failed = setup();
  const failedRequest = failed.opts.request;
  let writes = 0;
  failed.opts.request = async (path, init) => {
    if (path === '/v1/appAssetLibraryImages' && init?.method === 'POST') {
      writes++;
      throw Object.assign(new Error('Apple server unavailable'), { status: 500 });
    }
    return failedRequest(path, init);
  };
  await assert.rejects(uploadIOSCreative(failed.input, failed.opts), /Apple server unavailable/);
  assert.equal(writes, 1);
});

test('failed transfer never commits or modifies existing placements', async () => {
  const s = setup({ existing: [oldCreative()], transferStatus: 500 });
  await assert.rejects(uploadIOSCreative(s.input, s.opts), /transfer failed/);
  assert.ok(s.calls.every(c => c.method !== 'DELETE' && c.method !== 'PATCH' && !c.path.includes('/placements')));
});

test('processing failure preserves every existing creative', async () => {
  const s = setup({ states: ['FAILED'] });
  await assert.rejects(uploadIOSCreative(s.input, s.opts), /Existing creatives were kept/);
  assert.ok(s.calls.every(c => !c.path.includes('/placements')));
});

test('slow processing resumes the original image and version without another transfer or reservation', async () => {
  const states = ['UPLOAD_COMPLETE'];
  const s = setup({ states, existing: [oldCreative()] });
  s.opts.processingTimeoutMs = 0;
  const pending = await uploadIOSCreative(s.input, s.opts);
  assert.equal(pending.pending, true);
  assert.deepEqual(pending.uploaded, []);
  assert.ok(s.calls.every(c => !c.path.includes('/placements')));
  states[0] = 'PREPARE_FOR_SUBMISSION';
  s.opts.version = () => { throw new Error('Must not select a different draft while resuming'); };
  const result = await resumeIOSCreative({ resumeToken: pending.resumeToken }, s.opts);
  assert.deepEqual(result.uploaded, ['de-DE']);
  assert.equal(result.version, '2.0');
  assert.equal(result.assetId, pending.assetId);
  assert.equal(s.calls.filter(c => c.path === '/v1/appAssetLibraryImages').length, 1);
  assert.equal(s.transfers.length, 2);
});

test('retrying identical artwork reuses its image, and repeating a finished upload never rewrites the placement', async () => {
  const states = ['UPLOAD_COMPLETE'];
  const s = setup({ states });
  s.opts.processingTimeoutMs = 0;
  await uploadIOSCreative(s.input, s.opts);
  states[0] = 'PREPARE_FOR_SUBMISSION';
  await uploadIOSCreative(s.input, s.opts);
  await uploadIOSCreative(s.input, s.opts);
  assert.equal(s.calls.filter(c => c.path === '/v1/appAssetLibraryImages').length, 1);
  assert.equal(s.calls.filter(c => c.path === '/v1/appAssetLibraryPlacements' && c.method === 'POST').length, 1);
  assert.equal(s.calls.filter(c => c.method === 'DELETE').length, 0);
});

test('an expired or wrong-app upload reference makes no requests or writes', async () => {
  const s = setup();
  for (const resumeToken of [null, '__proto__', 'not-a-token']) assert.throws(() => validateCreativeResume({ resumeToken }));
  const result = await uploadIOSCreative(s.input, s.opts);
  s.calls.length = 0;
  await assert.rejects(resumeIOSCreative(result, { ...s.opts, appId: 'other-app' }), /expired or.*restarted/);
  s.opts.jobs.get(result.resumeToken).expiresAt = 0;
  await assert.rejects(resumeIOSCreative(result, s.opts), /expired or.*restarted/);
  assert.equal(s.calls.length, 0);
});

test('resuming after the original version enters review preserves all placements', async () => {
  const s = setup({ states: ['UPLOAD_COMPLETE'] });
  s.opts.processingTimeoutMs = 0;
  const pending = await uploadIOSCreative(s.input, s.opts);
  s.opts.request = async () => ({ data: { attributes: { platform: 'IOS', appStoreState: 'WAITING_FOR_REVIEW' } } });
  await assert.rejects(resumeIOSCreative(pending, s.opts), /no longer editable/);
  assert.ok(s.calls.every(c => !c.path.includes('/placements')));
});

test('a development module reload retains the processing reference and reuses its uploaded image', async () => {
  const states = ['UPLOAD_COMPLETE'];
  const s = setup({ states });
  delete s.opts.jobs;
  s.opts.processingTimeoutMs = 0;
  const pending = await uploadIOSCreative(s.input, s.opts);
  const reloaded = await import('../src/data/storeCreativeUpload.mjs?reload-check');
  states[0] = 'PREPARE_FOR_SUBMISSION';
  const result = await reloaded.resumeIOSCreative(pending, s.opts);
  assert.deepEqual(result.uploaded, ['de-DE']);
  assert.equal(s.calls.filter(c => c.path === '/v1/appAssetLibraryImages').length, 1);
});

test('replaces only the selected field, keeping header and screenshot placements', async () => {
  const s = setup({ existing: [oldCreative(), { ...oldCreative('search'), id: 'search' }, {
    id: 'screenshot', attributes: { placementType: 'APP_SCREENSHOT', state: 'ACTIVE' },
  }, { ...oldCreative(), id: 'inactive', attributes: { ...oldCreative().attributes, state: 'INACTIVE' } }] });
  await uploadIOSCreative(s.input, s.opts);
  assert.deepEqual(s.calls.filter(c => c.method === 'DELETE').map(c => c.path), ['/v1/appAssetLibraryPlacements/old-creative']);
  const assigned = s.calls.find(c => c.path === '/v1/appAssetLibraryPlacements');
  assert.equal(assigned.body.data.attributes.placementType, 'PRODUCT_PAGE_HEADER_ASSET');
});

test('a failed replacement restores the original image or video and reports partial locale failures', async () => {
  for (const mediaType of ['image', 'video']) {
    const s = setup({ existing: [oldCreative('header', mediaType)], failLocale: 'zh-Hans' });
    const result = await uploadIOSCreative({ ...s.input, locale: 'zh' }, s.opts);
    assert.deepEqual(result.uploaded, ['zh-Hant']);
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0], /zh-Hans:.*previous creative was restored/);
    const restored = s.calls.find(c => c.body?.data.relationships?.[mediaType]?.data.id === 'old-media');
    assert.ok(restored);
    assert.equal(restored.body.data.attributes.placementGroup, 'OLD_GROUP');
    assert.equal(restored.body.data.relationships.appStoreVersionLocalization.data.id, 'zh-Hans');
  }
});

test('reports a recovery failure explicitly so the previous asset can be restored from Asset Library', async () => {
  const s = setup({ existing: [oldCreative()], failLocale: 'de-DE', failRecovery: true });
  const result = await uploadIOSCreative(s.input, s.opts);
  assert.deepEqual(result.uploaded, []);
  assert.match(result.errors[0], /Restore it from Asset Library/);
});

test('a committed replacement with a lost response is verified as success without restoring the old creative', async () => {
  const s = setup({ existing: [oldCreative()] });
  const request = s.opts.request;
  s.opts.request = async (path, init) => {
    const result = await request(path, init);
    if (path === '/v1/appAssetLibraryPlacements' && init?.method === 'POST') throw new Error('Connection closed after create');
    return result;
  };
  const result = await uploadIOSCreative(s.input, s.opts);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.uploaded, ['de-DE']);
  assert.deepEqual(s.currentPlacements('de-DE').map(p => p.relationships.image.data.id), ['new-image']);
  assert.equal(s.calls.filter(c => c.path === '/v1/appAssetLibraryPlacements' && c.method === 'POST').length, 1);
});

test('a committed deletion with a lost response restores the missing original creative', async () => {
  const s = setup({ existing: [oldCreative()] });
  const request = s.opts.request;
  s.opts.request = async (path, init) => {
    const result = await request(path, init);
    if (init?.method === 'DELETE') throw new Error('Connection closed after delete');
    return result;
  };
  const result = await uploadIOSCreative(s.input, s.opts);
  assert.match(result.errors[0], /previous creative was restored/);
  assert.deepEqual(s.currentPlacements('de-DE').map(p => p.relationships.image.data.id), ['old-media']);
});

test('a rejected deletion preserves its original placement without creating a duplicate', async () => {
  const s = setup({ existing: [oldCreative()] });
  const request = s.opts.request;
  s.opts.request = async (path, init) => {
    if (init?.method === 'DELETE') throw new Error('Delete rejected');
    return request(path, init);
  };
  const result = await uploadIOSCreative(s.input, s.opts);
  assert.match(result.errors[0], /Existing creatives were kept/);
  assert.equal(s.currentPlacements('de-DE').length, 1);
  assert.ok(s.calls.every(c => c.path !== '/v1/appAssetLibraryPlacements'));
});

test('an unverifiable write does not blindly restore or claim success', async () => {
  const s = setup({ existing: [oldCreative()] });
  const request = s.opts.request;
  let uncertain = false;
  s.opts.request = async (path, init) => {
    if (uncertain && path.includes('/placements?')) throw new Error('Cannot read current state');
    const result = await request(path, init);
    if (path === '/v1/appAssetLibraryPlacements' && init?.method === 'POST') {
      uncertain = true;
      throw new Error('Connection closed after create');
    }
    return result;
  };
  const result = await uploadIOSCreative(s.input, s.opts);
  assert.deepEqual(result.uploaded, []);
  assert.match(result.errors[0], /Could not verify the current creative/);
  assert.deepEqual(s.currentPlacements('de-DE').map(p => p.relationships.image.data.id), ['new-image']);
});

test('a lost restore response is verified without falsely reporting a recovery failure', async () => {
  const s = setup({ existing: [oldCreative()], failLocale: 'de-DE' });
  const request = s.opts.request;
  s.opts.request = async (path, init) => {
    const result = await request(path, init);
    if (init?.body?.data.relationships?.image?.data.id === 'old-media') throw new Error('Restore response lost');
    return result;
  };
  const result = await uploadIOSCreative(s.input, s.opts);
  assert.match(result.errors[0], /previous creative was restored/);
  assert.doesNotMatch(result.errors[0], /Could not restore/);
  assert.equal(s.currentPlacements('de-DE').length, 1);
});

test('a creative changed outside Studio during a failed replacement is preserved', async () => {
  const s = setup({ existing: [oldCreative()] });
  const request = s.opts.request;
  s.opts.request = async (path, init) => {
    if (path === '/v1/appAssetLibraryPlacements' && init?.method === 'POST') {
      const external = oldCreative();
      external.id = 'external-placement';
      external.relationships.image.data.id = 'external-image';
      s.currentPlacements('de-DE').push(external);
      throw new Error('Concurrent field change');
    }
    return request(path, init);
  };
  const result = await uploadIOSCreative(s.input, s.opts);
  assert.match(result.errors[0], /current creative was kept/);
  assert.deepEqual(s.currentPlacements('de-DE').map(p => p.relationships.image.data.id), ['external-image']);
});

test('a terminal processing failure does not trap subsequent retries on the failed image', async () => {
  const states = ['FAILED'];
  const s = setup({ states });
  await assert.rejects(uploadIOSCreative(s.input, s.opts), /could not process/);
  states[0] = 'PREPARE_FOR_SUBMISSION';
  const result = await uploadIOSCreative(s.input, s.opts);
  assert.deepEqual(result.errors, []);
  assert.equal(s.calls.filter(c => c.path === '/v1/appAssetLibraryImages').length, 2);
});

test('retrying a partial regional upload only replaces the failed region', async () => {
  const s = setup({ existing: [oldCreative()] });
  const request = s.opts.request;
  let failing = true;
  s.opts.request = async (path, init) => {
    if (failing && path === '/v1/appAssetLibraryPlacements'
      && init?.body.data.relationships.appStoreVersionLocalization.data.id === 'zh-Hans'
      && init.body.data.relationships.image?.data.id === 'new-image') throw new Error('Temporary rejection');
    return request(path, init);
  };
  const first = await uploadIOSCreative({ ...s.input, locale: 'zh' }, s.opts);
  assert.deepEqual(first.uploaded, ['zh-Hant']);
  failing = false;
  s.calls.length = 0;
  const second = await resumeIOSCreative(first, s.opts);
  assert.deepEqual(second.uploaded, ['zh-Hans', 'zh-Hant']);
  assert.deepEqual(second.errors, []);
  const creates = s.calls.filter(c => c.path === '/v1/appAssetLibraryPlacements' && c.method === 'POST');
  assert.equal(creates.length, 1);
  assert.equal(creates[0].body.data.relationships.appStoreVersionLocalization.data.id, 'zh-Hans');
  assert.ok(s.calls.every(c => c.path !== '/v1/appAssetLibraryImages'));
});

test('stale version state and an unsupported App Store language make no writes', async () => {
  const stale = setup({ editable: false });
  await assert.rejects(uploadIOSCreative(stale.input, stale.opts), /no longer editable/);
  assert.ok(stale.calls.every(c => c.method === 'GET'));
  const unsupported = setup();
  const result = await uploadIOSCreative({ ...unsupported.input, locale: 'fil' }, unsupported.opts);
  assert.equal(result.skipped, true);
  assert.match(result.reason, /Filipino/);
  assert.equal(unsupported.calls.length, 0);
});

test('reads every placement page before replacing an existing creative', async () => {
  const s = setup();
  const original = s.opts.request;
  s.opts.request = async (path, init) => {
    if (path.includes('/placements?')) return { data: [], links: { next: '/v1/next-page' } };
    if (path === '/v1/next-page') return { data: [oldCreative()], links: {} };
    return original(path, init);
  };
  await uploadIOSCreative(s.input, s.opts);
  assert.equal(s.calls.filter(c => c.method === 'DELETE').length, 1);
});

test('rejects an incomplete reservation before transferring any bytes', async () => {
  const s = setup();
  const original = s.opts.request;
  s.opts.request = async (path, init) => {
    const result = await original(path, init);
    if (path === '/v1/appAssetLibraryImages') result.data.attributes.uploadOperations[1].offset++;
    return result;
  };
  await assert.rejects(uploadIOSCreative(s.input, s.opts), /invalid asset upload ranges/);
  assert.equal(s.transfers.length, 0);
});

test('rejects an unexpected processed image size before changing placements', async () => {
  const s = setup();
  const original = s.opts.request;
  s.opts.request = async (path, init) => {
    const result = await original(path, init);
    if (path === '/v1/appAssetLibraryImages/new-image' && !init?.method) {
      result.data.attributes.imageAsset = { width: 100, height: 100 };
    }
    return result;
  };
  await assert.rejects(uploadIOSCreative(s.input, s.opts), /unexpected creative size/);
  assert.ok(s.calls.every(c => !c.path.includes('/placements')));
});

test('concurrent uploads cannot remove the same language placement at the same time', async () => {
  const s = setup();
  const original = s.opts.request;
  let releaseFirst;
  let firstReached;
  const gate = new Promise(resolve => { releaseFirst = resolve; });
  const reached = new Promise(resolve => { firstReached = resolve; });
  let placementReads = 0;
  s.opts.request = async (path, init) => {
    if (path.includes('/placements?')) {
      placementReads++;
      if (placementReads === 1) { firstReached(); await gate; }
    }
    return original(path, init);
  };
  const first = uploadIOSCreative(s.input, s.opts);
  await reached;
  const second = uploadIOSCreative(s.input, s.opts);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(placementReads, 1);
  releaseFirst();
  const results = await Promise.all([first, second]);
  assert.equal(placementReads, 2);
  assert.ok(results.every(r => r.uploaded.length === 1 && !r.errors.length));
});

test('a version submitted during image processing is checked again before changing any placements', async () => {
  const s = setup();
  const original = s.opts.request;
  let versionReads = 0;
  s.opts.request = async (path, init) => {
    const result = await original(path, init);
    if (path === '/v1/appStoreVersions/version' && ++versionReads > 1) result.data.attributes.appStoreState = 'WAITING_FOR_REVIEW';
    return result;
  };
  await assert.rejects(uploadIOSCreative(s.input, s.opts), /no longer editable/);
  assert.ok(s.calls.every(c => !c.path.includes('/placements')));
});
