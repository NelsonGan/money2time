import { useEffect } from 'react';
import { Pressable } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Text } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

interface AlbumActiveBadgeProps {
  /** Called when the badge is tapped — deactivates the album's auto-add. */
  onPress: () => void;
}

/**
 * Blinking "Active" pill shown on the detail screen of the currently active
 * album (the one new transactions auto-add to). Tap to turn auto-add off.
 */
export function AlbumActiveBadge({ onPress }: AlbumActiveBadgeProps) {
  const themeColors = useThemeColors();
  const blink = useSharedValue(1);

  useEffect(() => {
    blink.value = withRepeat(
      withTiming(0.3, { duration: 700, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [blink]);

  const dotStyle = useAnimatedStyle(() => ({ opacity: blink.value }));

  return (
    <Pressable
      onPress={() => {
        void triggerHaptic('selection');
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={I18n.t('albums.active_sheet_title')}
      className="h-10 flex-row items-center gap-1.5 rounded-full bg-primary/15 px-3"
    >
      <Animated.View
        style={[
          dotStyle,
          { width: 8, height: 8, borderRadius: 4, backgroundColor: themeColors.primary },
        ]}
      />
      <Text variant="label" style={{ color: themeColors.primary }}>
        {I18n.t('albums.active_badge')}
      </Text>
    </Pressable>
  );
}
