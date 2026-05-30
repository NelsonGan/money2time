/**
 * Web / unsupported-platform fallback for the in-app review prompt.
 *
 * All actions are safe no-ops so the rest of the app can import from
 * `~/services/reviewPrompt` without platform guards.
 */

import type { ReviewPrePromptTrigger, ReviewPromptTrigger } from '~/services/reviewPrompt.shared';

export * from '~/services/reviewPrompt.shared';

export async function initReviewPrompt(): Promise<void> {}

export function recordTransactionLogged(_count: number = 1): void {}

export function recordInsightsView(): void {}

export function recordProPurchase(): void {}

export async function maybeRequestReview(_trigger: ReviewPromptTrigger): Promise<void> {}

export async function handlePrePromptHappy(_trigger: ReviewPrePromptTrigger): Promise<void> {}

export async function handlePrePromptUnhappy(_trigger: ReviewPrePromptTrigger): Promise<void> {}

export async function openFeedbackContact(_trigger: ReviewPrePromptTrigger): Promise<void> {}

export function declineFeedback(_trigger: ReviewPrePromptTrigger): void {}

export async function handlePrePromptDismissed(_trigger: ReviewPrePromptTrigger): Promise<void> {}

export async function openStoreReviewManually(): Promise<void> {}
