import { ArrowRight } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, Pressable, View } from 'react-native';

import { Text, ThemeModal } from '~/components/ui';
import { TABLET_CONTENT_MAX_WIDTH, useDeviceLayout } from '~/hooks/useDeviceLayout';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { cn } from '~/utils';
import { MAX_FIRST_DAY_OF_MONTH } from '~/utils/financialMonth';

const SLIDE_CONFIG = { duration: 220, useNativeDriver: true } as const;

interface MonthCycleDaySheetProps {
  visible: boolean;
  title: string;
  /**
   * How many days to offer. A single month offers exactly the days it has, so
   * February never shows a 30th; the default offers all 31, since a day past
   * the end of a short month resolves to that month's last day (which is how
   * "the last day of the month" is expressed).
   */
  dayCount?: number;
  /** The committed day, which seeds the draft each time the sheet opens. */
  selectedDay: number;
  /**
   * The default day, when this sheet is editing a single month. Turns the left
   * button into "use the default"; omit (or null) when the sheet IS the default.
   */
  defaultDay?: number | null;
  /** The period a candidate day would produce, for the preview. */
  previewRange: (day: number) => { from: string; until: string };
  onSave: (day: number) => void;
  onUseDefault?: () => void;
  onClose: () => void;
}

/**
 * Day picker for a month cycle's start day.
 *
 * A seven-column grid rather than a list: the days are a calendar's worth, and
 * laid out as one they read as the shape the user already knows. The pick is a
 * draft until Save, which is what makes the period under the grid worth having:
 * it moves as you try days, so you choose the cycle you want rather than the
 * number you guessed.
 */
export function MonthCycleDaySheet({
  visible,
  title,
  dayCount = MAX_FIRST_DAY_OF_MONTH,
  selectedDay,
  defaultDay = null,
  previewRange,
  onSave,
  onUseDefault,
  onClose,
}: MonthCycleDaySheetProps) {
  const themeColors = useThemeColors();
  const { isTablet } = useDeviceLayout();
  const [draftDay, setDraftDay] = useState(selectedDay);
  const days = useMemo(() => Array.from({ length: dayCount }, (_, index) => index + 1), [dayCount]);
  const translateY = useRef(new Animated.Value(Dimensions.get('window').height)).current;

  // Seed the draft from the committed day each time the sheet opens, so a
  // cancelled edit leaves nothing behind.
  useEffect(() => {
    if (visible) setDraftDay(selectedDay);
  }, [visible, selectedDay]);

  useEffect(() => {
    Animated.timing(translateY, {
      toValue: visible ? 0 : Dimensions.get('window').height,
      ...SLIDE_CONFIG,
    }).start();
  }, [translateY, visible]);

  const preview = previewRange(Math.min(draftDay, dayCount));

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
          className="absolute inset-0 bg-black/25"
          onPress={onClose}
        />
        <Animated.View
          className="rounded-t-[32px] bg-card px-5 pt-3 pb-8"
          style={[
            { transform: [{ translateY }] },
            isTablet
              ? { maxWidth: TABLET_CONTENT_MAX_WIDTH, width: '100%', alignSelf: 'center' }
              : null,
          ]}
        >
          <View className="mb-3.5 h-[5px] w-11 self-center rounded-full bg-border" />

          <Text variant="subheading" className="tracking-tight">
            {title}
          </Text>

          <View className="mt-4 flex-row flex-wrap" style={{ rowGap: 7 }}>
            {days.map((day) => {
              const selected = day === draftDay;
              return (
                <View key={day} className="items-center" style={{ width: `${100 / 7}%` }}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={String(day)}
                    onPress={() => {
                      void triggerHaptic('selection');
                      setDraftDay(day);
                    }}
                    className={cn(
                      'h-[42px] w-[42px] items-center justify-center rounded-full',
                      selected ? 'bg-primary' : 'bg-muted',
                    )}
                    style={({ pressed }) => ({
                      opacity: pressed ? 0.6 : 1,
                      ...(selected
                        ? {
                            shadowColor: themeColors.primary,
                            shadowOpacity: 0.35,
                            shadowRadius: 8,
                            shadowOffset: { width: 0, height: 4 },
                            elevation: 4,
                          }
                        : null),
                    })}
                  >
                    {/* `text-primary-foreground`, not white: in dark mode the
                        theme primary is the light end of the ramp, and white on
                        it is barely a number. */}
                    <Text
                      variant="mono"
                      className={cn('text-[15px]', selected && 'text-primary-foreground')}
                    >
                      {day}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </View>

          {/* The cycle the draft produces, both ends named. This is the answer
              the user is actually after, and it moves as they try days. */}
          <View className="mt-4 flex-row items-center rounded-3xl border border-border/50 bg-background p-4">
            <View className="flex-1 items-center">
              <Text variant="label" tone="muted">
                {I18n.t('settings.month_cycle.from')}
              </Text>
              <Text variant="mono" className="mt-1.5">
                {preview.from}
              </Text>
            </View>
            <ArrowRight size={20} color={themeColors.textMuted} />
            <View className="flex-1 items-center">
              <Text variant="label" tone="muted">
                {I18n.t('settings.month_cycle.until')}
              </Text>
              <Text variant="mono" className="mt-1.5">
                {preview.until}
              </Text>
            </View>
          </View>

          <View className="mt-4 flex-row gap-2.5">
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                void triggerHaptic('selection');
                if (defaultDay != null) onUseDefault?.();
                else onClose();
              }}
              className="h-[52px] flex-1 items-center justify-center rounded-full bg-muted px-3"
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
              <Text variant="caption" tone="muted" numberOfLines={1}>
                {defaultDay != null
                  ? I18n.t('settings.month_cycle.use_default', { day: defaultDay })
                  : I18n.t('common.cancel')}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                void triggerHaptic('success');
                onSave(draftDay);
              }}
              className="h-[52px] flex-1 items-center justify-center rounded-full bg-primary"
              style={({ pressed }) => ({
                opacity: pressed ? 0.75 : 1,
                shadowColor: themeColors.primary,
                shadowOpacity: 0.3,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 6 },
                elevation: 5,
              })}
            >
              <Text variant="bodyStrong" className="text-primary-foreground">
                {I18n.t('common.save')}
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </ThemeModal>
  );
}
