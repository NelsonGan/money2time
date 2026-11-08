import { requestOpenTab } from '~/services/tabNavigation';

type FocusInsightRequest = {
  insightType: string;
};

type Listener = (request: FocusInsightRequest) => void;

const listeners = new Set<Listener>();

// Holds the most recent request so a tab that mounts *after* the request fires
// (e.g. cold-start from a widget tap) can still pick it up on mount.
let pendingInsightType: string | null = null;

export function requestFocusInsight(insightType: string) {
  if (listeners.size === 0) pendingInsightType = insightType;
  listeners.forEach((listener) => listener({ insightType }));
}

/** Reads and clears any focus request that fired before the listener mounted. */
export function consumePendingFocusInsight(): string | null {
  const value = pendingInsightType;
  pendingInsightType = null;
  return value;
}

export function subscribeFocusInsightRequest(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Open the Budget page: an Insights page, so the Insights tab focused on it. */
export function requestOpenBudget() {
  requestOpenTab('insights');
  requestFocusInsight('budget');
}
