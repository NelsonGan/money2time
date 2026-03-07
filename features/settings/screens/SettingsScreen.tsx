import {
  Clock3,
  FolderTree,
  Landmark,
  Palette,
  RefreshCcw,
  Repeat2,
  Sparkles,
  Trash2,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useRef } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import {
  SETTINGS_FORM_BOTTOM_PADDING,
  SETTINGS_HORIZONTAL_PADDING,
  SettingsHeader,
  SettingsPageLayout,
  SettingsRowItem,
  SettingsSection,
} from '~/components/ui';
import { spacing } from '~/constants/designSystem';
import { useApp } from '~/context/AppContext';
import { DisplayModeToggle } from '~/features/transactions/components';
import type { TutorialSpotlightRequest, TutorialTargetRect } from '~/features/tutorial/types';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';

interface SettingsScreenProps {
  scrollToTopToken?: number;
  onOpenDisplay: () => void;
  onOpenHourlyValue: () => void;
  onOpenAccounts: () => void;
  onOpenCategories: () => void;
  onOpenRecurring: () => void;
  onStartTutorial: () => void;
  onTutorialTargetLayout?: (
    targetId: 'settings.start_tutorial' | 'settings.recurring' | 'settings.management',
    rect: TutorialTargetRect,
  ) => void;
  tutorialSpotlightRequest?: TutorialSpotlightRequest;
}

export function SettingsScreen({
  scrollToTopToken = 0,
  onOpenDisplay,
  onOpenHourlyValue,
  onOpenAccounts,
  onOpenCategories,
  onOpenRecurring,
  onStartTutorial,
  onTutorialTargetLayout,
  tutorialSpotlightRequest,
}: SettingsScreenProps) {
  const {
    settings,
    monthlyWages,
    updateSettings,
    isSimpleMode,
    simpleWalletId,
    switchToSimpleMode,
    switchToPowerMode,
    deleteSimpleWalletAndTransactions,
  } = useApp();
  const themeColors = useThemeColors();
  const scrollViewRef = useRef<ScrollView | null>(null);
  const startTutorialRowRef = useRef<View | null>(null);
  const recurringRowRef = useRef<View | null>(null);
  const managementRowRef = useRef<View | null>(null);

  const latestWage = monthlyWages[0] ?? null;

  useEffect(() => {
    if (scrollToTopToken <= 0) return;
    const frame = requestAnimationFrame(() => {
      scrollViewRef.current?.scrollTo({ y: 0, animated: false });
    });
    return () => cancelAnimationFrame(frame);
  }, [scrollToTopToken]);

  const handleStartTutorialRowLayout = useCallback(() => {
    if (!onTutorialTargetLayout) return;
    startTutorialRowRef.current?.measureInWindow((x, y, width, height) => {
      if (width <= 0 || height <= 0) return;
      onTutorialTargetLayout('settings.start_tutorial', { x, y, width, height });
    });
  }, [onTutorialTargetLayout]);
  const handleRecurringRowLayout = useCallback(() => {
    if (!onTutorialTargetLayout) return;
    recurringRowRef.current?.measureInWindow((x, y, width, height) => {
      if (width <= 0 || height <= 0) return;
      onTutorialTargetLayout('settings.recurring', { x, y, width, height });
    });
  }, [onTutorialTargetLayout]);
  const handleManagementRowLayout = useCallback(() => {
    if (!onTutorialTargetLayout) return;
    managementRowRef.current?.measureInWindow((x, y, width, height) => {
      if (width <= 0 || height <= 0) return;
      onTutorialTargetLayout('settings.management', { x, y, width, height });
    });
  }, [onTutorialTargetLayout]);

  useEffect(() => {
    if (!tutorialSpotlightRequest?.active) return;
    if (
      tutorialSpotlightRequest.targetId !== 'settings.start_tutorial' &&
      tutorialSpotlightRequest.targetId !== 'settings.recurring' &&
      tutorialSpotlightRequest.targetId !== 'settings.management'
    ) {
      return;
    }

    const measureTarget =
      tutorialSpotlightRequest.targetId === 'settings.recurring'
        ? handleRecurringRowLayout
        : tutorialSpotlightRequest.targetId === 'settings.management'
          ? handleManagementRowLayout
          : handleStartTutorialRowLayout;

    const firstPass = setTimeout(() => {
      measureTarget();
    }, 60);
    const secondPass = setTimeout(() => {
      measureTarget();
    }, 280);

    return () => {
      clearTimeout(firstPass);
      clearTimeout(secondPass);
    };
  }, [
    handleManagementRowLayout,
    handleRecurringRowLayout,
    handleStartTutorialRowLayout,
    tutorialSpotlightRequest,
  ]);

  return (
    <SettingsPageLayout>
      <ScrollView
        ref={scrollViewRef}
        className="flex-1"
        contentContainerStyle={styles.scrollContent}
      >
        <Animated.View entering={FadeIn.duration(400)}>
          <SettingsHeader
            className="px-0 pt-5 pb-2"
            title={I18n.t('settings.title')}
            subtitle={I18n.t('settings.subtitle')}
            rightAccessory={<DisplayModeToggle />}
          />
        </Animated.View>

        <Animated.View entering={FadeIn.delay(200).duration(400)}>
          {/* General settings */}
          <View style={styles.rowsGroup}>
            <SettingsRowItem
              icon={<Palette size={18} color={themeColors.primary} />}
              label={I18n.t('settings.display')}
              subtitle={I18n.t('settings.display_subtitle')}
              onPress={onOpenDisplay}
            />
            <SettingsRowItem
              icon={<Clock3 size={18} color={themeColors.primary} />}
              label={I18n.t('settings.hourly_value')}
              subtitle={
                latestWage
                  ? I18n.t('settings.hourly_value_latest', {
                      value: `${settings.currencySymbol}${latestWage.trueHourlyRate.toFixed(2)}/hr`,
                    })
                  : I18n.t('settings.manage_formulas')
              }
              onPress={onOpenHourlyValue}
            />
            {!isSimpleMode && (
              <SettingsRowItem
                icon={<Landmark size={18} color={themeColors.primary} />}
                label={I18n.t('settings.accounts')}
                subtitle={I18n.t('settings.accounts_subtitle')}
                onPress={onOpenAccounts}
              />
            )}
            <View ref={managementRowRef} onLayout={handleManagementRowLayout}>
              <SettingsRowItem
                icon={<FolderTree size={18} color={themeColors.primary} />}
                label={I18n.t('settings.categories')}
                subtitle={I18n.t('settings.categories_subtitle')}
                onPress={onOpenCategories}
              />
            </View>
            <View ref={recurringRowRef} onLayout={handleRecurringRowLayout}>
              <SettingsRowItem
                icon={<Repeat2 size={18} color={themeColors.primary} />}
                label={I18n.t('settings.recurring')}
                subtitle={I18n.t('settings.recurring_subtitle')}
                onPress={onOpenRecurring}
              />
            </View>
            <View ref={startTutorialRowRef} onLayout={handleStartTutorialRowLayout}>
              <SettingsRowItem
                icon={<Sparkles size={18} color={themeColors.primary} />}
                label={I18n.t('settings.start_tutorial')}
                subtitle={I18n.t('settings.start_tutorial_subtitle')}
                onPress={onStartTutorial}
              />
            </View>
            <SettingsRowItem
              icon={<RefreshCcw size={18} color={themeColors.primary} />}
              label={I18n.t('settings.replay_onboarding')}
              subtitle={I18n.t('settings.replay_onboarding_subtitle')}
              onPress={() => {
                Alert.alert(I18n.t('settings.replay_title'), I18n.t('settings.replay_message'), [
                  { text: I18n.t('common.cancel'), style: 'cancel' },
                  {
                    text: I18n.t('settings.replay_action'),
                    onPress: () => {
                      updateSettings({ onboardingCompleted: false });
                    },
                  },
                ]);
              }}
            />
          </View>

          {/* Experience mode section */}
          <SettingsSection className="mt-5 gap-2" title={I18n.t('settings.section_experience')}>
            <SettingsRowItem
              icon={<Sparkles size={18} color={themeColors.primary} />}
              label={I18n.t('settings.user_mode')}
              subtitle={
                isSimpleMode
                  ? I18n.t('settings.user_mode_subtitle_simple')
                  : I18n.t('settings.user_mode_subtitle_power')
              }
              onPress={() => {
                if (isSimpleMode) {
                  Alert.alert(
                    I18n.t('settings.switch_to_power_title'),
                    I18n.t('settings.switch_to_power_message'),
                    [
                      { text: I18n.t('common.cancel'), style: 'cancel' },
                      {
                        text: I18n.t('settings.user_mode_power'),
                        onPress: () => switchToPowerMode(),
                      },
                    ],
                  );
                } else {
                  Alert.alert(
                    I18n.t('settings.switch_to_simple_title'),
                    I18n.t('settings.switch_to_simple_message'),
                    [
                      { text: I18n.t('common.cancel'), style: 'cancel' },
                      {
                        text: I18n.t('settings.user_mode_simple'),
                        onPress: () => switchToSimpleMode(),
                      },
                    ],
                  );
                }
              }}
            />
            {!isSimpleMode && simpleWalletId !== null && (
              <SettingsRowItem
                icon={<Trash2 size={18} color={themeColors.error} />}
                label={I18n.t('settings.remove_simple_wallet')}
                subtitle={I18n.t('settings.remove_simple_wallet_subtitle')}
                haptic="warning"
                onPress={() => {
                  Alert.alert(
                    I18n.t('settings.remove_simple_wallet_title'),
                    I18n.t('settings.remove_simple_wallet_message'),
                    [
                      { text: I18n.t('common.cancel'), style: 'cancel' },
                      {
                        text: I18n.t('settings.remove'),
                        style: 'destructive',
                        onPress: () => deleteSimpleWalletAndTransactions(),
                      },
                    ],
                  );
                }}
              />
            )}
          </SettingsSection>
        </Animated.View>
      </ScrollView>
    </SettingsPageLayout>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
    paddingBottom: SETTINGS_FORM_BOTTOM_PADDING,
  },
  rowsGroup: {
    marginTop: spacing.xs,
    gap: spacing.xs,
  },
});
