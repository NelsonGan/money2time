export interface Env {
  MONEY2TIME_D1_CLOUD_BACKUP: D1Database;
  MONEY2TIME_R2_CLOUD_BACKUP: R2Bucket;
  /** Public base URL the signed upload/download URLs are built on. */
  PUBLIC_URL: string;
  /** Signs the short-lived upload and download URLs. */
  URL_SIGNING_SECRET: string;
  /** Browser origins allowed to call the API (the web dashboard). */
  ALLOWED_ORIGINS: string;
  MAX_BACKUP_BYTES: string;
  ENTITLEMENT_ID: string;
  REVENUECAT_SECRET_KEY?: string;
}
