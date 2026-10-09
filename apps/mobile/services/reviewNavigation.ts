import { isReviewZoom, type ReviewZoom } from '~/features/review/lib/reviewPeriods';

type Listener = (zoom: ReviewZoom) => void;

const listeners = new Set<Listener>();

// Mirrors `insightsNavigation`: a review reminder tapped from a cold start
// fires this request before the Insights tab has mounted, so the most recent
// one is held until a listener shows up to claim it.
let pendingZoom: ReviewZoom | null = null;

/**
 * Asks the review page to open at a given zoom (from a notification tap).
 *
 * When a listener is already mounted the request is delivered live and any
 * buffered one is dropped: a zoom held from a tap the user never followed up on
 * must not resurface days later and silently move the page under them.
 */
export function requestReviewZoom(zoom: ReviewZoom) {
  pendingZoom = listeners.size === 0 ? zoom : null;
  listeners.forEach((listener) => listener(zoom));
}

/** Reads and clears any request that fired before the listener mounted. */
export function consumePendingReviewZoom(): ReviewZoom | null {
  const value = pendingZoom;
  pendingZoom = null;
  return value;
}

export function subscribeReviewZoomRequest(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Narrows an untrusted deep-link `zoom` param. */
export function parseReviewZoomParam(value: string | undefined): ReviewZoom | null {
  return isReviewZoom(value) ? value : null;
}
