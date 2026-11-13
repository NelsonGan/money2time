import React from 'react';
import { Pressable } from 'react-native';
import Animated, { type useAnimatedStyle } from 'react-native-reanimated';

const OVER_PHOTO_CHIP = { backgroundColor: 'rgba(0,0,0,0.45)' } as const;

/**
 * One control in a cover-photo header (a goal's, an album's). Over the photo
 * it is a dark translucent circle with a white glyph; once the photo has
 * scrolled past it is the ordinary card chip with a muted glyph. Both layers
 * are rendered and crossfaded by the scroll position rather than swapped at a
 * threshold, so the change follows the finger — and the Pressable underneath
 * never changes, so a press in progress is not interrupted by the transition.
 */
export function HeroHeaderButton({
  onPress,
  accessibilityLabel,
  floatingStyle,
  solidStyle,
  renderIcon,
}: {
  onPress: () => void;
  accessibilityLabel: string;
  floatingStyle: ReturnType<typeof useAnimatedStyle>;
  solidStyle: ReturnType<typeof useAnimatedStyle>;
  renderIcon: (overPhoto: boolean) => React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className="h-10 w-10 items-center justify-center"
    >
      <Animated.View
        style={[floatingStyle, OVER_PHOTO_CHIP]}
        className="absolute inset-0 items-center justify-center rounded-full"
        pointerEvents="none"
      >
        {renderIcon(true)}
      </Animated.View>
      <Animated.View
        style={solidStyle}
        className="absolute inset-0 items-center justify-center rounded-full border border-border/30 bg-card"
        pointerEvents="none"
      >
        {renderIcon(false)}
      </Animated.View>
    </Pressable>
  );
}
