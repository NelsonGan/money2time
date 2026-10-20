/** Email Service's send binding; see wrangler.toml `[[send_email]]`. */
export interface EmailBinding {
  send(message: {
    from: string | { email: string; name?: string };
    to: string | { email: string; name?: string };
    subject: string;
    text?: string;
    html?: string;
  }): Promise<{ messageId: string }>;
}

export interface Env {
  MONEY2TIME_D1_CLOUD_BACKUP: D1Database;
  MONEY2TIME_R2_CLOUD_BACKUP: R2Bucket;
  EMAIL: EmailBinding;
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
  COOKIE_DOMAIN: string;
  ALLOWED_ORIGINS: string;
  APP_SCHEME: string;
  EMAIL_FROM: string;
  GOOGLE_CLIENT_IDS: string;
  GOOGLE_CLIENT_SECRET?: string;
  MAX_BACKUP_BYTES: string;
}
