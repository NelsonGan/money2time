import { Plus } from 'lucide-react-native';
import React, { useCallback } from 'react';
import { Pressable } from 'react-native';
import Animated from 'react-native-reanimated';

import { ClayIcon } from '~/components/ui/ClayIcon';
import { useIsFlatIcons } from '~/context/ThemeContext';
import { usePressScale } from '~/hooks/usePressScale';
import { useThemeColors } from '~/hooks/useThemeColors';
import { type HapticKind, triggerHaptic } from '~/services/haptics';

interface AddIconButtonProps {
  onPress: () => void;
  accessibilityLabel: string;
  /** Glyph size in px. 34 suits a screen header; the + FAB uses 60. */
  size?: number;
  haptic?: HapticKind;
}

/**
 * The screen-header "add" action, as the bare clay + glyph.
 *
 * No disc behind it, for the reason spelled out in components/ui/ClayIcon.tsx:
 * the artwork already reads as a raised, three-dimensional button, and a solid
 * primary circle underneath both flattens it and clashes with its own colour.
 * Shared so every header add — items, goals, categories, recurring, budget
 * templates, accounts — is the same object as the + FAB rather than a similar
 * one drawn seven times.
 *
 * In flat mode it becomes what it replaced: a filled primary disc with a white
 * + line glyph, matching the flat + FAB for the same reason.
 */
export function AddIconButton({
  onPress,
  accessibilityLabel,
  size = 34,
  haptic = 'selection',
}: AddIconButtonProps) {
  const { animatedStyle, handlePressIn, handlePressOut } = usePressScale({ depth: 0.9 });
  const isFlat = useIsFlatIcons();
  const themeColors = useThemeColors();

  const handlePress = useCallback(() => {
    void triggerHaptic(haptic);
    onPress();
  }, [haptic, onPress]);

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        hitSlop={8}
        className="items-center justify-center"
        style={
          isFlat
            ? {
                width: size,
                height: size,
                borderRadius: size / 2,
                backgroundColor: themeColors.primary,
              }
            : { width: size, height: size }
        }
      >
        {isFlat ? (
          <Plus size={Math.round(size * 0.53)} color="#FFFFFF" strokeWidth={2.4} />
        ) : (
          <ClayIcon name="nav/add-active" size={size} />
        )}
      </Pressable>
    </Animated.View>
  );
}
