import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import React from 'react';
import { Pressable, View } from 'react-native';

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
  variant: _variant = 'default',
  actions,
  summary,
  children,
  hideNavigation = false,
  showAccent = true,
}: {
  title?: string;
  titleNode?: React.ReactNode;
  subtitle?: string;
  monthLabel: string;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onMonthPress?: () => void;
  variant?: 'default' | 'transactions';
  actions?: React.ReactNode;
  summary?: React.ReactNode;
  children?: React.ReactNode;
  hideNavigation?: boolean;
  showAccent?: boolean;
}) {
  const themeColors = useThemeColors();

  return (
    <View className="bg-background pb-1.5 pt-1">
      <TabletContentContainer>
        <View className="px-5 pt-1.5 gap-2.5">
          {/* Title row with decorative accent */}
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
                      <Text variant="heading" className="tracking-tight">
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

          {/* Month navigation — floating capsule style */}
          {!hideNavigation ? (
            <View className="rounded-pill bg-secondary/40 px-1.5 py-1.5">
              <View className="flex-row items-center justify-between">
                <Pressable
                  onPress={() => {
                    void triggerHaptic('selection');
                    onPrevMonth();
                  }}
                  className="h-9 w-9 rounded-full items-center justify-center bg-card shadow-soft active:scale-95"
                >
                  <ChevronLeft size={16} color={themeColors.textSoft} />
                </Pressable>
                <Pressable
                  onPress={() => {
                    if (!onMonthPress) return;
                    void triggerHaptic('selection');
                    onMonthPress();
                  }}
                  disabled={!onMonthPress}
                  className={cn(
                    'flex-1 items-center px-2',
                    onMonthPress ? 'active:opacity-80' : undefined,
                  )}
                >
                  <Text variant="bodyStrong" className="text-foreground tracking-tight">
                    {monthLabel}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    void triggerHaptic('selection');
                    onNextMonth();
                  }}
                  className="h-9 w-9 rounded-full items-center justify-center bg-card shadow-soft active:scale-95"
                >
                  <ChevronRight size={16} color={themeColors.textSoft} />
                </Pressable>
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
