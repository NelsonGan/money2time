import type { RevenueCatCustomerState } from './revenueCat.shared';

/**
 * Coordinates background reads with authoritative purchase/restore/listener updates.
 *
 * `onKnown` reports whether Pro status has been settled for the current
 * identity. It is false until the first read completes (a failed read counts:
 * there is nothing better coming) or an authoritative update arrives, and goes
 * false again on an identity reset. Until then `isPro` is a `false`
 * placeholder, which must not drive anything that refuses a Pro user.
 */
export function createProCustomerStateRefresh(
  fetchState: () => Promise<RevenueCatCustomerState | null>,
  onState: (state: RevenueCatCustomerState | null) => void,
  onKnown: (known: boolean) => void = () => {},
) {
  let revision = 0;
  return {
    apply(state: RevenueCatCustomerState | null) {
      revision += 1;
      onState(state);
      // Only an identity reset applies null.
      onKnown(state !== null);
    },
    async refresh() {
      const requestRevision = ++revision;
      const state = await fetchState();
      if (requestRevision !== revision) return;
      // null means unavailable/failed, not a confirmed absence of Pro.
      if (state !== null) onState(state);
      onKnown(true);
    },
  };
}
