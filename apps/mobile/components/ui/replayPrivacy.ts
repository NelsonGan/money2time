import { NavigationContext } from '@react-navigation/native';
import { useContext, useEffect, useLayoutEffect, useState } from 'react';

import { pauseSessionReplay } from '~/services/analytics';

/**
 * Session replay privacy marker for PostHog's native recorder.
 *
 * Replays mask every text and input (the user's amounts, notes and names are
 * text), but show images, so icons, logos and illustrations stay readable.
 * Pictures the user supplied are their information, not app chrome: spread
 * `REPLAY_PRIVATE` onto any image or view that shows one (receipts, the profile
 * photo, album and goal covers, uploaded logos and icons, payment QR codes, the
 * camera) and the recorder paints over it. Charts get it too: their shapes are
 * the user's money. So does any number drawn outside a `Text` (SVG or canvas
 * text), which the text masking does not reach.
 *
 * The recorder looks for `ph-no-capture` in the view's accessibility identifier
 * on iOS and its tag on Android, and `testID` sets both. It is not an
 * accessibility label, so screen readers never announce it. A view that needs
 * its own `testID` would replace the marker: wrap it in a `View` carrying the
 * marker instead.
 */
export const REPLAY_PRIVATE = { testID: 'ph-no-capture' } as const;

/**
 * Pause the recording while the calling number pad can be tapped. Recordings
 * keep tap positions, and on the app's own number pads a tap's position is
 * the digit typed, so each pad calls this; the recording resumes in the same
 * session when the pad goes. `onScreen` is for a pad that stays mounted while
 * hidden (collapsed, or under a modal); a pad whose screen loses navigation
 * focus to another one stops pausing by itself. A new view that takes digits
 * on custom keys must call it too. System keyboards draw in their own window
 * and need nothing.
 */
export function usePauseSessionReplay(onScreen = true): void {
  const focused = useScreenFocused();
  const paused = onScreen && focused;
  // Before paint: the native stop is asynchronous, so start it as early as possible.
  useLayoutEffect(() => (paused ? pauseSessionReplay() : undefined), [paused]);
}

/** Whether the screen around the caller has navigation focus; true outside a navigator. */
function useScreenFocused(): boolean {
  const navigation = useContext(NavigationContext);
  const [focused, setFocused] = useState(() => navigation?.isFocused() ?? true);
  useEffect(() => {
    if (!navigation) return undefined;
    setFocused(navigation.isFocused());
    const offFocus = navigation.addListener('focus', () => setFocused(true));
    const offBlur = navigation.addListener('blur', () => setFocused(false));
    return () => {
      offFocus();
      offBlur();
    };
  }, [navigation]);
  return focused;
}
