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
    transform: [{ translateX: indicatorX.value * 56 }],
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

    // Let the loading modal paint first, then run the heavy blocking refresh work.
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
      <View
        className={cn(
          'flex-row items-center rounded-full border border-border/40 bg-card p-1 w-[120px]',
        )}
      >
        <Animated.View
          className="absolute left-1 top-1 bottom-1 w-[54px] rounded-full bg-primary"
          style={indicatorStyle}
        />
        <Pressable
          onPress={() => handleChange(false)}
          className="flex-1 h-9 items-center justify-center rounded-full z-10"
        >
          <DollarSign size={15} color={isTimeMode ? themeColors.textMuted : '#FFFFFF'} />
        </Pressable>
        <Pressable
          onPress={() => handleChange(true)}
          className={cn(
            'flex-1 h-9 items-center justify-center rounded-full z-10',
            !canUseTimeDisplayMode && 'opacity-45',
          )}
        >
          <Clock size={15} color={isTimeMode ? '#FFFFFF' : themeColors.textMuted} />
        </Pressable>
      </View>

      <ThemeModal
        visible={showHourlyPrompt}
        transparent
        animationType="fade"
        onRequestClose={() => setShowHourlyPrompt(false)}
      >
        <View className="flex-1 items-center justify-center bg-black/35 px-6">
          <View className="w-full max-w-[320px] rounded-[26px] border border-border/45 bg-card p-5">
            <Text variant="subheading">{I18n.t('common.setup_hourly_title')}</Text>
            <Text variant="friendly" tone="muted" className="mt-2">
              {I18n.t('common.setup_hourly_prompt')}
            </Text>
            <View className="mt-4 flex-row items-center justify-end gap-2">
              <Pressable
                onPress={() => {
                  void triggerHaptic('selection');
                  setShowHourlyPrompt(false);
                }}
                className="rounded-full bg-secondary px-4 py-2"
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
                className="rounded-full bg-primary px-4 py-2"
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
        <View className="flex-1 items-center justify-center bg-background/75 px-8">
          <View className="w-full max-w-[280px] items-center rounded-[26px] border border-border/45 bg-card px-6 py-6">
            <ActivityIndicator size="large" color={themeColors.primary} />
            <Text variant="friendly" className="mt-3 text-center">
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
