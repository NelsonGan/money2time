import { sha256 } from 'js-sha256';

/**
 * Shared-secret request signature for the Workers. When a signing key is
 * configured, sign `<timestamp>.<appUserId>` with HMAC-SHA256 and send it
 * alongside the request; the Worker recomputes and validates it (rejecting
 * stale or unsigned calls). Returns no headers when the key is unset so
 * preview/dev builds still work.
 */
export function signingHeaders(appUserId: string): Record<string, string> {
  const key = process.env.EXPO_PUBLIC_REQUEST_SIGNING_KEY?.trim();
  if (!key) return {};
  const timestamp = Date.now().toString();
  const signature = sha256.hmac(key, `${timestamp}.${appUserId}`);
  return { 'X-Timestamp': timestamp, 'X-Signature': signature };
}
