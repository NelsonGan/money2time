import type { NotificationReviewSelection } from '~/services/notificationReview';

type Selections = Record<string, NotificationReviewSelection>;

/**
 * The leave prompt's button order. A mis-tap must never land on Ignore, so
 * Cancel always sits between it and Review later. iOS moves Cancel last and
 * keeps the rest in order; Android takes three buttons as neutral, negative and
 * positive (stacked top to bottom as positive, negative, neutral).
 */
export function leavePromptButtons<T>(
  platform: string,
  buttons: { cancel: T; later: T; ignore: T },
): T[] {
  const { cancel, later, ignore } = buttons;
  return platform === 'android' ? [ignore, cancel, later] : [cancel, later, ignore];
}

// Amount and account picks on To review cards, kept for this app session so
// Review later does not throw them away. Keyed by user and history generation:
// a data reset starts a new generation and leaves old picks behind.
const remembered = new Map<string, Selections>();
const keyOf = (appUserId: string, generation: number) => `${appUserId}:${generation}`;

export function rememberedReviewSelections(appUserId: string, generation: number): Selections {
  return { ...remembered.get(keyOf(appUserId, generation)) };
}

/** Saves the picks for items still pending; decided ones are dropped. */
export function rememberReviewSelections(
  appUserId: string,
  generation: number,
  selections: Readonly<Selections>,
  pendingIds: readonly string[],
): void {
  const kept: Selections = {};
  for (const id of pendingIds) if (selections[id]) kept[id] = selections[id];
  remembered.clear();
  if (Object.keys(kept).length > 0) remembered.set(keyOf(appUserId, generation), kept);
}

/** Test seam. */
export function forgetReviewSelections(): void {
  remembered.clear();
}
