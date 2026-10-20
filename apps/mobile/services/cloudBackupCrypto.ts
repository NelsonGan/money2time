/**
 * End-to-end encryption for Cloud Backup. Pure functions over bytes, so the
 * same code runs on the phone and in tests; randomness is passed in (the app
 * uses expo-crypto, as Hermes has no `crypto.getRandomValues`).
 *
 * - The backup key is 32 random bytes, made on the account's first phone and
 *   kept in the keychain. The server never sees it, only `keyCheckOf(key)`,
 *   an HMAC fingerprint that tells a phone whether it holds the current key.
 * - A backup is gzip → AES-256-GCM: `M2TB` · version 1 · 12-byte IV ·
 *   ciphertext with its 16-byte tag. The SHA-256 the server checks is of these
 *   encrypted bytes.
 * - Handing the key to a browser or a new phone (the QR link): the newcomer
 *   shows a P-256 public key; this phone makes its own key pair, derives a
 *   shared secret (ECDH, x-coordinate) → HKDF-SHA256 (salt: link id) →
 *   AES-256-GCM, and wraps the backup key with it. The web dashboard undoes it
 *   with WebCrypto (src/lib/cloud/crypto.ts in the website repo); the formats
 *   must stay identical on both sides.
 * - The recovery key is the backup key written in Crockford base32, in groups
 *   of four, for typing into a new phone when no old one is at hand.
 */

import { gcm } from '@noble/ciphers/aes.js';
import { p256 } from '@noble/curves/nist.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';

export type RandomBytes = (length: number) => Uint8Array;

const MAGIC = [0x4d, 0x32, 0x54, 0x42]; // "M2TB"
const VERSION = 1;
const HEADER = MAGIC.length + 1;
const IV_LENGTH = 12;
const encoder = new TextEncoder();
const BACKUP_AAD = encoder.encode('money2time-backup-v1');
const KEY_CHECK_LABEL = encoder.encode('money2time-backup-key-check-v1');
const LINK_INFO = encoder.encode('money2time-link-v1');

export function toBase64Url(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += alphabet[(n >> 18) & 63] + alphabet[(n >> 12) & 63] + alphabet[(n >> 6) & 63] + alphabet[n & 63];
  }
  if (i < bytes.length) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8);
    out += alphabet[(n >> 18) & 63] + alphabet[(n >> 12) & 63];
    if (i + 1 < bytes.length) out += alphabet[(n >> 6) & 63];
  }
  return out;
}

export function fromBase64Url(text: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const clean = text.replace(/=+$/, '');
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of clean) {
    const value = alphabet.indexOf(char);
    if (value < 0) throw new Error('invalid base64url');
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

export function generateBackupKey(random: RandomBytes): Uint8Array {
  return random(32);
}

export function keyCheckOf(key: Uint8Array): string {
  return toBase64Url(hmac(sha256, key, KEY_CHECK_LABEL));
}

export function encryptBackup(key: Uint8Array, plaintext: Uint8Array, random: RandomBytes): Uint8Array {
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

export function decryptBackup(key: Uint8Array, data: Uint8Array): Uint8Array {
  if (data.length < HEADER + IV_LENGTH + 16 || MAGIC.some((byte, i) => data[i] !== byte)) {
    throw new BackupDecryptError('not an encrypted backup');
  }
  if (data[MAGIC.length] !== VERSION) throw new BackupDecryptError('unsupported version');
  const iv = data.subarray(HEADER, HEADER + IV_LENGTH);
  try {
    return gcm(key, iv, BACKUP_AAD).decrypt(data.subarray(HEADER + IV_LENGTH));
  } catch {
    throw new BackupDecryptError('wrong key or damaged backup');
  }
}

/** A fresh P-256 key pair for one link. */
export function linkKeyPair(random: RandomBytes): { secretKey: Uint8Array; publicKey: Uint8Array } {
  const secretKey = p256.utils.randomSecretKey(random(48));
  return { secretKey, publicKey: p256.getPublicKey(secretKey, false) };
}

function linkWrapKey(secretKey: Uint8Array, otherPublicKey: Uint8Array, linkId: string): Uint8Array {
  // noble returns the compressed shared point; WebCrypto's ECDH gives its
  // x-coordinate, so both sides use the 32 bytes after the prefix.
  const shared = p256.getSharedSecret(secretKey, otherPublicKey, true).subarray(1);
  return hkdf(sha256, shared, encoder.encode(linkId), LINK_INFO, 32);
}

/** Wraps the backup key for the public key shown in a link QR code. */
export function wrapKeyForLink(
  backupKey: Uint8Array,
  otherPublicKeyB64: string,
  linkId: string,
  random: RandomBytes,
): { phonePublicKey: string; wrappedKey: string; iv: string } {
  const ours = linkKeyPair(random);
  const wrapKey = linkWrapKey(ours.secretKey, fromBase64Url(otherPublicKeyB64), linkId);
  const iv = random(IV_LENGTH);
  const wrapped = gcm(wrapKey, iv, encoder.encode(linkId)).encrypt(backupKey);
  return { phonePublicKey: toBase64Url(ours.publicKey), wrappedKey: toBase64Url(wrapped), iv: toBase64Url(iv) };
}

/** A new phone's side: unwraps the backup key an old phone sent. */
export function unwrapKeyFromLink(
  secretKey: Uint8Array,
  phonePublicKeyB64: string,
  wrappedKeyB64: string,
  ivB64: string,
  linkId: string,
): Uint8Array {
  const wrapKey = linkWrapKey(secretKey, fromBase64Url(phonePublicKeyB64), linkId);
  return gcm(wrapKey, fromBase64Url(ivB64), encoder.encode(linkId)).decrypt(fromBase64Url(wrappedKeyB64));
}

// Crockford base32: no I, L, O or U, so it survives being read aloud or
// written down; a 32-byte key is 52 characters.
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function recoveryKeyOf(key: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of key) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += CROCKFORD[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += CROCKFORD[(value << (5 - bits)) & 31];
  return out.match(/.{1,4}/g)!.join('-');
}

/** Reads a typed recovery key, forgiving case, spaces and look-alike letters. */
export function keyFromRecoveryKey(text: string): Uint8Array | null {
  const clean = text
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0');
  if (clean.length !== 52) return null;
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = CROCKFORD.indexOf(char);
    if (index < 0) return null;
    value = ((value << 5) | index) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return out.length === 32 ? Uint8Array.from(out) : null;
}
