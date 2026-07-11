// Imperative bridge so any screen (e.g. the home-screen scan banner) can ask
// the root shell to open the receipt-review list for a finished scan job,
// without threading navigation through the tab tree. Mirrors
// paywallNavigation.ts. The shell owns the actual navigation + job hand-off.

type Listener = (jobId: string) => void;

const listeners = new Set<Listener>();

export function requestOpenScanReview(jobId: string) {
  listeners.forEach((listener) => listener(jobId));
}

export function subscribeOpenScanReviewRequest(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
