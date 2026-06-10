import { useContext } from 'react';
import { BottomTabBarHeightContext } from 'react-native-bottom-tabs';

/**
 * Extra bottom padding a tab screen's scroll content needs so it isn't hidden
 * behind the translucent native tab bar (iOS). Content extends edge-to-edge
 * under the bar inside the native tab controller, so scrollables must pad past
 * its measured height. Zero on Android (bar sits in normal layout flow below
 * the content) and outside the tab shell (root-stack screens have no bar), so
 * the same screen component can render in every context.
 */
export function useBottomNavContentInset(): number {
  return useContext(BottomTabBarHeightContext) ?? 0;
}
