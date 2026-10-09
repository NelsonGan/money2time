import { useFocusEffect } from '@react-navigation/native';
import { ChevronRight } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import {
  ClayIcon,
  SETTINGS_FORM_BOTTOM_PADDING,
  SETTINGS_HORIZONTAL_PADDING,
  SettingsHeader,
  SettingsPageLayout,
  SettingsSection,
  Text,
  useSettingsBottomNavInset,
} from '~/components/ui';
import { spacing } from '~/constants/designSystem';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { getCurrentLiveActivity, isLiveActivityAvailable } from '~/services/liveActivity';

interface WidgetsScreenProps {
  onBack: () => void;
  onOpenLiveEarnings: () => void;
}

/**
 * The hub for everything widget-shaped. Deliberately a list rather than the
 * live-earnings screen itself: there is one Lock Screen widget today and more
 * to come, and a page that grows a second entry should not have to be taken
 * apart to make room for it.
 */
export function WidgetsScreen({ onBack, onOpenLiveEarnings }: WidgetsScreenProps) {
  const bottomNavInset = useSettingsBottomNavInset();
  const themeColors = useThemeColors();
  const [liveRunning, setLiveRunning] = useState(false);

  // Read-only: the detail screen owns the activity, so the hub only asks
  // ActivityKit whether one is on rather than mounting a second controller
  // that would push its own updates. Re-read on focus so coming back from
  // starting or stopping one lands on the truth.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void getCurrentLiveActivity().then((session) => {
        if (active) setLiveRunning(session !== null);
      });
      return () => {
        active = false;
      };
    }, []),
  );

  return (
    <SettingsPageLayout>
      <SettingsHeader
        className="px-5 pt-5 pb-3"
        onBack={onBack}
        title={I18n.t('widgets.settings_title')}
      />
      <ScrollView className="flex-1" contentContainerStyle={[styles.scrollContent, bottomNavInset]}>
        {/* Android has no Live Activities. Settings already hides the tile
            that leads here, so this is belt and braces rather than the only
            guard, but it keeps the page honest if it is ever reached another
            way. */}
        {isLiveActivityAvailable ? (
          <SettingsSection className="mt-2" showAccent={false}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={I18n.t('widgets.live.title')}
              onPress={() => {
                void triggerHaptic('selection');
                onOpenLiveEarnings();
              }}
              className="flex-row items-center gap-3 rounded-3xl border border-border/40 bg-card/95 px-4 py-4"
            >
              <ClayIcon name="money-time/alarm-clock-coin" size={34} flatSize={22} />
              <View className="flex-1 gap-0.5">
                <View className="flex-row items-center gap-2">
                  <Text variant="body" numberOfLines={1}>
                    {I18n.t('widgets.live.title')}
                  </Text>
                  {liveRunning ? (
                    <View className="flex-row items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5">
                      <View className="h-1.5 w-1.5 rounded-full bg-primary" />
                      <Text variant="caption" className="text-primary">
                        {I18n.t('widgets.live.badge_on')}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text variant="caption" tone="muted">
                  {I18n.t('widgets.live.subtitle')}
                </Text>
              </View>
              <ChevronRight size={16} color={themeColors.textMuted} />
            </Pressable>
          </SettingsSection>
        ) : null}
      </ScrollView>
    </SettingsPageLayout>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
    paddingBottom: SETTINGS_FORM_BOTTOM_PADDING,
    gap: spacing.xs,
  },
});
