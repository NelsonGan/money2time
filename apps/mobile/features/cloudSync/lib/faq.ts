/**
 * The Cloud Sync screen's questions, in the order people meet them: signing
 * in, Pro across phones, Pro ending, speed, shared ledgers, signing out. Each
 * has `cloud_sync.faq.items.<key>.q` and `.a` in the locales. The answers
 * restate README.md > Cloud Sync, so change both together.
 */
export const CLOUD_SYNC_FAQ_KEYS = [
  'sign_in_without_pro',
  'pro_other_phone',
  'restore_moved_pro',
  'pro_ends',
  'how_fast',
  'shared_pro',
  'shared_free_limits',
  'family_pro',
  'sign_out_delete',
] as const;

export type CloudSyncFaqKey = (typeof CLOUD_SYNC_FAQ_KEYS)[number];
