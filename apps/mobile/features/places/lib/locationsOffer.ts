/**
 * The one-time "Turn on Locations?" offer (README: Transaction locations).
 *
 * The first entry the user makes themselves after the feature ships asks for
 * it; `LocationsOfferHost` shows it once the screen is free. It is answered for
 * good the moment it shows (persisted before it is on screen, so a crash or a
 * kill never brings it back), or when the user turns Locations on themselves.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import type { TransactionType } from '~/types';

export const LOCATIONS_OFFER_DONE_KEY = 'm2t.locations.offerDone.v1';

/** Entries the user makes on this phone; not automations, imports or the browser. */
const OFFER_SOURCES = new Set([
  'manual',
  'voice',
  'receipt',
  'notification_review',
  'split',
  'receipt_split',
]);

/** Whether a new entry is one that asks for the offer. */
export function asksForLocationsOffer(
  type: TransactionType,
  source: string | undefined,
  locationsEnabled: boolean,
): boolean {
  if (locationsEnabled) return false;
  if (type !== 'expense' && type !== 'income') return false;
  return OFFER_SOURCES.has(source ?? 'manual');
}

type Listener = () => void;
const listeners = new Set<Listener>();
let pending = false;

/** Asks for the offer (the host shows it when it can, at most once ever). */
export function requestLocationsOffer(): void {
  if (pending) return;
  pending = true;
  listeners.forEach((listener) => listener());
}

export function hasPendingLocationsOffer(): boolean {
  return pending;
}

/** Takes the request; true when there was one. */
export function takePendingLocationsOffer(): boolean {
  const was = pending;
  pending = false;
  return was;
}

export function subscribeLocationsOffer(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

let doneInMemory = false;

/** True once the offer showed, or Locations was turned on (on this install). */
export async function isLocationsOfferDone(): Promise<boolean> {
  if (doneInMemory) return true;
  const stored = await AsyncStorage.getItem(LOCATIONS_OFFER_DONE_KEY).catch(() => null);
  if (stored) doneInMemory = true;
  return doneInMemory;
}

/** Answers the offer for good. Remembered in memory even if storage fails. */
export async function markLocationsOfferDone(): Promise<void> {
  doneInMemory = true;
  pending = false;
  await AsyncStorage.setItem(LOCATIONS_OFFER_DONE_KEY, String(Date.now())).catch(() => undefined);
}

export type LocationsOfferStep =
  /** Nothing asked for it, or it is answered: forget the request. */
  | 'drop'
  /** Asked for, but not now (another prompt, a modal route, the app lock): try again later. */
  | 'wait'
  | 'show';

/** What the host does with a request, given everything that can be in the way. */
export function locationsOfferStep(state: {
  pending: boolean;
  done: boolean;
  locationsEnabled: boolean;
  /** No location support on this device or build. */
  locationUnavailable: boolean;
  /** Main shell settled, no app lock, no onboarding (App.tsx `rootPromptsAllowed`). */
  allowed: boolean;
  appActive: boolean;
  /** Another app-level prompt reported to the coordinator, or this one already up. */
  otherPromptVisible: boolean;
}): LocationsOfferStep {
  if (!state.pending || state.done || state.locationsEnabled || state.locationUnavailable) {
    return 'drop';
  }
  if (!state.allowed || !state.appActive || state.otherPromptVisible) return 'wait';
  return 'show';
}

/** Test-only: forget the request, the listeners and the in-memory answer. */
export function resetLocationsOffer(): void {
  pending = false;
  doneInMemory = false;
  listeners.clear();
}
