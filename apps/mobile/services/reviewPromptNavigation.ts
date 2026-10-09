/**
 * Pub/sub bridge between the review-prompt service (logic + state) and the
 * `<ReviewPrePromptSheet>` UI overlay (renders the happiness check). Lets the
 * service decide *when* to ask without owning a React component or importing
 * navigation.
 */

import type { ReviewPrePromptTrigger } from '~/services/reviewPrompt.shared';

export interface ShowReviewPrePromptRequest {
  trigger: ReviewPrePromptTrigger;
}

type Listener = (request: ShowReviewPrePromptRequest) => void;

const listeners = new Set<Listener>();

/**
 * Notify all current subscribers. Returns the number of listeners that
 * received the request so the caller can decide whether the prompt actually
 * reached UI (e.g. don't emit a SHOWN analytics event if zero listeners exist
 * because the sheet hasn't mounted yet — common when a background task fires
 * before App.tsx has rendered).
 */
export function requestShowReviewPrePrompt(request: ShowReviewPrePromptRequest): number {
  listeners.forEach((listener) => listener(request));
  return listeners.size;
}

export function subscribeShowReviewPrePromptRequest(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
