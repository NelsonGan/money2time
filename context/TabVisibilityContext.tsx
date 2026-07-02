import React, { createContext, useContext, useState } from 'react';

/**
 * Whether the enclosing shell tab is currently the visible one. The five main
 * tabs stay mounted for the app's lifetime (see MountedTab in App.tsx), so
 * without this signal every hidden tab pays full recomputation for data
 * changes it isn't showing — most painfully the calendar/insights memo chains
 * re-deriving from the whole transaction list on every write.
 *
 * Defaults to `true` so screens rendered outside the tab shell (root-stack
 * editors, drilldowns) behave as always-visible.
 */
const TabVisibilityContext = createContext(true);

export function TabVisibilityProvider({
  visible,
  children,
}: {
  visible: boolean;
  children: React.ReactNode;
}) {
  return <TabVisibilityContext.Provider value={visible}>{children}</TabVisibilityContext.Provider>;
}

export function useTabVisible() {
  return useContext(TabVisibilityContext);
}

/**
 * Returns `value` while the enclosing tab is visible; while hidden, keeps
 * returning the last value seen when visible, so downstream memo chains stay
 * cached instead of recomputing on every background data change. The screen
 * catches up in a single recompute when its tab becomes visible again.
 */
export function useValueWhileTabVisible<T>(value: T): T {
  const visible = useTabVisible();
  const [held, setHeld] = useState(value);
  if (visible && held !== value) {
    // Render-phase state adjustment: React restarts this component's render
    // with the fresh value immediately, without an extra commit.
    setHeld(value);
  }
  return visible ? value : held;
}
