import { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { springToPressIn, springToRest } from '~/constants/motion';

interface UsePressScaleOptions {
  depth?: number;
}

export function usePressScale(options: UsePressScaleOptions = {}) {
  const { depth = 0.96 } = options;
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = springToPressIn(depth);
  };

  const handlePressOut = () => {
    scale.value = springToRest();
  };

  return { animatedStyle, handlePressIn, handlePressOut };
}
