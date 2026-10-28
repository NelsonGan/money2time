export interface Env {
  /** Better Auth tables plus this Worker's own (apps/cloudflare/d1/cloud-sync/schema.sql). */
  AUTH_DB: D1Database;
  /** The user's images, under `u/<userId>/<asset path>`. Private: only this Worker reads it. */
  MEDIA: R2Bucket;
  /** Cloudflare Email Service, for the sign-in codes. */
  EMAIL?: SendEmail;
  /** POSTs to /api/auth per client IP. */
  AUTH_LIMITER?: RateLimit;
  /** Sign-in codes per recipient address. */
  OTP_LIMITER?: RateLimit;

  /** Public origin of this Worker, e.g. https://workers-cloud-sync.money2time.com. */
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;

  /** Comma-separated Google OAuth client ids whose ID tokens are accepted (iOS, Android, web). */
  GOOGLE_CLIENT_IDS: string;
  /** Comma-separated Apple audiences: the iOS bundle id, plus a Services ID if web sign-in is added. */
  APPLE_CLIENT_IDS: string;
  APPLE_APP_BUNDLE_IDENTIFIER: string;
  /** Sign in with Apple key, for revoking a user's Apple tokens on account deletion. */
  APPLE_TEAM_ID?: string;
  APPLE_KEY_ID?: string;
  /** The key's .p8 contents (PKCS#8 PEM). Secret. */
  APPLE_PRIVATE_KEY?: string;

  /** Sender for sign-in codes, on a domain onboarded to Email Service. */
  EMAIL_FROM: string;

  REVENUECAT_ENTITLEMENT_ID: string;
  /** RevenueCat secret key (sk_…). Optional: without it the public app keys below are used. */
  REVENUECAT_SECRET_KEY?: string;
  /** Comma-separated RevenueCat public SDK keys (appl_…, goog_…), asked together. */
  REVENUECAT_PUBLIC_KEYS?: string;

  /** Turso organization slug and group for the per-user databases. */
  TURSO_ORG: string;
  TURSO_GROUP: string;
  TURSO_API_TOKEN?: string;
  /**
   * Local development only: hand every user this sync server (`tursodb … --sync-server`)
   * instead of a Turso Cloud database. Never set in production.
   */
  LOCAL_SYNC_URL?: string;
  /** Local development only, and only with LOCAL_SYNC_URL: every account counts as Pro. */
  DEV_ASSUME_PRO?: string;
}

export function csv(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}
