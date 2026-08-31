import { useEffect, useRef } from 'react';
import { Animated, Dimensions, Pressable, StyleSheet, View } from 'react-native';

import { Text, ThemeModal } from '~/components/ui';
import { spacing } from '~/constants/designSystem';
import { TABLET_CONTENT_MAX_WIDTH, useDeviceLayout } from '~/hooks/useDeviceLayout';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { MAX_FIRST_DAY_OF_MONTH } from '~/utils/financialMonth';

const COLUMNS = 7;
const SLIDE_CONFIG = { duration: 220, useNativeDriver: true } as const;

const DAYS = Array.from({ length: MAX_FIRST_DAY_OF_MONTH }, (_, index) => index + 1);

interface MonthCycleDaySheetProps {
  visible: boolean;
  title: string;
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
 * "the 25th" is a glance rather than a scroll through 28 rows.
 */
export function MonthCycleDaySheet({
  visible,
  title,
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
          style={[{ transform: [{ translateY }] }, isTablet ? styles.tabletSheet : null]}
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
              style={[
                styles.defaultRow,
                {
                  borderColor: followsDefault ? themeColors.primary : themeColors.border,
                  backgroundColor: followsDefault ? themeColors.primarySoft : 'transparent',
                },
              ]}
            >
              <Text variant="body" tone={followsDefault ? 'default' : 'muted'}>
                {I18n.t('settings.month_cycle.use_default', { day: defaultDay })}
              </Text>
            </Pressable>
          ) : null}

          <View style={styles.grid}>
            {DAYS.map((day) => {
              // A month following the default has no day of its own to tick, so
              // the grid shows no selection and the row above carries it.
              const selected = !followsDefault && day === selectedDay;
              return (
                <View key={day} style={styles.cell}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={String(day)}
                    onPress={() => {
                      void triggerHaptic('selection');
                      onSelect(day);
                    }}
                    style={[
                      styles.dayTile,
                      {
                        backgroundColor: selected ? themeColors.primary : themeColors.surfaceMuted,
                      },
                    ]}
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
            {I18n.t('settings.month_cycle.day_range_help')}
          </Text>
        </Animated.View>
      </View>
    </ThemeModal>
  );
}

const styles = StyleSheet.create({
  tabletSheet: {
    maxWidth: TABLET_CONTENT_MAX_WIDTH,
    width: '100%',
    alignSelf: 'center',
  },
  defaultRow: {
    marginTop: spacing.md,
    height: 48,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grid: {
    marginTop: spacing.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: spacing.xs,
  },
  cell: {
    width: `${100 / COLUMNS}%`,
    alignItems: 'center',
  },
  dayTile: {
    height: 42,
    width: 42,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
