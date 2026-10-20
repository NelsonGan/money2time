import { randomBytes } from 'crypto';

import {
  decryptBackup,
  deriveLink,
  encryptBackup,
  fromBase64Url,
  linkKeyPair,
  openMessage,
  sealMessage,
  toBase64Url,
} from '~/services/webDashboardCrypto';
import { parsePairQr } from '~/services/webDashboardLink';

const random = (length: number) => new Uint8Array(randomBytes(length));

describe('parsePairQr', () => {
  const browser = linkKeyPair(random);
  const room = toBase64Url(random(16));
  const secret = toBase64Url(random(16));
  const qr = `money2time://pair?r=${room}&pk=${toBase64Url(browser.publicKey)}&s=${secret}`;

  it('reads the code app.money2time.com shows', () => {
    const parsed = parsePairQr(qr);
    expect(parsed?.roomId).toBe(room);
    expect(toBase64Url(parsed!.secret)).toBe(secret);
  });

  it('rejects anything else', () => {
    expect(parsePairQr('https://example.com')).toBeNull();
    expect(parsePairQr('money2time://tutorial?id=albums')).toBeNull();
    expect(parsePairQr(qr.replace(/s=[^&]+/, 's=short'))).toBeNull();
  });
});

describe('link crypto', () => {
  it('derives the same key and room on both sides, and only with the QR secret', () => {
    const phone = linkKeyPair(random);
    const browser = linkKeyPair(random);
    const secret = random(16);
    const a = deriveLink(phone.secretKey, browser.publicKey, secret);
    const b = deriveLink(browser.secretKey, phone.publicKey, secret);
    expect(toBase64Url(a.key)).toBe(toBase64Url(b.key));
    expect(a.roomId).toBe(b.roomId);
    const wrong = deriveLink(phone.secretKey, browser.publicKey, random(16));
    expect(toBase64Url(wrong.key)).not.toBe(toBase64Url(a.key));
  });

  it('seals messages and data so only the link key opens them', () => {
    const key = random(32);
    const sealed = sealMessage(key, { type: 'want' }, random);
    expect(openMessage(key, sealed)).toEqual({ type: 'want' });
    expect(openMessage(random(32), sealed)).toBeNull();
    const data = random(1000);
    expect(Array.from(decryptBackup(key, encryptBackup(key, data, random)))).toEqual(
      Array.from(data),
    );
    expect(() => decryptBackup(random(32), encryptBackup(key, data, random))).toThrow();
  });

  it('round-trips base64url', () => {
    const bytes = random(65);
    expect(Array.from(fromBase64Url(toBase64Url(bytes)))).toEqual(Array.from(bytes));
  });
});
