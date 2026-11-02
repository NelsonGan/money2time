import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import React from 'react';
import { Pressable, View, type ViewInstance } from 'react-native';

import { Text } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

/**
 * The period under an Insights page title: "‹ 2026 ›", quiet enough to read as
 * part of the title rather than a second header. The arrows step the period;
 * tapping the label opens the period picker (when there is one).
 */
export function InsightPeriodSwitcher({
  label,
  onPrevious,
  onNext,
  onPressLabel,
  disableArrows = false,
  labelRef,
  onLabelLayout,
}: {
  label: string;
  onPrevious: () => void;
  onNext: () => void;
  onPressLabel?: () => void;
  disableArrows?: boolean;
  labelRef?: React.Ref<ViewInstance>;
  onLabelLayout?: () => void;
}) {
  const themeColors = useThemeColors();
  const arrowColor = disableArrows ? themeColors.border : themeColors.textMuted;
  const step = (move: () => void) => () => {
    void triggerHaptic('selection');
    move();
  };
  return (
    <View className="flex-row items-center justify-center">
      <Pressable
        onPress={step(onPrevious)}
        disabled={disableArrows}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={I18n.t('common.previous')}
        className="h-7 w-7 items-center justify-center rounded-full active:opacity-60"
      >
        <ChevronLeft size={16} color={arrowColor} strokeWidth={2.5} />
      </Pressable>
      <View ref={labelRef} onLayout={onLabelLayout}>
        <Pressable
          onPress={onPressLabel ? step(onPressLabel) : undefined}
          disabled={!onPressLabel}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityHint={onPressLabel ? I18n.t('settings.select_year_month') : undefined}
          className="min-w-12 items-center px-1.5 active:opacity-60"
        >
          <Text variant="caption" numberOfLines={1} style={{ color: themeColors.textSoft }}>
            {label}
          </Text>
        </Pressable>
      </View>
      <Pressable
        onPress={step(onNext)}
        disabled={disableArrows}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={I18n.t('common.next')}
        className="h-7 w-7 items-center justify-center rounded-full active:opacity-60"
      >
        <ChevronRight size={16} color={arrowColor} strokeWidth={2.5} />
      </Pressable>
    </View>
  );
}
