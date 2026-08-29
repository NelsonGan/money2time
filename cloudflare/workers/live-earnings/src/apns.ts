/**
 * APNs client for Live Activity updates.
 *
 * A Live Activity push is not a notification. It shows no banner, plays no
 * sound, never reaches Notification Center, and - the part that makes this
 * feature possible at all - it does NOT require the user to have granted
 * notification permission: Live Activity delivery is independent of an app's
 * notification settings. It is a silent data channel to one card.
 *
 * Auth is a JWT signed with the ES256 .p8 key rather than a certificate.
 * Apple requires the token to be refreshed at least hourly and refuses one
 * regenerated more often than every ~20 minutes (TooManyProviderTokenUpdates),
 * so it is cached per isolate for 50 minutes - comfortably inside both bounds.
 */

export interface ApnsCredentials {
  keyId: string;
  teamId: string;
  /** Contents of the .p8, PEM including the BEGIN/END lines. */
  privateKeyPem: string;
  /** The app bundle id, WITHOUT the Live Activity topic suffix. */
  bundleId: string;
}

/** Development builds get tokens only the sandbox gateway will accept. */
export type ApnsEnvironment = 'sandbox' | 'production';

const HOST: Record<ApnsEnvironment, string> = {
  production: 'api.push.apple.com',
  sandbox: 'api.sandbox.push.apple.com',
};

const TOKEN_TTL_MS = 50 * 60 * 1000;

let cachedToken: { jwt: string; issuedAt: number; keyId: string } | null = null;

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlFromString(value: string): string {
  return base64Url(new TextEncoder().encode(value));
}

/** Strips the PEM armour and decodes the base64 body to raw PKCS#8 bytes. */
function decodePkcs8(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function providerToken(credentials: ApnsCredentials, now: number): Promise<string> {
  if (
    cachedToken &&
    cachedToken.keyId === credentials.keyId &&
    now - cachedToken.issuedAt < TOKEN_TTL_MS
  ) {
    return cachedToken.jwt;
  }

  const issuedAt = Math.floor(now / 1000);
  const header = base64UrlFromString(
    JSON.stringify({ alg: 'ES256', kid: credentials.keyId, typ: 'JWT' }),
  );
  const claims = base64UrlFromString(JSON.stringify({ iss: credentials.teamId, iat: issuedAt }));
  const signingInput = `${header}.${claims}`;

  const key = await crypto.subtle.importKey(
    'pkcs8',
    decodePkcs8(credentials.privateKeyPem),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  // WebCrypto returns the raw r||s pair, which is exactly what JWS ES256 wants
  // (a DER-wrapped signature would be rejected).
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(signingInput),
  );

  const jwt = `${signingInput}.${base64Url(new Uint8Array(signature))}`;
  cachedToken = { jwt, issuedAt: now, keyId: credentials.keyId };
  return jwt;
}

/** Forces the next push to mint a fresh JWT. Used when APNs rejects the token. */
export function invalidateProviderToken(): void {
  cachedToken = null;
}

export interface LiveActivityContentState {
  earnedText: string;
  earned: number;
  /**
   * Epoch **milliseconds**, matching the app's `ContentState.asOfMillis`.
   *
   * It is a plain number on both sides on purpose. A pushed `content-state` is
   * decoded by a JSONDecoder with default strategies, and the default for a
   * Swift `Date` is `deferredToDate` - seconds since the 2001 reference date.
   * A Unix timestamp sent into a `Date` field decodes happily and lands 31
   * years in the future, which is the sort of bug that never throws.
   */
  asOfMillis: number;
}

export interface ApnsPushResult {
  ok: boolean;
  status: number;
  /** APNs `reason`, e.g. BadDeviceToken / ExpiredToken / Unregistered. */
  reason?: string;
}

/**
 * Sends one `update` (or `end`) event to a Live Activity push token.
 *
 * `apns-priority` is 10, and that is not the obvious choice - 10 spends the
 * delivery budget faster, and a money figure looks like the "can be delayed
 * slightly" case Apple describes for 5. It is not. Measured on a device with
 * priority 5, APNs accepted every push with a 200 and delivered **two in
 * fifteen minutes**: `apsd` recategorizes a priority-5 topic as
 * `opportunistic` and then batches it at its own convenience. The card went
 * stale, which is the exact bug this whole Worker exists to fix.
 *
 * 10 is what `NSSupportsLiveActivitiesFrequentUpdates` is for. The budget is
 * protected instead by not sending pointless pushes: the cron skips a tick
 * whose formatted figure is identical to the last one delivered.
 */
export async function pushLiveActivity(args: {
  credentials: ApnsCredentials;
  environment: ApnsEnvironment;
  pushToken: string;
  state: LiveActivityContentState;
  /** Epoch seconds after which iOS should mark the card stale. */
  staleAt: number;
  event: 'update' | 'end';
  /** Epoch ms. Injected so the JWT cache and `timestamp` are testable. */
  now: number;
}): Promise<ApnsPushResult> {
  const { credentials, environment, pushToken, state, staleAt, event, now } = args;
  const jwt = await providerToken(credentials, now);

  const aps: Record<string, unknown> = {
    timestamp: Math.floor(now / 1000),
    event,
    'content-state': {
      earnedText: state.earnedText,
      earned: state.earned,
      asOfMillis: state.asOfMillis,
    },
    'stale-date': staleAt,
  };
  // Let the finished card linger briefly rather than vanish mid-glance.
  if (event === 'end') aps['dismissal-date'] = Math.floor(now / 1000) + 60;

  const response = await fetch(`https://${HOST[environment]}/3/device/${pushToken}`, {
    method: 'POST',
    headers: {
      authorization: `bearer ${jwt}`,
      'apns-topic': `${credentials.bundleId}.push-type.liveactivity`,
      'apns-push-type': 'liveactivity',
      'apns-priority': '10',
      'apns-expiration': String(Math.floor(now / 1000) + 300),
      'content-type': 'application/json',
    },
    body: JSON.stringify({ aps }),
  });

  if (response.status === 200) return { ok: true, status: 200 };

  let reason: string | undefined;
  try {
    reason = ((await response.json()) as { reason?: string }).reason;
  } catch {
    // APNs always sends JSON on error, but never let a parse failure mask the
    // status code the caller needs to decide on.
  }
  // A rejected provider token is the one failure a retry can fix, so drop the
  // cached JWT and let the next tick mint a new one.
  if (response.status === 403) invalidateProviderToken();
  return { ok: false, status: response.status, reason };
}

/**
 * Which failures mean the token is dead and the row should go.
 *
 * `Unregistered` and `BadDeviceToken` are terminal: the activity ended, the
 * app was removed, or the token belongs to the other APNs environment. Anything
 * else (429, 5xx, a network blip) is transient and the row is left for the next
 * minute's tick.
 */
export function isTerminalPushFailure(result: ApnsPushResult): boolean {
  if (result.ok) return false;
  if (result.status === 410) return true;
  return (
    result.reason === 'Unregistered' ||
    result.reason === 'BadDeviceToken' ||
    result.reason === 'DeviceTokenNotForTopic' ||
    result.reason === 'TopicDisallowed'
  );
}
