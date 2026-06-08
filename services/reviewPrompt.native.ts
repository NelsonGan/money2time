/**
 * Native in-app review prompt service.
 *
 * Two-stage flow:
 *  1. Eligibility gate (silent — counters + cooldown live in AsyncStorage).
 *  2. Pre-prompt happiness check (rendered by `<ReviewPrePromptSheet>` via
 *     `requestShowReviewPrePrompt()`). 😍 → cooldown stamped + native OS
 *     review UI. 😞 → cooldown stamped + the sheet shows a follow-up where
 *     the user can opt in to opening the contact URL (we never auto-open the
 *     browser). Backdrop / "Maybe later" → cooldown stamped, nothing else.
 *
 * Pure eligibility logic lives in `./reviewPrompt.shared.ts` for testability.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as StoreReview from 'expo-store-review';
import { Linking, Platform } from 'react-native';

import { AnalyticsEvents, trackEvent } from '~/services/analytics';
import {
  checkEligibility,
  createInitialState,
  markPrompted,
  MIN_TRANSACTIONS,
  parseStoredState,
  recordActivity,
  reconcileVersion,
  REVIEW_PROMPT_STORAGE_KEY,
  type ReviewPrePromptTrigger,
  type ReviewPromptState,
  type ReviewPromptTrigger,
} from '~/services/reviewPrompt.shared';
import { requestShowReviewPrePrompt } from '~/services/reviewPromptNavigation';

export * from '~/services/reviewPrompt.shared';

const APP_STORE_URL = 'https://apps.apple.com/app/id6760418898?action=write-review';
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.nelsongan.money2time';
const CONTACT_URL = 'https://www.money2time.com/contact';

function getAppVersion(): string {
  return Constants.expoConfig?.version ?? '0.0.0';
}

let cache: ReviewPromptState | null = null;
let hydrating: Promise<ReviewPromptState> | null = null;
let writeChain: Promise<void> = Promise.resolve();
// Serializes read-modify-write so two concurrent recordX() calls can't both
// read the same cache snapshot and clobber each other's increment.
let updateChain: Promise<unknown> = Promise.resolve();

async function hydrate(): Promise<ReviewPromptState> {
  if (cache) return cache;
  if (hydrating) return hydrating;

  hydrating = (async () => {
    const now = new Date();
    const appVersion = getAppVersion();
    try {
      const raw = await AsyncStorage.getItem(REVIEW_PROMPT_STORAGE_KEY);
      const parsed = parseStoredState(raw);
      const initial = parsed ?? createInitialState(now, appVersion);
      const reconciled = reconcileVersion(initial, now, appVersion);
      cache = reconciled;
      if (!parsed || reconciled !== initial) {
        await persist(reconciled);
      }
      return reconciled;
    } catch {
      cache = createInitialState(now, appVersion);
      return cache;
    } finally {
      hydrating = null;
    }
  })();

  return hydrating;
}

async function persist(state: ReviewPromptState): Promise<void> {
  writeChain = writeChain
    .catch(() => undefined)
    .then(() => AsyncStorage.setItem(REVIEW_PROMPT_STORAGE_KEY, JSON.stringify(state)));
  return writeChain;
}

function update(
  producer: (current: ReviewPromptState) => ReviewPromptState,
): Promise<ReviewPromptState> {
  const result = updateChain.then(async () => {
    const current = await hydrate();
    const next = producer(current);
    if (next === current) return current;
    cache = next;
    void persist(next);
    return next;
  });
  updateChain = result.catch(() => undefined);
  return result;
}

async function stampCooldown(): Promise<void> {
  const now = new Date();
  const appVersion = getAppVersion();
  await update((current) => markPrompted(current, now, appVersion));
}

export async function initReviewPrompt(): Promise<void> {
  await hydrate();
}

async function bumpAndMaybeRequest(
  trigger: ReviewPromptTrigger,
  producer: (state: ReviewPromptState) => ReviewPromptState,
  shouldTry: (state: ReviewPromptState) => boolean,
): Promise<void> {
  const now = new Date();
  const next = await update((current) => recordActivity(producer(current), now));
  if (!shouldTry(next)) return;
  await maybeRequestReview(trigger);
}

export function recordTransactionLogged(count: number = 1): void {
  void bumpAndMaybeRequest(
    'transaction_milestone',
    (state) => ({ ...state, transactionCount: state.transactionCount + count }),
    // Fire once per checkpoint crossing rather than on exact multiples, so a
    // bulk jump (e.g. an import from 14 → 16) still trips the 15 checkpoint
    // instead of skipping it.
    (state) => {
      const previous = state.transactionCount - count;
      const crossedCheckpoint =
        Math.floor(state.transactionCount / MIN_TRANSACTIONS) >
        Math.floor(previous / MIN_TRANSACTIONS);
      return state.transactionCount >= MIN_TRANSACTIONS && crossedCheckpoint;
    },
  );
}

export function recordInsightsView(): void {
  void bumpAndMaybeRequest(
    'insights_view',
    (state) => ({ ...state, insightsViewsCount: state.insightsViewsCount + 1 }),
    (state) => state.insightsViewsCount === 5 || state.insightsViewsCount % 25 === 0,
  );
}

export function recordProPurchase(): void {
  void bumpAndMaybeRequest(
    'pro_purchase',
    (state) => state,
    () => true,
  );
}

export async function maybeRequestReview(trigger: ReviewPromptTrigger): Promise<void> {
  const now = new Date();
  const appVersion = getAppVersion();
  const state = await hydrate();
  const verdict = checkEligibility({ state, now, appVersion });
  if (!verdict.eligible) {
    void trackEvent(AnalyticsEvents.REVIEW_PROMPT_SKIPPED, {
      trigger,
      reason: verdict.reason,
    });
    return;
  }

  const available = await StoreReview.isAvailableAsync().catch(() => false);
  if (!available) {
    void trackEvent(AnalyticsEvents.REVIEW_PROMPT_SKIPPED, {
      trigger,
      reason: 'native_unavailable',
    });
    return;
  }

  emitShownIfDelivered(trigger);
}

/**
 * Emit the SHOWN analytics event only if a sheet subscriber actually received
 * the request. Without this guard, an early-app-life trigger (e.g. a
 * background-task backup completing before App.tsx mounts) would log a fake
 * "shown" with no UI ever rendered.
 */
function emitShownIfDelivered(trigger: ReviewPrePromptTrigger): void {
  const delivered = requestShowReviewPrePrompt({ trigger });
  if (delivered > 0) {
    void trackEvent(AnalyticsEvents.REVIEW_PREPROMPT_SHOWN, { trigger });
  }
}

// ---------------------------------------------------------------------------
// Pre-prompt outcome handlers — called by <ReviewPrePromptSheet>
// ---------------------------------------------------------------------------

/** User picked 😍. Stamp the cooldown and ask the OS to show the review UI. */
export async function handlePrePromptHappy(trigger: ReviewPrePromptTrigger): Promise<void> {
  void trackEvent(AnalyticsEvents.REVIEW_PREPROMPT_HAPPY, { trigger });
  await stampCooldown();

  const available = await StoreReview.isAvailableAsync().catch(() => false);
  if (available) {
    try {
      await StoreReview.requestReview();
      return;
    } catch {
      // fall through to the store URL
    }
  }

  const url = Platform.OS === 'ios' ? APP_STORE_URL : PLAY_STORE_URL;
  try {
    await Linking.openURL(url);
  } catch {
    // nothing more we can do
  }
}

/** User picked 😞. Stamp the cooldown and emit analytics; the sheet then
 *  surfaces a follow-up where the user can opt in to opening the contact
 *  page or back out — we never auto-open the browser on them. */
export async function handlePrePromptUnhappy(trigger: ReviewPrePromptTrigger): Promise<void> {
  void trackEvent(AnalyticsEvents.REVIEW_PREPROMPT_UNHAPPY, { trigger });
  await stampCooldown();
}

/** Follow-up: user explicitly chose to share feedback. Open the contact URL. */
export async function openFeedbackContact(trigger: ReviewPrePromptTrigger): Promise<void> {
  void trackEvent(AnalyticsEvents.REVIEW_PREPROMPT_FEEDBACK_OPENED, { trigger });
  try {
    await Linking.openURL(CONTACT_URL);
  } catch {
    // user can still navigate manually if Linking failed
  }
}

/** Follow-up: user declined to share feedback after picking 😞. */
export function declineFeedback(trigger: ReviewPrePromptTrigger): void {
  void trackEvent(AnalyticsEvents.REVIEW_PREPROMPT_FEEDBACK_DECLINED, { trigger });
}

/** User dismissed the sheet without choosing. Stamp the cooldown anyway so we
 *  don't pester them again for 90 days. */
export async function handlePrePromptDismissed(trigger: ReviewPrePromptTrigger): Promise<void> {
  void trackEvent(AnalyticsEvents.REVIEW_PREPROMPT_DISMISSED, { trigger });
  await stampCooldown();
}

export async function openStoreReviewManually(): Promise<void> {
  void trackEvent(AnalyticsEvents.REVIEW_PROMPT_MANUAL_OPENED);
  emitShownIfDelivered('manual');
}
