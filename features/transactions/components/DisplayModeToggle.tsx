import { Clock, DollarSign } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { Text, ThemeModal } from '~/components/ui';
import { springPresets } from '~/constants/motion';
import { useApp } from '~/context/AppContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { requestOpenHourlyValueSetup } from '~/services/hourlyValueNavigation';
import { cn } from '~/utils';

export function DisplayModeToggle() {
  const { settings, toggleDisplayMode, canUseTimeDisplayMode } = useApp();
  const themeColors = useThemeColors();

  const isTimeMode = settings.displayMode === 'time';
  const indicatorX = useSharedValue(isTimeMode ? 1 : 0);
  const [showHourlyPrompt, setShowHourlyPrompt] = useState(false);
  const [isSwitchingMode, setIsSwitchingMode] = useState(false);
  const [targetMode, setTargetMode] = useState<'money' | 'time' | null>(null);
  const pendingFrameRef = useRef<number | null>(null);
  const pendingToggleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    indicatorX.value = withSpring(isTimeMode ? 1 : 0, springPresets.snappy);
  }, [isTimeMode, indicatorX]);

  useEffect(() => {
    if (!isSwitchingMode || !targetMode) return;
    if (settings.displayMode !== targetMode) return;
    const timer = setTimeout(() => {
      setIsSwitchingMode(false);
      setTargetMode(null);
    }, 140);
    return () => clearTimeout(timer);
  }, [isSwitchingMode, settings.displayMode, targetMode]);

  useEffect(() => {
    if (!isSwitchingMode) return;
    const timer = setTimeout(() => {
      setIsSwitchingMode(false);
      setTargetMode(null);
    }, 1800);
    return () => clearTimeout(timer);
  }, [isSwitchingMode]);

  useEffect(
    () => () => {
      if (pendingFrameRef.current !== null) {
        cancelAnimationFrame(pendingFrameRef.current);
        pendingFrameRef.current = null;
      }
      if (pendingToggleTimerRef.current) {
        clearTimeout(pendingToggleTimerRef.current);
        pendingToggleTimerRef.current = null;
      }
    },
    [],
  );

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value * 52 }],
  }));

  const handleChange = (toTimeMode: boolean) => {
    if (isSwitchingMode) return;
    if (toTimeMode === isTimeMode) return;
    if (toTimeMode && !canUseTimeDisplayMode) {
      void triggerHaptic('selection');
      setShowHourlyPrompt(true);
      return;
    }
    setTargetMode(toTimeMode ? 'time' : 'money');
    setIsSwitchingMode(true);
    void triggerHaptic('selection');

    pendingFrameRef.current = requestAnimationFrame(() => {
      pendingFrameRef.current = null;
      pendingToggleTimerRef.current = setTimeout(() => {
        pendingToggleTimerRef.current = null;
        toggleDisplayMode();
      }, 0);
    });
  };

  return (
    <>
      <View className="flex-row items-center rounded-pill bg-secondary/50 p-1 w-[112px] border border-border/20">
        <Animated.View
          className="absolute left-1 top-1 bottom-1 w-[50px] rounded-pill bg-primary shadow-glow"
          style={indicatorStyle}
        />
        <Pressable
          onPress={() => handleChange(false)}
          className="flex-1 h-8 items-center justify-center rounded-pill z-10"
        >
          <DollarSign
            size={14}
            color={isTimeMode ? themeColors.textMuted : '#FFFFFF'}
            strokeWidth={isTimeMode ? 1.8 : 2.5}
          />
        </Pressable>
        <Pressable
          onPress={() => handleChange(true)}
          className={cn(
            'flex-1 h-8 items-center justify-center rounded-pill z-10',
            !canUseTimeDisplayMode && 'opacity-40',
          )}
        >
          <Clock
            size={14}
            color={isTimeMode ? '#FFFFFF' : themeColors.textMuted}
            strokeWidth={isTimeMode ? 2.5 : 1.8}
          />
        </Pressable>
      </View>

      <ThemeModal
        visible={showHourlyPrompt}
        transparent
        animationType="fade"
        onRequestClose={() => setShowHourlyPrompt(false)}
      >
        <View className="flex-1 items-center justify-center bg-black/40 px-6">
          <View className="w-full max-w-[320px] rounded-[28px] border border-border/30 bg-card p-6 shadow-float">
            <Text variant="heading">{I18n.t('common.setup_hourly_title')}</Text>
            <Text variant="body" tone="muted" className="mt-2">
              {I18n.t('common.setup_hourly_prompt')}
            </Text>
            <View className="mt-5 flex-row items-center justify-end gap-2.5">
              <Pressable
                onPress={() => {
                  void triggerHaptic('selection');
                  setShowHourlyPrompt(false);
                }}
                className="rounded-pill bg-secondary/60 px-5 py-2.5"
              >
                <Text variant="caption" tone="muted">
                  {I18n.t('common.not_now')}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  void triggerHaptic('selection');
                  setShowHourlyPrompt(false);
                  requestOpenHourlyValueSetup();
                }}
                className="rounded-pill bg-primary px-5 py-2.5 shadow-glow"
              >
                <Text variant="caption" tone="inverse">
                  {I18n.t('common.setup')}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </ThemeModal>

      <ThemeModal visible={isSwitchingMode} transparent animationType="fade">
        <View className="flex-1 items-center justify-center bg-background/80 px-8">
          <View className="w-full max-w-[280px] items-center rounded-[28px] border border-border/30 bg-card px-6 py-7 shadow-float">
            <ActivityIndicator size="large" color={themeColors.primary} />
            <Text variant="bodyStrong" className="mt-4 text-center">
              {targetMode === 'time'
                ? I18n.t('common.switching_to_time')
                : I18n.t('common.switching_to_money')}
            </Text>
          </View>
        </View>
      </ThemeModal>
    </>
  );
}
