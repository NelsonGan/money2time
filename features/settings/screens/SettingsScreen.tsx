import {
  Clock3,
  DatabaseBackup,
  FolderTree,
  Landmark,
  Palette,
  RefreshCcw,
  Repeat2,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useRef } from 'react';
import {
  Alert,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { MonthControlsHeader } from '~/components/navigation/MonthControlsHeader';
import {
  SETTINGS_FORM_BOTTOM_PADDING,
  SETTINGS_HORIZONTAL_PADDING,
  SettingsPageLayout,
  SettingsRowItem,
  SettingsSection,
} from '~/components/ui';
import { spacing } from '~/constants/designSystem';
import { useApp } from '~/context/AppContext';
import { AdSupportSection } from '~/features/settings/components/AdSupportSection';
import { DisplayModeToggle } from '~/features/transactions/components';
import type { TutorialSpotlightRequest, TutorialTargetRect } from '~/features/tutorial/types';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';

type SettingsTutorialTargetId =
  | 'settings.start_tutorial'
  | 'settings.recurring'
  | 'settings.management';

function isSettingsTutorialTargetId(
  targetId: string | null | undefined,
): targetId is SettingsTutorialTargetId {
  return (
    targetId === 'settings.start_tutorial' ||
    targetId === 'settings.recurring' ||
    targetId === 'settings.management'
  );
}

interface SettingsScreenProps {
  scrollToTopToken?: number;
  onOpenDisplay: () => void;
  onOpenHourlyValue: () => void;
  onOpenAccountSettings: () => void;
  onOpenAccounts: () => void;
  onOpenCategories: () => void;
  onOpenRecurring: () => void;
  onOpenDataManagement: () => void;
  onStartTutorial: () => void;
  onTutorialTargetLayout?: (targetId: SettingsTutorialTargetId, rect: TutorialTargetRect) => void;
  tutorialSpotlightRequest?: TutorialSpotlightRequest;
}

export function SettingsScreen({
  scrollToTopToken = 0,
  onOpenDisplay,
  onOpenHourlyValue,
  onOpenAccountSettings,
  onOpenAccounts,
  onOpenCategories,
  onOpenRecurring,
  onOpenDataManagement,
  onStartTutorial,
  onTutorialTargetLayout,
  tutorialSpotlightRequest,
}: SettingsScreenProps) {
  const { adRemovalState, settings, monthlyWages, updateSettings, isSimpleMode } = useApp();
  const themeColors = useThemeColors();
  const { height: windowHeight } = useWindowDimensions();
  const scrollViewRef = useRef<ScrollView | null>(null);
  const scrollOffsetRef = useRef(0);
  const scrollMeasureFrameRef = useRef<number | null>(null);
  const startTutorialRowRef = useRef<View | null>(null);
  const recurringRowRef = useRef<View | null>(null);
  const managementRowRef = useRef<View | null>(null);
  const lastTutorialTargetIdRef = useRef<SettingsTutorialTargetId | null>(null);

  const latestWage = monthlyWages[0] ?? null;
  const shouldShowAdSupportSection = !adRemovalState.hasAdFreeEntitlement || __DEV__;
  const shouldShowAdSupportSectionAtTop =
    shouldShowAdSupportSection && !adRemovalState.hasAdFreeEntitlement;
  const shouldShowAdSupportSectionAtBottom =
    shouldShowAdSupportSection && adRemovalState.hasAdFreeEntitlement;

  useEffect(() => {
    if (scrollToTopToken <= 0) return;
    const frame = requestAnimationFrame(() => {
      scrollViewRef.current?.scrollTo({ y: 0, animated: false });
    });
    return () => cancelAnimationFrame(frame);
  }, [scrollToTopToken]);

  const getTutorialTargetRef = useCallback((targetId: SettingsTutorialTargetId) => {
    if (targetId === 'settings.recurring') return recurringRowRef.current;
    if (targetId === 'settings.management') return managementRowRef.current;
    return startTutorialRowRef.current;
  }, []);
  const measureTutorialTarget = useCallback(
    (targetId: SettingsTutorialTargetId) => {
      if (!onTutorialTargetLayout) return;
      getTutorialTargetRef(targetId)?.measureInWindow((x, y, width, height) => {
        if (width <= 0 || height <= 0) return;
        onTutorialTargetLayout(targetId, { x, y, width, height });
      });
    },
    [getTutorialTargetRef, onTutorialTargetLayout],
  );
  const handleStartTutorialRowLayout = useCallback(() => {
    measureTutorialTarget('settings.start_tutorial');
  }, [measureTutorialTarget]);
  const handleRecurringRowLayout = useCallback(() => {
    measureTutorialTarget('settings.recurring');
  }, [measureTutorialTarget]);
  const handleManagementRowLayout = useCallback(() => {
    measureTutorialTarget('settings.management');
  }, [measureTutorialTarget]);
  const activeTutorialTargetId =
    tutorialSpotlightRequest?.active &&
    isSettingsTutorialTargetId(tutorialSpotlightRequest.targetId)
      ? tutorialSpotlightRequest.targetId
      : null;

  useEffect(() => {
    return () => {
      if (scrollMeasureFrameRef.current !== null) {
        cancelAnimationFrame(scrollMeasureFrameRef.current);
      }
    };
  }, []);

  const scheduleTutorialTargetMeasurement = useCallback(
    (targetId: SettingsTutorialTargetId) => {
      if (scrollMeasureFrameRef.current !== null) {
        cancelAnimationFrame(scrollMeasureFrameRef.current);
      }
      scrollMeasureFrameRef.current = requestAnimationFrame(() => {
        scrollMeasureFrameRef.current = null;
        measureTutorialTarget(targetId);
      });
    },
    [measureTutorialTarget],
  );

  const scrollTutorialTargetIntoView = useCallback(
    (targetId: SettingsTutorialTargetId) => {
      const targetRef = getTutorialTargetRef(targetId);
      if (!targetRef) {
        return;
      }

      targetRef.measureInWindow((_x, y, _width, height) => {
        if (height <= 0) {
          return;
        }

        const preferredTop = 120;
        const preferredBottom = Math.max(preferredTop + height + spacing.xl, windowHeight - 220);
        const bottom = y + height;

        let nextOffset = scrollOffsetRef.current;

        if (y < preferredTop) {
          nextOffset = Math.max(0, scrollOffsetRef.current - (preferredTop - y + spacing.md));
        } else if (bottom > preferredBottom) {
          nextOffset = Math.max(
            0,
            scrollOffsetRef.current + (bottom - preferredBottom + spacing.md),
          );
        }

        if (Math.abs(nextOffset - scrollOffsetRef.current) < 1) {
          return;
        }

        scrollOffsetRef.current = nextOffset;
        scrollViewRef.current?.scrollTo({ y: nextOffset, animated: false });
      });
    },
    [getTutorialTargetRef, windowHeight],
  );

  useEffect(() => {
    if (!activeTutorialTargetId) {
      lastTutorialTargetIdRef.current = null;
      return;
    }

    const shouldScrollIntoView = lastTutorialTargetIdRef.current !== activeTutorialTargetId;
    lastTutorialTargetIdRef.current = activeTutorialTargetId;

    if (shouldScrollIntoView) {
      scrollTutorialTargetIntoView(activeTutorialTargetId);
    }

    scheduleTutorialTargetMeasurement(activeTutorialTargetId);

    const secondPass = setTimeout(
      () => {
        measureTutorialTarget(activeTutorialTargetId);
      },
      shouldScrollIntoView ? 180 : 120,
    );

    return () => {
      clearTimeout(secondPass);
    };
  }, [
    activeTutorialTargetId,
    measureTutorialTarget,
    scheduleTutorialTargetMeasurement,
    scrollTutorialTargetIntoView,
    tutorialSpotlightRequest?.token,
  ]);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollOffsetRef.current = event.nativeEvent.contentOffset.y;
      if (!activeTutorialTargetId) return;
      scheduleTutorialTargetMeasurement(activeTutorialTargetId);
    },
    [activeTutorialTargetId, scheduleTutorialTargetMeasurement],
  );

  return (
    <SettingsPageLayout>
      <MonthControlsHeader
        title={I18n.t('settings.title')}
        monthLabel=""
        onPrevMonth={() => {}}
        onNextMonth={() => {}}
        hideNavigation
        showAccent={false}
        actions={<DisplayModeToggle />}
      />

      <ScrollView
        ref={scrollViewRef}
        className="flex-1"
        contentContainerStyle={styles.scrollContent}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        <Animated.View entering={FadeIn.delay(200).duration(400)} style={styles.contentBody}>
          {shouldShowAdSupportSectionAtTop ? <AdSupportSection /> : null}

          <SettingsSection
            className="mt-5 gap-2"
            title={I18n.t('settings.section_settings')}
            showAccent={false}
          >
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
              <SettingsRowItem
                icon={<SlidersHorizontal size={18} color={themeColors.primary} />}
                label={I18n.t('settings.account_settings')}
                subtitle={I18n.t('settings.account_settings_subtitle')}
                onPress={onOpenAccountSettings}
              />
              {!isSimpleMode ? (
                <SettingsRowItem
                  icon={<Landmark size={18} color={themeColors.primary} />}
                  label={I18n.t('settings.accounts')}
                  subtitle={I18n.t('settings.accounts_subtitle')}
                  onPress={onOpenAccounts}
                />
              ) : null}
              <View
                ref={managementRowRef}
                onLayout={() => {
                  handleManagementRowLayout();
                }}
              >
                <SettingsRowItem
                  icon={<FolderTree size={18} color={themeColors.primary} />}
                  label={I18n.t('settings.categories')}
                  subtitle={I18n.t('settings.categories_subtitle')}
                  onPress={onOpenCategories}
                />
              </View>
              <View
                ref={recurringRowRef}
                onLayout={() => {
                  handleRecurringRowLayout();
                }}
              >
                <SettingsRowItem
                  icon={<Repeat2 size={18} color={themeColors.primary} />}
                  label={I18n.t('settings.recurring')}
                  subtitle={I18n.t('settings.recurring_subtitle')}
                  onPress={onOpenRecurring}
                />
              </View>
              <SettingsRowItem
                icon={<DatabaseBackup size={18} color={themeColors.primary} />}
                label={I18n.t('settings.data_management')}
                subtitle={I18n.t('settings.data_management_subtitle')}
                onPress={onOpenDataManagement}
              />
              <View
                ref={startTutorialRowRef}
                onLayout={() => {
                  handleStartTutorialRowLayout();
                }}
              >
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
          </SettingsSection>

          {shouldShowAdSupportSectionAtBottom ? <AdSupportSection /> : null}
        </Animated.View>
      </ScrollView>
    </SettingsPageLayout>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: SETTINGS_FORM_BOTTOM_PADDING,
  },
  contentBody: {
    paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
  },
  rowsGroup: {
    marginTop: spacing.xs,
    gap: spacing.xs,
  },
});
