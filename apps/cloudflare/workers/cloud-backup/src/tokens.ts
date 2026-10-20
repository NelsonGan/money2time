// Short-lived, single-purpose URLs for R2. The bucket is private and has no
// credentials outside this Worker, so a client can reach a backup only through
// a URL signed here after its session (and, for uploads, its primary device)
// was checked. The token carries everything the transfer needs; it is an
// HMAC over its own payload, so it cannot be altered or reused past `exp`.

const encoder = new TextEncoder();

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64url(text: string): Uint8Array {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function hmacKey(secret: string, purpose: string): Promise<CryptoKey> {
  // A key per purpose, so an upload token can never pass as a download one.
  const material = await crypto.subtle.digest('SHA-256', encoder.encode(`${purpose}:${secret}`));
  return crypto.subtle.importKey('raw', material, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

export type UploadClaims = {
  /** Backup id, also the R2 object name. */
  bid: string;
  uid: string;
  did: string;
  size: number;
  sha256: string;
  schemaVersion: number;
  appVersion: string | null;
  exportedAt: string | null;
  exp: number;
};

export type DownloadClaims = { uid: string; key: string; sha256: string; exp: number };

export async function signToken<T extends { exp: number }>(
  secret: string,
  purpose: 'upload' | 'download',
  claims: T,
): Promise<string> {
  const payload = base64url(encoder.encode(JSON.stringify(claims)));
  const key = await hmacKey(secret, purpose);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(payload)));
  return `${payload}.${base64url(signature)}`;
}

export async function verifyToken<T extends { exp: number }>(
  secret: string,
  purpose: 'upload' | 'download',
  token: string,
): Promise<T | null> {
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const key = await hmacKey(secret, purpose);
  let valid = false;
  try {
    valid = await crypto.subtle.verify('HMAC', key, fromBase64url(signature), encoder.encode(payload));
  } catch {
    return null;
  }
  if (!valid) return null;
  try {
    const claims = JSON.parse(new TextDecoder().decode(fromBase64url(payload))) as T;
    return claims.exp > Date.now() ? claims : null;
  } catch {
    return null;
  }
}

export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
