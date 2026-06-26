type Listener = () => void;

const goToTodayListeners = new Set<Listener>();

/**
 * Ask the mounted CalendarScreen to jump back to today. Fired by the floating
 * "Today" pill, which lives at the shell root (next to the Add button) rather
 * than inside CalendarScreen so it shares the Add button's proven bottom-anchor
 * positioning context.
 */
export function requestCalendarGoToToday() {
  goToTodayListeners.forEach((listener) => listener());
}

export function subscribeCalendarGoToToday(listener: Listener) {
  goToTodayListeners.add(listener);
  return () => {
    goToTodayListeners.delete(listener);
  };
}
