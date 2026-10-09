import type { AddButtonAction } from '~/types';

type Listener = (action: AddButtonAction) => void;

const listeners = new Set<Listener>();

/**
 * Ask the main shell to run one of the + button's entry flows.
 *
 * The iOS Back Tap deep link knows *which* action the user configured but not
 * how to perform it — opening the scan camera or starting a voice capture needs
 * the handles that live in `MainShellScreen`. This is the same listener-registry
 * bridge as `tabNavigation` / `transactionsNavigation`.
 */
export function requestRunAddAction(action: AddButtonAction) {
  listeners.forEach((listener) => listener(action));
}

export function subscribeRunAddAction(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
