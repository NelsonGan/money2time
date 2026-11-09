/**
 * The web dashboard's half of the Web Dashboard's end-to-end encryption, in
 * WebCrypto. It mirrors the app's services/webDashboardCrypto.ts byte for
 * byte; change one and the other must change with it.
 *
 * - Linking: this browser makes a P-256 key pair and a 16-byte secret and
 *   shows both, with a one-off room token, in the QR code. The phone sends back
 *   its public key, and both derive the link key: ECDH (x-coordinate) →
 *   HKDF-SHA256 (salt: the QR secret, info "money2time-pair-key-v1"). The key
 *   is imported non-extractable: it works here, but no script can read it out.
 * - The same HKDF (info "money2time-pair-room-v1") gives the link's private
 *   room token (the relay keeps only a hash of it), where phone and browser
 *   meet from then on, and (info "money2time-pair-code-v1") a six-digit code
 *   both screens show.
 * - Messages are JSON sealed with AES-256-GCM, AAD "money2time-msg-v1:p2b"
 *   (phone to browser) or ":b2p", so one cannot be reflected to its sender.
 * - Data: the gzipped export in chunks, each AES-256-GCM under a fresh data
 *   key per transfer (sent sealed in `begin`), IV = 8-byte prefix ‖ u32 index,
 *   AAD "money2time-chunk-v1:<id>:<index>:<count>".
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const IV_LENGTH = 12;
const MESSAGE_AAD = {
  p2b: encoder.encode("money2time-msg-v1:p2b"),
  b2p: encoder.encode("money2time-msg-v1:b2p"),
};

export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(length));
}

export type LinkOffer = {
  /** The one-off room the phone joins after scanning. */
  roomId: string;
  secret: Uint8Array<ArrayBuffer>;
  privateKey: CryptoKey;
  publicKey: string;
};

/** A fresh QR offer. The private key and the secret never leave this tab. */
export async function createLinkOffer(): Promise<LinkOffer> {
  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  return {
    roomId: toBase64Url(randomBytes(16)),
    secret: randomBytes(16),
    privateKey: pair.privateKey,
    publicKey: toBase64Url(raw),
  };
}

/** What the QR code says: `money2time://pair?r=…&pk=…&s=…`. */
export function linkQrText(offer: LinkOffer): string {
  return `money2time://pair?r=${offer.roomId}&pk=${offer.publicKey}&s=${toBase64Url(offer.secret)}`;
}

export type DerivedLink = { key: CryptoKey; roomId: string; code: string };

/** Phone to browser, or browser to phone. */
type Direction = "p2b" | "b2p";

/** The link key and private room id, from the phone's public key. */
export async function deriveLink(offer: LinkOffer, phonePublicKey: string): Promise<DerivedLink> {
  const phoneKey = await crypto.subtle.importKey(
    "raw",
    fromBase64Url(phonePublicKey),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const shared = await crypto.subtle.deriveBits({ name: "ECDH", public: phoneKey }, offer.privateKey, 256);
  const hkdfKey = await crypto.subtle.importKey("raw", shared, "HKDF", false, ["deriveKey", "deriveBits"]);
  const key = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: offer.secret, info: encoder.encode("money2time-pair-key-v1") },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  const room = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: offer.secret, info: encoder.encode("money2time-pair-room-v1") },
    hkdfKey,
    128,
  );
  const codeBits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: offer.secret, info: encoder.encode("money2time-pair-code-v1") },
    hkdfKey,
    32,
  );
  const code = String(new DataView(codeBits).getUint32(0) % 1_000_000).padStart(6, "0");
  return { key, roomId: toBase64Url(new Uint8Array(room)), code };
}

export type Sealed = { t: "e"; iv: string; d: string };

export async function sealMessage(key: CryptoKey, message: unknown, direction: Direction): Promise<Sealed> {
  const iv = randomBytes(IV_LENGTH);
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: MESSAGE_AAD[direction] },
    key,
    encoder.encode(JSON.stringify(message)),
  );
  return { t: "e", iv: toBase64Url(iv), d: toBase64Url(new Uint8Array(data)) };
}

/** The message inside, or null if it was not sealed with this key. */
export async function openMessage<T>(key: CryptoKey, sealed: Sealed, direction: Direction): Promise<T | null> {
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64Url(sealed.iv), additionalData: MESSAGE_AAD[direction] },
      key,
      fromBase64Url(sealed.d),
    );
    return JSON.parse(decoder.decode(plain)) as T;
  } catch {
    return null;
  }
}

/** The transfer's own data key, from the sealed `begin`; it can only decrypt. */
export function importDataKey(raw: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", fromBase64Url(raw), { name: "AES-GCM" }, false, ["decrypt"]);
}

export function decodeIvPrefix(raw: string): Uint8Array<ArrayBuffer> {
  const prefix = fromBase64Url(raw);
  if (prefix.length !== 8) throw new Error("bad iv");
  return prefix;
}

/**
 * Opens one chunk of a transfer. Its place (transfer id, index, count) is in
 * the IV and AAD, so a chunk swapped, repeated or moved from another transfer
 * fails here. Rejects on any mismatch.
 */
export async function decryptChunk(
  dataKey: CryptoKey,
  ivPrefix: Uint8Array<ArrayBuffer>,
  place: { id: string; index: number; count: number },
  ciphertext: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const plain = await crypto.subtle.decrypt(chunkParams(ivPrefix, place), dataKey, ciphertext);
  return new Uint8Array(plain);
}

/** A chunk's IV (the transfer's prefix and the chunk's index) and AAD (its place). */
function chunkParams(ivPrefix: Uint8Array<ArrayBuffer>, place: { id: string; index: number; count: number }): AesGcmParams {
  const iv = new Uint8Array(IV_LENGTH);
  iv.set(ivPrefix, 0);
  new DataView(iv.buffer).setUint32(8, place.index);
  return { name: "AES-GCM", iv, additionalData: encoder.encode(`money2time-chunk-v1:${place.id}:${place.index}:${place.count}`) };
}

/**
 * Data this browser made itself (a copy with a patch applied), gzipped and
 * sealed in the same chunks a transfer uses, under a fresh non-extractable
 * key made here, so it is kept and reopened exactly like the phone's.
 */
export async function sealForCache(
  text: string,
  id: string,
  chunkBytes: number,
): Promise<{ dataKey: CryptoKey; ivPrefix: Uint8Array<ArrayBuffer>; frames: Uint8Array<ArrayBuffer>[]; size: number; count: number }> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  const gzipped = new Uint8Array(await new Response(stream).arrayBuffer());
  const dataKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  const ivPrefix = randomBytes(8);
  const count = Math.max(1, Math.ceil(gzipped.length / chunkBytes));
  const frames: Uint8Array<ArrayBuffer>[] = [];
  for (let index = 0; index < count; index++) {
    const slice = gzipped.subarray(index * chunkBytes, (index + 1) * chunkBytes);
    frames.push(new Uint8Array(await crypto.subtle.encrypt(chunkParams(ivPrefix, { id, index, count }), dataKey, slice)));
  }
  return { dataKey, ivPrefix, frames, size: gzipped.length, count };
}

/** Inflates the gzipped export the phone sent into the backup JSON text. */
export async function gunzipText(gzipped: Uint8Array<ArrayBuffer>): Promise<string> {
  const stream = new Blob([gzipped]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

/**
 * Whether this browser has what the dashboard needs: WebCrypto, gzip streams
 * both ways (a patched copy is gzipped here before it is kept), WebSockets for
 * the relay and IndexedDB for the link and the kept copy.
 */
export function browserSupported(): boolean {
  return (
    typeof crypto !== "undefined" &&
    typeof crypto.subtle?.deriveBits === "function" &&
    typeof DecompressionStream === "function" &&
    typeof CompressionStream === "function" &&
    typeof WebSocket === "function" &&
    typeof indexedDB !== "undefined"
  );
}
