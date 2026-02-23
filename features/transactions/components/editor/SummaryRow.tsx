import React, { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { ChevronRight } from 'lucide-react-native';

import { Text } from '~/components/ui/text';
import { useThemeColors } from '~/hooks/useThemeColors';
import { triggerHaptic } from '~/services/haptics';
import { I18n } from '~/lib/i18n';

interface SummaryRowProps {
  icon?: string;
  label: string;
  value?: string;
  valueTone?: 'default' | 'muted' | 'error' | 'success';
  placeholder?: string;
  isActive: boolean;
  onPress: () => void;
  rightElement?: React.ReactNode;
  children?: React.ReactNode;
}

export function SummaryRow({
  icon,
  label,
  value,
  valueTone = 'default',
  placeholder,
  isActive,
  onPress,
  rightElement,
  children,
}: SummaryRowProps) {
  const themeColors = useThemeColors();
  const pressed = useSharedValue(0);
  const active = useSharedValue(isActive ? 1 : 0);

  useEffect(() => {
    active.value = withTiming(isActive ? 1 : 0, { duration: 180 });
  }, [isActive, active]);

  const handlePressIn = () => {
    pressed.value = withTiming(1, { duration: 110 });
  };
  const handlePressOut = () => {
    pressed.value = withTiming(0, { duration: 150 });
  };

  const activeBg = themeColors.primarySoft;
  const primaryColor = themeColors.primary;

  const activeStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      active.value + pressed.value * 0.3,
      [0, 0.3, 1],
      ['transparent', activeBg, activeBg],
    ),
    borderLeftColor: interpolateColor(active.value, [0, 1], ['transparent', primaryColor]),
    transform: [{ translateX: pressed.value * 1.5 }],
  }));

  const valueToneClass =
    valueTone === 'muted'
      ? 'text-muted-foreground'
      : valueTone === 'error'
        ? 'text-destructive'
        : valueTone === 'success'
          ? 'text-success'
          : 'text-foreground';

  return (
    <Animated.View style={activeStyle} className="border-l-[3px] rounded-r-xl">
      <Pressable
        onPress={() => {
          void triggerHaptic('selection');
          onPress();
        }}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        className="flex-row items-center px-4 py-3.5 min-h-[52px]"
      >
        {icon ? <Text className="text-[18px] w-8">{icon}</Text> : null}
        <View className="flex-1">
          {children ?? (
            <View className="flex-row items-center justify-between">
              <Text variant="caption" tone="muted" className="w-20">
                {label}
              </Text>
              <View className="flex-1 flex-row items-center justify-end">
                <Text
                  variant="friendly"
                  numberOfLines={1}
                  className={value ? valueToneClass : 'text-muted-foreground/60'}
                >
                  {value ||
                    placeholder ||
                    I18n.t('transactions.editor.choose_field', { field: label.toLowerCase() })}
                </Text>
              </View>
            </View>
          )}
        </View>
        {rightElement ?? (
          <ChevronRight
            size={14}
            color={isActive ? themeColors.primary : themeColors.textMuted}
            className="ml-2"
          />
        )}
      </Pressable>
    </Animated.View>
  );
}
