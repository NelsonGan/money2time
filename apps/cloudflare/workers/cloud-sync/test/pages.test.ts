import assert from 'node:assert/strict';
import { test } from 'node:test';

import { brokenInvitePageHtml, invitePageHtml } from '../src/pages.ts';

const code = 'AbCdEfGhIjKlMnOpQrSt_-12';

test('the invite page hands the code to the app and links both stores', () => {
  const { html, headers } = invitePageHtml(code, 'n0nce');
  assert.ok(html.includes(`href="money2time://join/${code}"`));
  assert.ok(html.includes(`"money2time://join/${code}"`), 'the redirect script');
  assert.ok(html.includes('https://apps.apple.com/app/id6760418898'));
  assert.ok(
    html.includes('https://play.google.com/store/apps/details?id=com.nelsongan.money2time'),
  );
  assert.ok(html.includes('<script nonce="n0nce">'));
  const csp = (headers as Record<string, string>)['Content-Security-Policy'];
  assert.match(csp, /script-src 'nonce-n0nce'/);
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /frame-ancestors 'none'/);
});

test('the invite page escapes the code wherever it goes', () => {
  const { html } = invitePageHtml('"><script>alert(1)</script>', 'n');
  assert.ok(!html.includes('<script>alert(1)'));
});

test('the broken-link page runs no script', () => {
  const { html, headers } = brokenInvitePageHtml();
  assert.ok(!html.includes('<script'));
  assert.match((headers as Record<string, string>)['Content-Security-Policy'], /script-src 'none'/);
});
