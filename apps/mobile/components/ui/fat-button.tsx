import React from 'react';
import { Pressable, View, type ViewStyle } from 'react-native';

import { useThemeColors } from '~/hooks/useThemeColors';
import { type HapticKind, triggerHaptic } from '~/services/haptics';
import { cn } from '~/utils';
import { darkenColor } from '~/utils/color';

import { LoadingDots } from './loading-dots';
import { Text } from './text';

const LEDGE = 5;

interface FatButtonProps {
  label: string;
  onPress: () => void;
  /** Face color. Defaults to the theme primary. */
  color?: string;
  textColor?: string;
  /** Left-hand accessory (e.g. an icon), rendered before the label. */
  leading?: React.ReactNode;
  /** Right-hand accessory (e.g. an external-link icon), rendered after the label. */
  trailing?: React.ReactNode;
  haptic?: HapticKind;
  disabled?: boolean;
  /**
   * Work is running: the dots take the label's place (the button keeps its
   * size and stays at full colour) and presses are ignored.
   */
  loading?: boolean;
  /** Resting total height (face + ledge). */
  height?: number;
  /** Applied to the layout wrapper — use for flex sizing (e.g. "flex-1"). */
  className?: string;
}

/**
 * Chunky "3D" / Duolingo-style button: a colored face sitting on a darker
 * bottom ledge. On press the ledge collapses and the button shrinks from the
 * top (bottom-anchored in a fixed-height wrapper), so it reads as pressing down
 * without shifting surrounding layout.
 */
export function FatButton({
  label,
  onPress,
  color,
  textColor = '#fff',
  leading,
  trailing,
  haptic = 'selection',
  disabled = false,
  loading = false,
  height = 52,
  className,
}: FatButtonProps) {
  const themeColors = useThemeColors();
  const [pressed, setPressed] = React.useState(false);

  const face = color ?? themeColors.primary;
  const edge = darkenColor(face, 0.2);
  const isPressed = pressed && !disabled && !loading;

  const faceStyle: ViewStyle = {
    height: isPressed ? height - (LEDGE - 1) : height,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: face,
    borderBottomWidth: isPressed ? 1 : LEDGE,
    borderBottomColor: edge,
    opacity: disabled && !loading ? 0.5 : 1,
  };

  return (
    <View className={cn(className)} style={{ height, justifyContent: 'flex-end' }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: disabled || loading, busy: loading }}
        disabled={disabled || loading}
        onPress={() => {
          void triggerHaptic(haptic);
          onPress();
        }}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        style={faceStyle}
      >
        {loading ? <LoadingDots color={textColor} accessibilityLabel={label} /> : null}
        {loading ? null : leading}
        {/* `ph-no-mask`: every label is fixed app copy (at most a selection
            count), so session replays show it rather than a grey bar. Keep it
            that way: a label carrying an amount or a name must drop this. */}
        {loading ? null : (
          <Text
            testID="ph-no-mask"
            numberOfLines={1}
            style={{ color: textColor, fontWeight: '800', fontSize: 15 }}
          >
            {label}
          </Text>
        )}
        {loading ? null : trailing}
      </Pressable>
    </View>
  );
}
