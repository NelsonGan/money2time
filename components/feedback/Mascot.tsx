import React, { useEffect } from 'react';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { SvgXml } from 'react-native-svg';

import { APP_ICON_SVG } from '~/assets/money2time-icon';

interface MascotProps {
  size?: number;
  mood?: string;
  animate?: boolean;
}

export function Mascot({ size = 80, animate = true }: MascotProps) {
  const bounce = useSharedValue(0);

  useEffect(() => {
    if (!animate) {
      bounce.value = 0;
      return () => undefined;
    }

    bounce.value = withRepeat(
      withSequence(withTiming(-4, { duration: 1000 }), withTiming(0, { duration: 1000 })),
      -1,
      true,
    );

    return () => {
      cancelAnimation(bounce);
      bounce.value = 0;
    };
  }, [animate, bounce]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bounce.value }],
  }));

  return (
    <Animated.View style={[{ width: size, height: size }, animate ? animatedStyle : undefined]}>
      <SvgXml xml={APP_ICON_SVG} width={size} height={size} />
    </Animated.View>
  );
}
