/**
 * Auto-tagging what an automation saved (README: Transaction locations >
 * Automations). An Apple Pay tap, a payment alert or a Back Tap / shared
 * screenshot is saved by the app when it next runs, not where the user paid,
 * and the app has "while using the app" location only. So an automation's
 * expense is tagged with where the phone is only when the payment was moments
 * ago: the app saw it within `AUTOMATION_TAG_MAX_AGE_MS` of when it happened,
 * on the same day. Anything older stays untagged rather than tagged with the
 * wrong place (the sofa, hours after the coffee).
 *
 * `createTransaction` asks with `requestAutomationTag` once the entry is
 * saved; `AutomationTagHost` takes the requests, gets one fix and writes it.
 */

import { dayKeyFromIsoLocal } from '~/utils/formatters';
import { localDayOfTime } from '~/utils/localDate';

/** How long after a payment the phone is still taken to be where it happened. */
export const AUTOMATION_TAG_MAX_AGE_MS = 10 * 60 * 1000;
/** A payment stamped this far ahead of the phone's clock still counts as now. */
const FUTURE_SKEW_MS = 2 * 60 * 1000;

export interface AutomationTagRequest {
  transactionId: string;
  /** When the automation saw the payment (the tap, the alert, the screenshot). */
  occurredAt: string;
}

export interface AutomationTagTarget {
  type: string;
  date: string;
  /** Already has a place (or the save named one): never touched. */
  located: boolean;
  deleted: boolean;
}

/**
 * Whether an automation's entry gets the phone's place now: both switches on,
 * an expense dated today with no place, and the payment moments ago.
 */
export function shouldAutomationTag(
  target: AutomationTagTarget,
  occurredAt: string,
  settings: { locationsEnabled: boolean; autoTag: boolean },
  now: number = Date.now(),
): boolean {
  if (!settings.locationsEnabled || !settings.autoTag) return false;
  if (target.deleted || target.located || target.type !== 'expense') return false;
  const at = Date.parse(occurredAt);
  if (!Number.isFinite(at)) return false;
  const age = now - at;
  if (age > AUTOMATION_TAG_MAX_AGE_MS || age < -FUTURE_SKEW_MS) return false;
  // Dated today, as the editor's own tag: a payment read as yesterday's (a
  // screenshot of an older receipt, a backdated alert) was not paid here.
  return dayKeyFromIsoLocal(target.date) === localDayOfTime(now).dayKey;
}

type Listener = () => void;
const listeners = new Set<Listener>();
let queue: AutomationTagRequest[] = [];

/** Asks the host to tag a just-saved automation entry, if it qualifies. */
export function requestAutomationTag(request: AutomationTagRequest): void {
  queue.push(request);
  listeners.forEach((listener) => listener());
}

/** Takes every waiting request. */
export function takeAutomationTagRequests(): AutomationTagRequest[] {
  const taken = queue;
  queue = [];
  return taken;
}

export function subscribeAutomationTag(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test-only: forget the queue and the listeners. */
export function resetAutomationTag(): void {
  queue = [];
  listeners.clear();
}
