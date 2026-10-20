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
 * - The same HKDF also gives the link's private room token (the relay keeps
 *   only a hash of it), where the two meet from then on, and a six-digit code
 *   both screens show, so the person linking can see the phone and the
 *   computer agree before either confirms.
 * - Messages are JSON sealed with AES-256-GCM: `{ t: 'e', iv, d }`, with the
 *   direction in the AAD so a message cannot be reflected back to its sender.
 * - The data itself is gzip, cut into chunks, each sealed with AES-256-GCM
 *   under a fresh data key per transfer (`encryptChunk`).
 */

import { gcm } from '@noble/ciphers/aes.js';
import { p256 } from '@noble/curves/nist.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';

export type RandomBytes = (length: number) => Uint8Array;

const IV_LENGTH = 12;
const encoder = new TextEncoder();
const decoder = new TextDecoder();
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

/**
 * One chunk of a transfer: AES-256-GCM under the transfer's own data key,
 * with the chunk's place (transfer id, index, count) in the IV and AAD, so
 * chunks cannot be swapped, dropped, repeated or moved to another transfer.
 * The data key travels to each browser sealed with that browser's link key,
 * so one encryption serves every linked browser.
 */
export function encryptChunk(
  dataKey: Uint8Array,
  ivPrefix: Uint8Array,
  place: { id: string; index: number; count: number },
  plaintext: Uint8Array,
): Uint8Array {
  return gcm(dataKey, chunkIv(ivPrefix, place.index), chunkAad(place)).encrypt(plaintext);
}

/** For tests: the website does this side. */
export function decryptChunk(
  dataKey: Uint8Array,
  ivPrefix: Uint8Array,
  place: { id: string; index: number; count: number },
  ciphertext: Uint8Array,
): Uint8Array {
  return gcm(dataKey, chunkIv(ivPrefix, place.index), chunkAad(place)).decrypt(ciphertext);
}

function chunkIv(ivPrefix: Uint8Array, index: number): Uint8Array {
  const iv = new Uint8Array(IV_LENGTH);
  iv.set(ivPrefix.subarray(0, 8), 0);
  new DataView(iv.buffer).setUint32(8, index);
  return iv;
}

function chunkAad(place: { id: string; index: number; count: number }): Uint8Array {
  return encoder.encode(`money2time-chunk-v1:${place.id}:${place.index}:${place.count}`);
}
