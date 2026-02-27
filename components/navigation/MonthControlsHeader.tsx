import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import React from 'react';
import { Pressable, View } from 'react-native';

import { Text } from '~/components/ui/text';
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
}) {
  const themeColors = useThemeColors();

  return (
    <View className="bg-background pb-2 pt-1">
      <View className="px-5 pt-2 gap-3">
        <View className="flex-row items-center justify-between gap-3" style={{ minHeight: 40 }}>
          <View className="flex-1">
            {titleNode ? (
              titleNode
            ) : (
              <>
                {title ? <Text variant="heading">{title}</Text> : null}
                {subtitle ? (
                  <Text variant="friendly" tone="muted" className="mt-0.5">
                    {subtitle}
                  </Text>
                ) : null}
              </>
            )}
          </View>
          {actions ? <View className="flex-row items-center gap-2">{actions}</View> : null}
        </View>

        <View className="rounded-[28px] bg-card border border-border/40 px-2 py-2">
          <View className="flex-row items-center justify-between">
            <Pressable
              onPress={() => {
                void triggerHaptic('selection');
                onPrevMonth();
              }}
              className="h-10 w-10 rounded-full items-center justify-center active:opacity-70"
            >
              <ChevronLeft size={18} color={themeColors.textSoft} />
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
              <Text variant="subheading" className="text-foreground">
                {monthLabel}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                void triggerHaptic('selection');
                onNextMonth();
              }}
              className="h-10 w-10 rounded-full items-center justify-center active:opacity-70"
            >
              <ChevronRight size={18} color={themeColors.textSoft} />
            </Pressable>
          </View>
        </View>

        {summary ? <View className="flex-row flex-wrap gap-2">{summary}</View> : null}

        {children ? <View className="gap-2.5 pt-0.5">{children}</View> : null}
      </View>
    </View>
  );
}
