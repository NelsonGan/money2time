/**
 * The Cloud Sync screen's questions, about syncing your own data: Pro for it,
 * Pro across phones, Pro ending, speed. Each has
 * `cloud_sync.faq.items.<key>.q` and `.a` in the locales. The answers restate
 * README.md > Cloud Sync, so change both together.
 */
export const CLOUD_SYNC_FAQ_KEYS = [
  'needs_pro',
  'pro_other_phone',
  'restore_moved_pro',
  'pro_ends',
  'how_fast',
] as const;

export type CloudSyncFaqKey = (typeof CLOUD_SYNC_FAQ_KEYS)[number];

/**
 * The Account page's questions (`settings.account_faq.<key>.q` and `.a`),
 * about the account and what it is for: what signing in does, that it does
 * not sync, Pro, shared ledgers, and signing out or deleting the account.
 */
export const ACCOUNT_FAQ_KEYS = [
  'what',
  'sync',
  'pro',
  'shared_pro',
  'shared_free_limits',
  'family_pro',
  'sign_out_delete',
] as const;
