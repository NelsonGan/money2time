import React, { useEffect } from 'react';
import { Image, type ImageSourcePropType, StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { LoadingDots } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { withColorAlpha } from '~/utils/color';

import { CLOUD_SYNC_ART } from './art';

interface SyncLoaderProps {
  art?: ImageSourcePropType;
  /** Width of the illustration; the halo and the block's height follow it. */
  width?: number;
  /** Hold still: the offline wait, where nothing is happening. */
  idle?: boolean;
  accessibilityLabel?: string;
}

/**
 * Cloud Sync's loader: the illustration breathing on a soft halo, with the
 * dots under it. It is the same size working or idle, so the text below never
 * moves when the work starts or stops.
 */
export function SyncLoader({
  art = CLOUD_SYNC_ART,
  width = 260,
  idle = false,
  accessibilityLabel,
}: SyncLoaderProps) {
  const colors = useThemeColors();
  const reduceMotion = useReducedMotion();
  const still = idle || reduceMotion;
  const height = width / 2;
  const halo = height * 1.15;
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (still) {
      cancelAnimation(pulse);
      pulse.value = withTiming(0, { duration: 200 });
      return;
    }
    pulse.value = withRepeat(
      withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    return () => cancelAnimation(pulse);
  }, [pulse, still]);

  const haloStyle = useAnimatedStyle(() => ({
    opacity: 0.55 + pulse.value * 0.45,
    transform: [{ scale: 0.9 + pulse.value * 0.12 }],
  }));
  const artStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -pulse.value * 4 }],
  }));

  return (
    <View style={styles.root} accessibilityLabel={accessibilityLabel}>
      <View style={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View
          style={[
            {
              position: 'absolute',
              width: halo * 1.4,
              height: halo,
              borderRadius: halo,
              backgroundColor: withColorAlpha(colors.primary, 0.12),
            },
            haloStyle,
          ]}
        />
        <Animated.View style={artStyle}>
          <Image source={art} style={{ width, height }} resizeMode="contain" accessible={false} />
        </Animated.View>
      </View>
      {/* Kept in the layout while idle, so the text under it stays put. */}
      <View style={styles.dots}>
        {idle ? null : <LoadingDots accessibilityLabel={accessibilityLabel} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', gap: 6 },
  dots: { height: 20, justifyContent: 'center' },
});
