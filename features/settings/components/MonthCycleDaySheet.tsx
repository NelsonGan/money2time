import { useEffect, useRef } from 'react';
import { Animated, Dimensions, Pressable, View } from 'react-native';

import { Text, ThemeModal } from '~/components/ui';
import { TABLET_CONTENT_MAX_WIDTH, useDeviceLayout } from '~/hooks/useDeviceLayout';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { cn } from '~/utils';
import { MAX_FIRST_DAY_OF_MONTH } from '~/utils/financialMonth';

const SLIDE_CONFIG = { duration: 220, useNativeDriver: true } as const;

const DAYS = Array.from({ length: MAX_FIRST_DAY_OF_MONTH }, (_, index) => index + 1);

interface MonthCycleDaySheetProps {
  visible: boolean;
  title: string;
  /** The period the current pick produces, e.g. "25 Jan to 24 Feb". */
  rangeLabel: string;
  /** The day currently in force, so the grid opens on it. */
  selectedDay: number;
  /**
   * The default day, when this sheet is editing a single month. Renders the
   * "use the default" row and marks the month as following it; omit (or null)
   * when the sheet IS the default.
   */
  defaultDay?: number | null;
  /** True when the month being edited has no override of its own. */
  followsDefault?: boolean;
  onSelect: (day: number) => void;
  onUseDefault?: () => void;
  onClose: () => void;
}

/**
 * Day picker for a month cycle's start day.
 *
 * A seven-column grid rather than a list: the days are a calendar's worth, and
 * laid out as one they read as the shape the user already knows, so picking
 * "the 25th" is a glance rather than a scroll through 28 rows. The period the
 * pick produces sits under it, which is the one place that fact is worth
 * spelling out.
 */
export function MonthCycleDaySheet({
  visible,
  title,
  rangeLabel,
  selectedDay,
  defaultDay = null,
  followsDefault = false,
  onSelect,
  onUseDefault,
  onClose,
}: MonthCycleDaySheetProps) {
  const themeColors = useThemeColors();
  const { isTablet } = useDeviceLayout();
  const translateY = useRef(new Animated.Value(Dimensions.get('window').height)).current;

  useEffect(() => {
    Animated.timing(translateY, {
      toValue: visible ? 0 : Dimensions.get('window').height,
      ...SLIDE_CONFIG,
    }).start();
  }, [translateY, visible]);

  return (
    <ThemeModal
      visible={visible}
      transparent
      animationType="none"
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end" pointerEvents="box-none">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={I18n.t('common.close')}
          className="absolute inset-0 bg-black/20"
          onPress={onClose}
        />
        <Animated.View
          className="rounded-t-[28px] border-t border-border/40 bg-background px-5 pt-4 pb-8"
          style={[
            { transform: [{ translateY }] },
            isTablet
              ? { maxWidth: TABLET_CONTENT_MAX_WIDTH, width: '100%', alignSelf: 'center' }
              : null,
          ]}
        >
          <Text variant="subheading" className="text-center tracking-tight">
            {title}
          </Text>

          {defaultDay != null ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: followsDefault }}
              onPress={() => {
                void triggerHaptic('selection');
                onUseDefault?.();
              }}
              className={cn(
                'mt-4 h-12 items-center justify-center rounded-2xl border',
                followsDefault ? 'border-primary bg-primary/10' : 'border-border/50',
              )}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
              <Text variant="body" tone={followsDefault ? 'default' : 'muted'}>
                {I18n.t('settings.month_cycle.use_default', { day: defaultDay })}
              </Text>
            </Pressable>
          ) : null}

          <View className="mt-4 flex-row flex-wrap" style={{ rowGap: 8 }}>
            {DAYS.map((day) => {
              // A month following the default has no day of its own to tick, so
              // the grid shows no selection and the row above carries it.
              const selected = !followsDefault && day === selectedDay;
              return (
                <View key={day} className="items-center" style={{ width: `${100 / 7}%` }}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={String(day)}
                    onPress={() => {
                      void triggerHaptic('selection');
                      onSelect(day);
                    }}
                    className={cn(
                      'h-11 w-11 items-center justify-center rounded-full',
                      selected ? 'bg-primary' : 'bg-muted',
                    )}
                    style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                  >
                    {/* `text-primary-foreground`, not white: in dark mode the
                        theme primary is the light end of the ramp, and white on
                        it is barely a number. */}
                    <Text
                      variant="body"
                      className={selected ? 'text-primary-foreground' : undefined}
                      tone={selected ? 'default' : 'muted'}
                    >
                      {day}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </View>

          <Text variant="caption" tone="muted" className="mt-4 text-center">
            {rangeLabel}
          </Text>
        </Animated.View>
      </View>
    </ThemeModal>
  );
}
