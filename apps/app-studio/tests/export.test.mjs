import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import JSZip from 'jszip';
import { PAYMENT_LAYERS } from '../src/data/paymentAnimation.mjs';

// Exercise the real exporter with browser rasterization/downloads replaced.
// TypeScript and Node's test runner are already available in this project.
function loadModule(path, require, globals = {}) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2017, module: ts.ModuleKind.CommonJS, esModuleInterop: true,
    },
  });
  const module = { exports: {} };
  runInNewContext(outputText, { module, exports: module.exports, require, ...globals }, {
    filename: path,
  });
  return module.exports;
}

function exporter({ fontsReady = Promise.resolve(), images = [], uploadResponses = [], uploadClock = Date } = {}) {
  const captures = [];
  const downloads = [];
  const requests = [];
  const attributes = new Map([['data-search-locale','en']]);
  const element = { querySelectorAll: () => images, getAttribute: key => attributes.get(key) ?? null,
    setAttribute: (key,value) => attributes.set(key,value), removeAttribute: key => attributes.delete(key) };
  const encoderRequests = [];
  const spec = loadModule('../src/data/appStoreCreative.ts');
  const api = loadModule('../src/utils/export.ts', (id) => {
    if (id === '../data/appStoreCreative') return spec;
    if (id === '../data/paymentAnimation.mjs') return { PAYMENT_LAYERS };
    if (id === 'jszip') return JSZip;
    if (id === 'file-saver') return { saveAs: (blob, filename) => downloads.push({ blob, filename }) };
    if (id === 'html-to-image') {
      const capture = (format) => async (target, options) => {
        captures.push({ format, target, options });
        return `data:image/${format};base64,${Buffer.from('image-pixels').toString('base64')}`;
      };
      return { toJpeg: capture('jpeg'), toPng: capture('png') };
    }
    throw new Error(`Unexpected dependency: ${id}`);
  }, {
    document: {
      fonts: { ready: fontsReady },
      createElement: () => {
        const link = { click: () => downloads.push({ filename: link.download, href: link.href }) };
        return link;
      },
    },
    FileReader: class {
      readAsDataURL() { this.result = `data:video/mp4;base64,${Buffer.from('video-bytes').toString('base64')}`; this.onload(); }
    },
    fetch: async (path, options) => {
      encoderRequests.push({path,body:JSON.parse(options.body)});
      return {ok:true,blob:async()=>new Blob(['video-bytes'])};
    },
    // No animation-frame API: exports must also finish in a background tab.
    setTimeout,
  });
  const uploader = loadModule('../src/utils/upload.ts', (id) => {
    if (id === './export') return api;
    if (id === '../data/appStoreCreative') return spec;
    if (id === '../data/paymentAnimation.mjs') return { PAYMENT_LAYERS };
    throw new Error(`Unexpected dependency: ${id}`);
  }, {
    fetch: async (path, options) => {
      requests.push({ path, body: JSON.parse(options.body) });
      if (uploadResponses.length) {
        const { body, status = 200 } = uploadResponses.shift();
        return { ok: status >= 200 && status < 300, status, json: async () => body };
      }
      return { ok: true, json: async () => ({ uploaded: ['en-US'] }) };
    },
    Date: uploadClock,
  });
  return { api, uploader, element, captures, downloads, requests, encoderRequests };
}

test('Studio uploads capture Header JPEG and Search MP4 and use the dedicated creative endpoint', async () => {
  for (const placement of ['header', 'search']) {
    const { uploader, element, captures, requests } = exporter();
    const progress = [];
    const assets = await uploader.captureCurrentView(placement, 'en', new Map(), null, (n, total) => progress.push([n, total]), element);
    assert.equal(assets[0].filename, `${placement}-en.${placement === 'search' ? 'mp4' : 'jpg'}`);
    assert.equal(captures[0].target, element);
    assert.equal(captures[0].format, 'jpeg');
    assert.equal(captures[0].options.width, 3840);
    assert.equal(captures[0].options.height, placement === 'header' ? 1646 : 2560);
    assert.equal(captures[0].options.style.transform, 'none');
    assert.equal(progress.length, 1);
    await uploader.uploadIOSLocale(placement, 'en', assets);
    assert.equal(requests[0].path, '/api/upload/ios/creative');
    assert.deepEqual(requests[0].body, { placement, locale: 'en', data: Buffer.from(placement === 'search' ? 'video-bytes' : 'image-pixels').toString('base64') });
  }
});

test('missing creative roots and multiple creative images fail before upload; screenshots retain their upload route', async () => {
  const { uploader, requests } = exporter();
  await assert.rejects(uploader.captureCurrentView('search', 'en', new Map(), null), /not ready/);
  await assert.rejects(uploader.uploadIOSLocale('header', 'en', []), /one creative/);
  assert.equal(requests.length, 0);
  const screenshots = [{ filename: '01-en-home.png', data: 'png' }];
  await uploader.uploadIOSLocale('phone', 'en', screenshots);
  assert.equal(requests[0].path, '/api/upload/ios');
  assert.deepEqual(requests[0].body, { device: 'phone', locale: 'en', screenshots });
});

test('Studio continues slow processing with only the same reference, and reports progress once', async () => {
  const { uploader, requests } = exporter({ uploadResponses: [
    { status: 202, body: { pending: true, resumeToken: 'original-reference' } },
    { status: 202, body: { pending: true, resumeToken: 'original-reference' } },
    { body: { uploaded: ['en-US', 'en-GB'], errors: [], version: '2.0' } },
  ] });
  let progress = 0;
  const result = await uploader.uploadIOSLocale('search', 'en', [{ data: 'original-jpeg' }], () => { progress++; });
  assert.deepEqual([...result.uploaded], ['en-US', 'en-GB']);
  assert.equal(progress, 1);
  assert.equal(requests.length, 3);
  assert.deepEqual(requests[0].body, { placement: 'search', locale: 'en', data: 'original-jpeg' });
  assert.ok(requests.slice(1).every(r => Object.keys(r.body).length === 1 && r.body.resumeToken === 'original-reference'));
});

test('Studio preserves regional errors after processing instead of reporting full success', async () => {
  const { uploader } = exporter({ uploadResponses: [
    { status: 202, body: { pending: true, resumeToken: 'original-reference' } },
    { body: { uploaded: ['zh-Hant'], errors: ['zh-Hans: Assignment failed'] } },
  ] });
  const result = await uploader.uploadIOSLocale('header', 'zh', [{ data: 'jpeg' }]);
  assert.deepEqual([...result.uploaded], ['zh-Hant']);
  assert.deepEqual([...result.errors], ['zh-Hans: Assignment failed']);
});

test('Studio stops waiting after its processing deadline without sending another image', async () => {
  let now = 0;
  const { uploader, requests } = exporter({
    uploadClock: { now: () => { const value = now; now += 16 * 60_000; return value; } },
    uploadResponses: [{ status: 202, body: { pending: true, resumeToken: 'original-reference' } }],
  });
  await assert.rejects(uploader.uploadIOSLocale('search', 'en', [{ data: 'jpeg' }]), /continue with the same creative/);
  assert.equal(requests.length, 1);
});

test('a missing processing reference fails without reserving another image', async () => {
  const { uploader, requests } = exporter({ uploadResponses: [{ status: 202, body: { pending: true } }] });
  await assert.rejects(uploader.uploadIOSLocale('search', 'en', [{ data: 'jpeg' }]), /did not provide an upload reference/);
  assert.equal(requests.length, 1);
});

test('creative exports use Header JPEG and Search MP4 while screenshots keep PNG', async () => {
  for (const [device, width, height, format, extension] of [
    ['header', 3840, 1646, 'jpeg', 'jpg'],
    ['search', 3840, 2560, 'jpeg', 'mp4'],
    ['phone', 1284, 2778, 'png', 'png'],
    ['ipad', 2732, 2048, 'png', 'png'],
    ['duo', 2853, 2007, 'png', 'png'],
    ['feature', 1024, 500, 'png', 'png'],
    ['landing', 1200, 1200, 'png', 'png'],
  ]) {
    const { api, element, captures, downloads } = exporter();
    await api.exportSingleScreenshot(element, 'asset', device);
    assert.equal(downloads[0].filename, `asset.${extension}`);
    assert.equal(captures[0].format, format);
    assert.equal(captures[0].target, element);
    assert.equal(captures[0].options.width, width);
    assert.equal(captures[0].options.height, height);
    assert.equal(captures[0].options.pixelRatio, 1);
    assert.equal(captures[0].options.style.transform, 'none');
    if (format === 'jpeg') assert.equal(captures[0].options.backgroundColor, '#FBF2EA');
  }
});

test('rasterization waits for both fonts and image decoding', async () => {
  let finishFonts;
  let finishImage;
  let decoding = false;
  const fontsReady = new Promise((resolve) => { finishFonts = resolve; });
  const imageReady = new Promise((resolve) => { finishImage = resolve; });
  const { api, element, captures } = exporter({
    fontsReady, images: [{ decode: () => { decoding = true; return imageReady; } }],
  });
  const pending = api.exportSingleScreenshot(element, 'asset', 'header');
  assert.equal(decoding, false);
  finishFonts();
  await new Promise(setImmediate);
  assert.equal(decoding, true);
  assert.equal(captures.length, 0);
  finishImage();
  await pending;
  assert.equal(captures.length, 1);
});

test('a failed image prevents downloading an incomplete asset', async () => {
  const { api, element, captures, downloads } = exporter({
    images: [{ decode: async () => { throw new Error('Image unavailable'); } }],
  });
  await assert.rejects(api.exportSingleScreenshot(element, 'asset', 'header'), /Image unavailable/);
  assert.equal(captures.length, 0);
  assert.equal(downloads.length, 0);
});

test('all-locale Search exports retain each locale folder and MP4 filename', async () => {
  const { api, element, downloads } = exporter();
  const prepared = [];
  await api.exportAllLocalesScreenshots(['en', 'zh'], 'search', async (locale) => {
    prepared.push(locale);
    return new Map([[`money2time-app-store-search-${locale}`, element]]);
  });
  assert.deepEqual(prepared, ['en', 'zh']);
  assert.equal(downloads[0].filename, 'money2time-app-store-search-all.zip');
  const zip = await JSZip.loadAsync(await downloads[0].blob.arrayBuffer());
  const files = Object.keys(zip.files).filter((name) => !zip.files[name].dir);
  assert.deepEqual(files, [
    'money2time-app-store-search-all/en/money2time-app-store-search-en.mp4',
    'money2time-app-store-search-all/zh/money2time-app-store-search-zh.mp4',
  ]);
  assert.equal(await zip.file(files[0]).async('string'), 'video-bytes');
});

test('empty scene targets fail instead of saving an empty ZIP', async () => {
  const { api, downloads } = exporter();
  await assert.rejects(api.exportAllScreenshots(new Map(), 'en'), /No screenshots are ready/);
  assert.equal(downloads.length, 0);
});

test('a missing locale aborts the batch instead of silently omitting it', async () => {
  const { api, element, downloads } = exporter();
  await assert.rejects(api.exportAllLocalesScreenshots(['en', 'zh'], 'header', async (locale) => (
    locale === 'en' ? new Map([['header', element]]) : new Map()
  )), /No assets are ready for zh/);
  assert.equal(downloads.length, 0);
});


test('Search download and upload share the encoder, capture every transparent layer, and restore the preview', async () => {
  const {api,uploader,element,encoderRequests,captures} = exporter();
  await api.exportSingleScreenshot(element,'search','search');
  assert.equal(encoderRequests[0].path,'/api/creatives/search-video');
  assert.deepEqual(Object.keys(encoderRequests[0].body.layers),[...PAYMENT_LAYERS]);
  assert.equal(captures.length,1+PAYMENT_LAYERS.length);
  assert.ok(captures.slice(1).every(c=>c.format==='png' && c.options.style.background==='transparent'));
  assert.equal(element.getAttribute('data-payment-capture'),null);
  await uploader.captureCurrentView('search','en',new Map(),null,undefined,element);
  assert.deepEqual(encoderRequests[1],encoderRequests[0]);
});
