// The shape every scan mode builds: a static instruction block plus the
// per-request variables.
//
// The split exists for provider prompt caching. A provider can only serve a
// cached prefix when the leading bytes of the request are identical to a
// previous one, so every mode keeps its instructions in `system` (identical for
// every user, every scan) and pushes the per-user values — reporting currency,
// category names, account names — into `user`, which sits after the cache
// breakpoint alongside the (always unique) image. Interpolating a currency code
// into the middle of the instructions, as this used to, truncated the shared
// prefix at the first user-specific character and left almost nothing to cache.
export interface ReceiptPrompt {
  /** Static, user-independent instructions. Sent as the system turn, cached. */
  system: string;
  /** Per-request values (currency, categories, accounts). Sent with the image. */
  user: string;
}
