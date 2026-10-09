import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { I18n } from '~/lib/i18n';

const ACTIVE_GREEN = '#22c55e';

/**
 * Small blinking green dot marking the active album (the one new transactions
 * auto-add to) on the album cards in the index list.
 */
export function AlbumActiveDot() {
  const blink = useSharedValue(1);

  useEffect(() => {
    blink.value = withRepeat(
      withTiming(0.25, { duration: 700, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [blink]);

  const dotStyle = useAnimatedStyle(() => ({ opacity: blink.value }));

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={I18n.t('albums.active_badge')}
      className="h-5 w-5 items-center justify-center rounded-full"
      style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
    >
      <Animated.View
        style={[
          dotStyle,
          {
            width: 9,
            height: 9,
            borderRadius: 4.5,
            backgroundColor: ACTIVE_GREEN,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.85)',
          },
        ]}
      />
    </View>
  );
}
