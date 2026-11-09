import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);

// Exercise the modal's actual capture/upload batch through its rendered buttons.
// Hooks hold state in this harness; rasterization and remote stores are stand-ins.
async function playBatch({ capture, upload, device = 'phone' } = {}) {
  const states = [], refs = [], effects = [];
  const captures = [], uploads = [], commits = [], locales = [];
  let stateIndex = 0, refIndex = 0, mounted = false;
  const hooks = {
    useState(initial) {
      const index = stateIndex++;
      if (index >= states.length) states[index] = initial;
      return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
    },
    useRef(initial) {
      const index = refIndex++;
      return refs[index] ??= { current: initial };
    },
    useEffect(effect) { if (!mounted) effects.push(effect); },
    useCallback: callback => callback,
  };
  const module = { exports: {} };
  const source = readFileSync(new URL('../src/components/UploadModal.tsx', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  });
  const api = {
    checkServer: async () => ({ online: true, ios: true, android: true }),
    captureCurrentView: async (device, locale) => {
      captures.push(locale);
      if (capture) await capture(locale);
      return [{ filename: `${locale}.png`, data: 'pixels' }];
    },
    startAndroidSession: async () => 'test-edit',
    uploadAndroidLocale: async (sessionId, locale) => {
      uploads.push({ sessionId, locale });
      return upload ? upload(locale) : { count: 1, uploaded: [locale], errors: [] };
    },
    commitAndroidSession: async session => { commits.push(session); },
  };
  runInNewContext(outputText, {
    module, exports: module.exports,
    require: id => {
      if (id === 'react') return hooks;
      if (id === 'react/jsx-runtime') return require(id);
      if (id === 'react-dom') return { flushSync: callback => callback() };
      if (id === '../utils/upload') return api;
      if (id === '../data/appStoreCreative') return { isCreativePlacement: value => ['header', 'search'].includes(value) };
      if (id === '../data/storeLocales.mjs') return { IOS_LOCALE_MAP: {} };
      throw new Error(`Unexpected dependency: ${id}`);
    },
    document: { activeElement: null }, window: { addEventListener() {} },
    setTimeout: callback => { queueMicrotask(callback); },
  });
  const props = {
    device, activeLocale: 'en', localeOptions: ['en', 'zh'],
    setLocale: locale => locales.push(locale),
    sceneRefs: { current: new Map() }, featureRef: { current: null }, creativeRef: { current: null },
    onClose() {},
  };
  const render = () => {
    stateIndex = 0; refIndex = 0;
    return module.exports.UploadModal(props);
  };
  render();
  effects.forEach(effect => effect());
  mounted = true;
  await new Promise(setImmediate);
  findButton(render(), /^Android$/)?.props.onClick();
  const start = () => findButton(render(), /^Upload 2 locales → Play Store$/).props.onClick();
  return { start, render, captures, uploads, commits, locales };
}

test('iPhone Duo uploads go to the App Store only, with no Play option', async () => {
  const run = await playBatch({ device: 'duo' });
  const view = run.render();
  assert.equal(findButton(view, /^Android$/), undefined);
  assert.equal(findButton(view, /^iOS$/), undefined);
  assert.ok(findButton(view, /^Upload 2 locales → App Store$/));
  assert.match(textOf(view), /iPhone Duo · 2 locales/);
});

function textOf(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  return node?.props ? textOf(node.props.children) : '';
}

function findButton(node, text) {
  if (Array.isArray(node)) return node.map(child => findButton(child, text)).find(Boolean);
  if (!node?.props) return;
  if (node.type === 'button' && text.test(textOf(node))) return node;
  return findButton(node.props.children, text);
}

test('Play commits once only after every language succeeds, then restores the original Studio language', async () => {
  const run = await playBatch();
  await run.start();
  assert.deepEqual(run.captures, ['en', 'zh']);
  assert.deepEqual(run.uploads.map(u => u.locale), ['en', 'zh']);
  assert.deepEqual(run.commits, ['test-edit']);
  assert.equal(run.locales.at(-1), 'en');
  assert.match(textOf(run.render()), /Upload complete/);
});

test('a regional Play failure returned with HTTP success prevents the entire edit from committing', async () => {
  const run = await playBatch({ upload: async locale => locale === 'en'
    ? { count: 1, uploaded: ['en-US'], errors: ['en-GB: Image rejected'] }
    : { count: 1, uploaded: ['zh-TW'], errors: [] } });
  await run.start();
  assert.deepEqual(run.commits, []);
  const result = textOf(run.render());
  assert.match(result, /en-GB: Image rejected/);
  assert.match(result, /Edit not committed — nothing changed/);
  assert.match(result, /Finished with errors/);
  assert.equal(run.locales.at(-1), 'en');
});

test('capture and upload exceptions leave the Play edit uncommitted', async () => {
  for (const stage of ['capture', 'upload']) {
    const run = await playBatch({ [stage]: async locale => {
      if (locale === 'zh') throw new Error(`${stage} failed`);
      return { count: 1, uploaded: [locale], errors: [] };
    } });
    await run.start();
    assert.deepEqual(run.commits, []);
    assert.match(textOf(run.render()), /Edit not committed — nothing changed/);
    assert.match(textOf(run.render()), new RegExp(`${stage} failed`));
    assert.equal(run.locales.at(-1), 'en');
  }
});

test('cancelling a Play batch while capture is pending prevents commit and restores the original language', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const run = await playBatch({ capture: () => gate });
  const pending = run.start();
  await new Promise(setImmediate);
  findButton(run.render(), /^Cancel$/).props.onClick();
  release();
  await pending;
  assert.deepEqual(run.commits, []);
  assert.deepEqual(run.uploads, []);
  assert.equal(run.locales.at(-1), 'en');
});
