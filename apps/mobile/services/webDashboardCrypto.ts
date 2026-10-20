/**
 * End-to-end encryption for the Web Dashboard. Pure functions over bytes, so
 * the same code runs on the phone and in tests; randomness is passed in (the
 * app uses expo-crypto, as Hermes has no `crypto.getRandomValues`). The
 * website mirrors every format here in WebCrypto (src/lib/cloud/crypto.ts in
 * the website repo); change one and the other must change with it.
 *
 * - Linking: the browser shows a QR code with a one-off room id, a P-256
 *   public key and a 16-byte secret. The phone scans it, sends its own public
 *   key through the relay, and both derive the link key:
 *   ECDH (x-coordinate) → HKDF-SHA256 (salt: the QR secret). The secret only
 *   ever travels through the camera, so the relay cannot stand in for either
 *   side. Anyone who sees the QR itself (a photo, a screen share) could
 *   answer it too, which is why the phone asks before linking and both
 *   screens show the code below.
 * - The same HKDF also gives the link's private room id, where the two meet
 *   from then on, and a six-digit code both screens show, so the person
 *   linking can see the phone and the computer agree before it is confirmed.
 * - Messages are JSON sealed with AES-256-GCM: `{ t: 'e', iv, d }`, with the
 *   direction in the AAD so a message cannot be reflected back to its sender.
 * - The data itself is gzip → AES-256-GCM: `M2TB` · version 1 · 12-byte IV ·
 *   ciphertext with its 16-byte tag, sent in chunks and checked whole.
 */

import { gcm } from '@noble/ciphers/aes.js';
import { p256 } from '@noble/curves/nist.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';

export type RandomBytes = (length: number) => Uint8Array;

const MAGIC = [0x4d, 0x32, 0x54, 0x42]; // "M2TB"
const VERSION = 1;
const HEADER = MAGIC.length + 1;
const IV_LENGTH = 12;
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const BACKUP_AAD = encoder.encode('money2time-backup-v1');
const MESSAGE_AAD = {
  p2b: encoder.encode('money2time-msg-v1:p2b'),
  b2p: encoder.encode('money2time-msg-v1:b2p'),
};
const KEY_INFO = encoder.encode('money2time-pair-key-v1');
const ROOM_INFO = encoder.encode('money2time-pair-room-v1');
const CODE_INFO = encoder.encode('money2time-pair-code-v1');
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function toBase64Url(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out +=
      ALPHABET[(n >> 18) & 63] +
      ALPHABET[(n >> 12) & 63] +
      ALPHABET[(n >> 6) & 63] +
      ALPHABET[n & 63];
  }
  if (i < bytes.length) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8);
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63];
    if (i + 1 < bytes.length) out += ALPHABET[(n >> 6) & 63];
  }
  return out;
}

export function fromBase64Url(text: string): Uint8Array {
  const clean = text.replace(/=+$/, '');
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of clean) {
    const value = ALPHABET.indexOf(char);
    if (value < 0) throw new Error('invalid base64url');
    buffer = ((buffer << 6) | value) & 0xffffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

/** A fresh P-256 key pair for one link. */
export function linkKeyPair(random: RandomBytes): { secretKey: Uint8Array; publicKey: Uint8Array } {
  const secretKey = p256.utils.randomSecretKey(random(48));
  return { secretKey, publicKey: p256.getPublicKey(secretKey, false) };
}

export type DerivedLink = { key: Uint8Array; roomId: string; code: string };

/** Phone to browser, or browser to phone. */
export type Direction = 'p2b' | 'b2p';

/** The link key and private room id both sides derive from one QR scan. */
export function deriveLink(
  secretKey: Uint8Array,
  otherPublicKey: Uint8Array,
  qrSecret: Uint8Array,
): DerivedLink {
  // noble returns the compressed shared point; WebCrypto's ECDH gives its
  // x-coordinate, so both sides use the 32 bytes after the prefix.
  const shared = p256.getSharedSecret(secretKey, otherPublicKey, true).subarray(1);
  const codeBytes = hkdf(sha256, shared, qrSecret, CODE_INFO, 4);
  const codeNumber =
    new DataView(codeBytes.buffer, codeBytes.byteOffset, 4).getUint32(0) % 1_000_000;
  return {
    key: hkdf(sha256, shared, qrSecret, KEY_INFO, 32),
    roomId: toBase64Url(hkdf(sha256, shared, qrSecret, ROOM_INFO, 16)),
    code: String(codeNumber).padStart(6, '0'),
  };
}

export type Sealed = { t: 'e'; iv: string; d: string };

export function sealMessage(
  key: Uint8Array,
  message: unknown,
  random: RandomBytes,
  direction: Direction,
): Sealed {
  const iv = random(IV_LENGTH);
  const data = gcm(key, iv, MESSAGE_AAD[direction]).encrypt(
    encoder.encode(JSON.stringify(message)),
  );
  return { t: 'e', iv: toBase64Url(iv), d: toBase64Url(data) };
}

/** The message inside, or null if it was not sealed with this key. */
export function openMessage<T>(key: Uint8Array, sealed: Sealed, direction: Direction): T | null {
  try {
    const plain = gcm(key, fromBase64Url(sealed.iv), MESSAGE_AAD[direction]).decrypt(
      fromBase64Url(sealed.d),
    );
    return JSON.parse(decoder.decode(plain)) as T;
  } catch {
    return null;
  }
}

export function encryptBackup(
  key: Uint8Array,
  plaintext: Uint8Array,
  random: RandomBytes,
): Uint8Array {
  const iv = random(IV_LENGTH);
  const sealed = gcm(key, iv, BACKUP_AAD).encrypt(plaintext);
  const out = new Uint8Array(HEADER + IV_LENGTH + sealed.length);
  out.set(MAGIC, 0);
  out[MAGIC.length] = VERSION;
  out.set(iv, HEADER);
  out.set(sealed, HEADER + IV_LENGTH);
  return out;
}

export class BackupDecryptError extends Error {}

/** For tests: the website does this side. */
export function decryptBackup(key: Uint8Array, data: Uint8Array): Uint8Array {
  if (data.length < HEADER + IV_LENGTH + 16 || MAGIC.some((byte, i) => data[i] !== byte)) {
    throw new BackupDecryptError('not an encrypted backup');
  }
  if (data[MAGIC.length] !== VERSION) throw new BackupDecryptError('unsupported version');
  try {
    return gcm(key, data.subarray(HEADER, HEADER + IV_LENGTH), BACKUP_AAD).decrypt(
      data.subarray(HEADER + IV_LENGTH),
    );
  } catch {
    throw new BackupDecryptError('wrong key or damaged backup');
  }
}
