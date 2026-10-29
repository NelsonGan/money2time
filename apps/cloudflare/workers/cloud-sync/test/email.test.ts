import assert from 'node:assert/strict';
import { test } from 'node:test';

import { signInCodeEmail } from '../src/email.ts';

test('the code is in the subject, the text and the html', () => {
  const email = signInCodeEmail('482913', 10);
  assert.equal(email.subject, '482913 is your Money2Time code');
  assert.match(email.text, /Your Money2Time sign-in code is 482913\./);
  assert.match(email.text, /expires in 10 minutes/);
  assert.match(email.html, />482913<\/td>/);
  assert.match(email.html, /expires in 10 minutes/);
});

test('the html is a complete document with a light and a dark palette', () => {
  const { html } = signInCodeEmail('123456', 10);
  assert.ok(html.startsWith('<!doctype html>'));
  assert.match(html, /<meta name="color-scheme" content="light dark">/);
  assert.match(html, /@media \(prefers-color-scheme: dark\)/);
  assert.doesNotMatch(
    html,
    /<a [^>]*href="https?:\/\/[^"]*sign/i,
    'no sign-in link to be spent by scanners',
  );
});

test('whatever reaches it is escaped', () => {
  const { html } = signInCodeEmail('<b>"x"</b>', 10);
  assert.ok(!html.includes('<b>"x"</b>'));
  assert.ok(html.includes('&lt;b&gt;&quot;x&quot;&lt;/b&gt;'));
});
