import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import React from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';

import { TabletContentContainer } from '~/components/layout/TabletContentContainer';
import { Text } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { triggerHaptic } from '~/services/haptics';
import { cn } from '~/utils';

export function MonthControlsHeader({
  title,
  titleNode,
  subtitle,
  monthLabel,
  onPrevMonth,
  onNextMonth,
  onMonthPress,
  monthTriggerRef,
  onMonthTriggerLayout,
  variant: _variant = 'default',
  actions,
  summary,
  children,
  hideNavigation = false,
  hideNavArrows = false,
  hideTitleRow = false,
  showAccent = true,
}: {
  title?: string;
  titleNode?: React.ReactNode;
  subtitle?: string;
  monthLabel: string;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onMonthPress?: () => void;
  monthTriggerRef?: React.Ref<View>;
  onMonthTriggerLayout?: () => void;
  variant?: 'default' | 'transactions';
  actions?: React.ReactNode;
  summary?: React.ReactNode;
  children?: React.ReactNode;
  hideNavigation?: boolean;
  /** Hide only the prev/next chevrons, keeping the centered label capsule. */
  hideNavArrows?: boolean;
  hideTitleRow?: boolean;
  showAccent?: boolean;
}) {
  const themeColors = useThemeColors();
  const { width: screenWidth } = useWindowDimensions();
  const isSmallScreen = screenWidth < 380;

  return (
    <View className="bg-background pb-1.5 pt-1">
      <TabletContentContainer>
        <View className="px-5 pt-1.5 gap-2.5">
          {/* Title row with decorative accent */}
          {!hideTitleRow ? (
            <View className="flex-row items-center justify-between gap-3" style={{ minHeight: 40 }}>
              <View className="min-h-10 flex-1 justify-center">
                {titleNode ? (
                  titleNode
                ) : (
                  <>
                    {title ? (
                      <View className="flex-row items-center gap-2">
                        {showAccent ? (
                          <View
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: themeColors.primary, opacity: 0.5 }}
                          />
                        ) : null}
                        <Text
                          variant={isSmallScreen ? 'subheading' : 'heading'}
                          className="tracking-tight"
                          numberOfLines={1}
                        >
                          {title}
                        </Text>
                      </View>
                    ) : null}
                    {subtitle ? (
                      <Text variant="caption" tone="muted" className="mt-0.5">
                        {subtitle}
                      </Text>
                    ) : null}
                  </>
                )}
              </View>
              {actions ? (
                <View className="min-h-10 flex-row items-center justify-end gap-2">{actions}</View>
              ) : null}
            </View>
          ) : null}

          {/* Month navigation — floating capsule style */}
          {!hideNavigation ? (
            <View className="rounded-pill bg-secondary/40 px-1.5 py-1.5">
              <View className="flex-row items-center justify-between">
                {hideNavArrows ? null : (
                  <Pressable
                    onPress={() => {
                      void triggerHaptic('selection');
                      onPrevMonth();
                    }}
                    className="h-9 w-9 rounded-full items-center justify-center bg-card shadow-soft active:scale-95"
                  >
                    <ChevronLeft size={16} color={themeColors.textSoft} />
                  </Pressable>
                )}
                <View className="flex-1 items-center">
                  <View ref={monthTriggerRef} onLayout={onMonthTriggerLayout}>
                    <Pressable
                      onPress={() => {
                        if (!onMonthPress) return;
                        void triggerHaptic('selection');
                        onMonthPress();
                      }}
                      disabled={!onMonthPress}
                      accessibilityRole="button"
                      accessibilityLabel={monthLabel}
                      className={cn(onMonthPress ? 'active:opacity-80' : undefined)}
                    >
                      <View className="px-2">
                        <Text variant="bodyStrong" className="text-foreground tracking-tight">
                          {monthLabel}
                        </Text>
                      </View>
                    </Pressable>
                  </View>
                </View>
                {hideNavArrows ? null : (
                  <Pressable
                    onPress={() => {
                      void triggerHaptic('selection');
                      onNextMonth();
                    }}
                    className="h-9 w-9 rounded-full items-center justify-center bg-card shadow-soft active:scale-95"
                  >
                    <ChevronRight size={16} color={themeColors.textSoft} />
                  </Pressable>
                )}
              </View>
            </View>
          ) : null}

          {summary ? <View className="flex-row flex-wrap gap-2">{summary}</View> : null}

          {children ? <View className="gap-2 pt-0.5">{children}</View> : null}
        </View>
      </TabletContentContainer>
    </View>
  );
}
