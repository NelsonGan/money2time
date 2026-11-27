import assert from 'node:assert/strict';
import test from 'node:test';

import {
  APP_NAME, IOS_KEYWORDS, IOS_STORE_LOCALE_COPY, IOS_SUBTITLES,
  PLAY_SHORT_DESCRIPTIONS, PLAY_STORE_LOCALE_COPY, copyForStoreLocale,
} from '../src/data/listingCopy.mjs';
import { ANDROID_LOCALE_MAP, IOS_LOCALE_MAP } from '../src/data/storeLocales.mjs';

/** Every keyword field App Studio writes, named by where it goes. */
function keywordFields() {
  const fields = Object.entries(IOS_KEYWORDS).map(([lang, kw]) => [lang, kw]);
  for (const [lang, stores] of Object.entries(IOS_STORE_LOCALE_COPY)) {
    for (const [store, own] of Object.entries(stores)) {
      if (own.keywords) fields.push([`${lang} → ${store}`, own.keywords]);
    }
  }
  return fields;
}

test('every keyword field fits Apple\'s 100 characters, with no spaces after commas', () => {
  for (const [where, keywords] of keywordFields()) {
    assert.ok(keywords.length <= 100, `${where}: ${keywords.length}/100`);
    assert.ok(!/,\s/.test(keywords), `${where}: a space after a comma wastes a character`);
  }
});

test('no keyword field has an empty or repeated term', () => {
  for (const [where, keywords] of keywordFields()) {
    const terms = keywords.split(',');
    assert.ok(terms.every(t => t.trim().length > 0), `${where}: empty term`);
    const repeated = terms.filter((t, i) => terms.indexOf(t) !== i);
    assert.deepEqual(repeated, [], `${where}: repeated ${repeated.join(', ')}`);
  }
});

test('the name, subtitles and Play short descriptions fit their fields', () => {
  assert.ok(APP_NAME.length <= 30, `name ${APP_NAME.length}/30`);
  const subtitles = [...Object.entries(IOS_SUBTITLES)];
  const shorts = [...Object.entries(PLAY_SHORT_DESCRIPTIONS)];
  for (const [lang, stores] of Object.entries(IOS_STORE_LOCALE_COPY)) {
    for (const [store, own] of Object.entries(stores)) if (own.subtitle) subtitles.push([`${lang} → ${store}`, own.subtitle]);
  }
  for (const [lang, stores] of Object.entries(PLAY_STORE_LOCALE_COPY)) {
    for (const [store, own] of Object.entries(stores)) if (own.subtitle) shorts.push([`${lang} → ${store}`, own.subtitle]);
  }
  for (const [where, s] of subtitles) assert.ok(s.length <= 30, `subtitle ${where}: ${s.length}/30`);
  for (const [where, s] of shorts) assert.ok(s.length <= 80, `short description ${where}: ${s.length}/80`);
});

test('a store-locale override names a store locale its language actually writes', () => {
  for (const [lang, stores] of Object.entries(IOS_STORE_LOCALE_COPY)) {
    for (const store of Object.keys(stores)) {
      assert.ok(IOS_LOCALE_MAP[lang]?.includes(store), `${lang} does not write App Store locale ${store}`);
    }
  }
  for (const [lang, stores] of Object.entries(PLAY_STORE_LOCALE_COPY)) {
    for (const store of Object.keys(stores)) {
      assert.ok(ANDROID_LOCALE_MAP[lang]?.includes(store), `${lang} does not write Play locale ${store}`);
    }
  }
});

test('Traditional Chinese copy has no Simplified-only characters', () => {
  // The characters that differ in the words these fields use. A Simplified one
  // slipping in is exactly the mistake the overrides exist to fix.
  const simplified = /[记账钱据扫费财储订单销开录软资发务时节习惯这个们为]/u;
  const traditional = [
    ...Object.values(IOS_STORE_LOCALE_COPY.zh ?? {}).flatMap(o => [o.subtitle, o.keywords]),
    ...Object.values(PLAY_STORE_LOCALE_COPY.zh ?? {}).map(o => o.subtitle),
  ].filter(Boolean);
  assert.ok(traditional.length > 0);
  for (const text of traditional) {
    assert.ok(!simplified.test(text), `Simplified character in "${text}": ${text.match(simplified)?.[0]}`);
  }
});

test('copyForStoreLocale puts a store locale\'s own fields over its language\'s', () => {
  const copy = {
    subtitle: '离线记账应用', keywords: '预算', description: '描述',
    storeLocales: { 'zh-Hant': { subtitle: '離線記帳應用', keywords: '預算' } },
  };
  assert.deepEqual(copyForStoreLocale(copy, 'zh-Hant'), {
    subtitle: '離線記帳應用', keywords: '預算', description: '描述',
  });
  assert.deepEqual(copyForStoreLocale(copy, 'zh-Hans'), {
    subtitle: '离线记账应用', keywords: '预算', description: '描述',
  });
  assert.deepEqual(copyForStoreLocale({ subtitle: 'x' }, 'en-US'), { subtitle: 'x' });
});
