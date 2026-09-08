import type { RevenueCatCustomerState } from './revenueCat.shared';

/** Coordinates background reads with authoritative purchase/restore/listener updates. */
export function createProCustomerStateRefresh(
  fetchState: () => Promise<RevenueCatCustomerState | null>,
  onState: (state: RevenueCatCustomerState | null) => void,
) {
  let revision = 0;
  return {
    apply(state: RevenueCatCustomerState | null) {
      revision += 1;
      onState(state);
    },
    async refresh() {
      const requestRevision = ++revision;
      const state = await fetchState();
      // null means unavailable/failed, not a confirmed absence of Pro.
      if (requestRevision === revision && state !== null) {
        onState(state);
      }
    },
  };
}
