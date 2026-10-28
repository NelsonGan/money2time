// AES-GCM encryption for tokens kept in D1 (Apple refresh tokens, Turso
// database tokens). The key is derived from BETTER_AUTH_SECRET and a purpose
// label, so rotating that secret makes stored tokens unreadable: Turso tokens
// are then minted again, but Apple tokens can no longer be revoked.

import type { Env } from './env';

export type SecretPurpose = 'apple-refresh-token' | 'turso-token' | 'invite-code';

async function keyFor(env: Env, purpose: SecretPurpose): Promise<CryptoKey> {
  const material = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${env.BETTER_AUTH_SECRET}:${purpose}`),
  );
  return crypto.subtle.importKey('raw', material, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

/** `<iv>.<ciphertext>`, both base64. */
export async function seal(env: Env, purpose: SecretPurpose, text: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await keyFor(env, purpose),
    new TextEncoder().encode(text),
  );
  return `${toBase64(iv)}.${toBase64(new Uint8Array(sealed))}`;
}

/** The plain text, or null when the value cannot be opened with the current key. */
export async function open(
  env: Env,
  purpose: SecretPurpose,
  stored: string,
): Promise<string | null> {
  const [iv, sealed] = stored.split('.');
  if (!iv || !sealed) return null;
  try {
    const opened = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(iv) },
      await keyFor(env, purpose),
      fromBase64(sealed),
    );
    return new TextDecoder().decode(opened);
  } catch {
    return null;
  }
}
