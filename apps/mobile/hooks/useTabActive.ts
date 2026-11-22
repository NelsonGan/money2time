import { createContext, useContext } from 'react';

/**
 * Whether the main tab this component lives in is the one on screen. Tabs stay
 * mounted when the user switches away (`MountedTab` in `App.tsx`), so anything
 * timed, like a flash banner that hides itself, needs to know when it is seen.
 * Outside a tab it is always true.
 */
export const TabActiveContext = createContext(true);

export function useTabActive(): boolean {
  return useContext(TabActiveContext);
}
