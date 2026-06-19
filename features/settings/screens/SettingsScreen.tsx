import {
  Bell,
  ChevronRight,
  Clock3,
  Code2,
  Crown,
  DatabaseBackup,
  FileText,
  FolderTree,
  Gift,
  Heart,
  Landmark,
  Newspaper,
  Palette,
  RefreshCcw,
  Repeat2,
  SlidersHorizontal,
  Sparkles,
  Zap,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useRef } from 'react';
import {
  Alert,
  InteractionManager,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { useBottomNavScrollReporter } from '~/components/navigation/BottomNavMinimize';
import { MonthControlsHeader } from '~/components/navigation/MonthControlsHeader';
import {
  SETTINGS_FORM_BOTTOM_PADDING,
  SETTINGS_HORIZONTAL_PADDING,
  SettingsPageLayout,
  SettingsRowItem,
  SettingsSection,
  Text,
  useSettingsBottomNavInset,
} from '~/components/ui';
import { spacing } from '~/constants/designSystem';
import { useApp } from '~/context/AppContext';
import { usePro } from '~/context/ProContext';
import { DisplayModeToggle } from '~/features/transactions/components';
import type { TutorialSpotlightRequest, TutorialTargetRect } from '~/features/tutorial/types';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { PreviewSeedProfile } from '~/services/previewData';
import { openStoreReviewManually } from '~/services/reviewPrompt';
import { getErrorMessage } from '~/utils/errorHandling';
import { FONT } from '~/utils/fonts';

const PREVIEW_SCREEN_COPY = {
  en: {
    sectionTitle: 'Preview Data',
    rowLabel: 'Generate preview data',
    rowSubtitle: 'Load American, Chinese, or Malaysian sample data for screenshots',
    confirmTitle: 'Generate preview data?',
    confirmMessage:
      'Choose a profile. This replaces your local accounts, categories, transactions, recurring rules, and wage history with screenshot-ready sample data.',
    americanProfile: 'American',
    chineseProfile: 'Chinese',
    malaysianEnProfile: 'Malaysian (EN)',
    malaysianZhProfile: 'Malaysian (中文)',
    failedMessage: 'Unable to generate preview data. Please try again.',
    doneTitle: 'Preview data ready',
    doneMessage:
      '{{profile}} preview loaded with {{transactions}} transactions across {{accounts}} accounts, {{categories}} categories, {{recurringRules}} recurring rules, and {{wageMonths}} months of income history.',
  },
  zh: {
    sectionTitle: '预览数据',
    rowLabel: '生成预览数据',
    rowSubtitle: '加载美式、中文或马来西亚样例数据，方便截图和预览',
    confirmTitle: '生成预览数据？',
    confirmMessage:
      '请选择一个配置。这会用适合截图的样例数据替换你当前的本地账户、分类、交易、循环规则和收入历史。',
    americanProfile: '美式',
    chineseProfile: '中文',
    malaysianEnProfile: '马来西亚 (EN)',
    malaysianZhProfile: '马来西亚 (中文)',
    failedMessage: '无法生成预览数据，请重试。',
    doneTitle: '预览数据已准备好',
    doneMessage:
      '已加载 {{profile}} 预览：包含 {{transactions}} 条交易、{{accounts}} 个账户、{{categories}} 个分类、{{recurringRules}} 条循环规则，以及 {{wageMonths}} 个月的收入历史。',
  },
} as const;

function formatPreviewDoneMessage(
  template: string,
  values: Record<
    'profile' | 'transactions' | 'accounts' | 'categories' | 'recurringRules' | 'wageMonths',
    string | number
  >,
) {
  return template.replace(
    /\{\{(profile|transactions|accounts|categories|recurringRules|wageMonths)\}\}/g,
    (_, key: keyof typeof values) => String(values[key]),
  );
}

type SettingsTutorialTargetId =
  | 'settings.start_tutorial'
  | 'settings.recurring'
  | 'settings.management'
  | 'settings.statement_import';

function isSettingsTutorialTargetId(
  targetId: string | null | undefined,
): targetId is SettingsTutorialTargetId {
  return (
    targetId === 'settings.start_tutorial' ||
    targetId === 'settings.recurring' ||
    targetId === 'settings.management' ||
    targetId === 'settings.statement_import'
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
  onOpenNotifications: () => void;
  onOpenDataManagement: () => void;
  onOpenNews: () => void;
  onOpenStatementImport: () => void;
  onOpenQuickEntry: () => void;
  onOpenProPaywall: () => void;
  onOpenProManagement: () => void;
  onOpenShareAndEarn: () => void;
  onOpenWidgetPreviews?: () => void;
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
  onOpenNotifications,
  onOpenDataManagement,
  onOpenNews,
  onOpenStatementImport,
  onOpenQuickEntry,
  onOpenProPaywall,
  onOpenProManagement,
  onOpenShareAndEarn,
  onOpenWidgetPreviews,
  onStartTutorial,
  onTutorialTargetLayout,
  tutorialSpotlightRequest,
}: SettingsScreenProps) {
  const { settings, monthlyWages, updateSettings, isSimpleMode, generatePreviewData } = useApp();
  const { isPro, setDevProOverride } = usePro();
  const themeColors = useThemeColors();
  const { height: windowHeight } = useWindowDimensions();
  const bottomNavInset = useSettingsBottomNavInset();
  const reportBottomNavScroll = useBottomNavScrollReporter();
  const scrollViewRef = useRef<ScrollView | null>(null);
  const scrollOffsetRef = useRef(0);
  const scrollMeasureFrameRef = useRef<number | null>(null);
  const startTutorialRowRef = useRef<View | null>(null);
  const recurringRowRef = useRef<View | null>(null);
  const managementRowRef = useRef<View | null>(null);
  const statementImportRowRef = useRef<View | null>(null);
  const lastTutorialTargetIdRef = useRef<SettingsTutorialTargetId | null>(null);

  const latestWage = monthlyWages[0] ?? null;
  const previewCopy = settings.locale === 'zh' ? PREVIEW_SCREEN_COPY.zh : PREVIEW_SCREEN_COPY.en;

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
    if (targetId === 'settings.statement_import') return statementImportRowRef.current;
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
  const handleStatementImportRowLayout = useCallback(() => {
    measureTutorialTarget('settings.statement_import');
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

    const interactionHandle = InteractionManager.runAfterInteractions(() => {
      measureTutorialTarget(activeTutorialTargetId);
    });
    const secondPass = setTimeout(
      () => {
        measureTutorialTarget(activeTutorialTargetId);
      },
      shouldScrollIntoView ? 180 : 120,
    );
    // Android commits scroll / layout later than iOS; give it two extra passes.
    const androidThirdPass =
      Platform.OS === 'android'
        ? setTimeout(
            () => {
              measureTutorialTarget(activeTutorialTargetId);
            },
            shouldScrollIntoView ? 420 : 320,
          )
        : null;
    const androidFourthPass =
      Platform.OS === 'android'
        ? setTimeout(
            () => {
              measureTutorialTarget(activeTutorialTargetId);
            },
            shouldScrollIntoView ? 720 : 600,
          )
        : null;

    return () => {
      interactionHandle.cancel();
      clearTimeout(secondPass);
      if (androidThirdPass) clearTimeout(androidThirdPass);
      if (androidFourthPass) clearTimeout(androidFourthPass);
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
      reportBottomNavScroll(event);
      if (!activeTutorialTargetId) return;
      scheduleTutorialTargetMeasurement(activeTutorialTargetId);
    },
    [activeTutorialTargetId, reportBottomNavScroll, scheduleTutorialTargetMeasurement],
  );

  const handleGeneratePreviewData = useCallback(() => {
    const profileLabels: Record<PreviewSeedProfile, string> = {
      american: previewCopy.americanProfile,
      chinese: previewCopy.chineseProfile,
      malaysian_en: previewCopy.malaysianEnProfile,
      malaysian_zh: previewCopy.malaysianZhProfile,
    };

    const runPreviewSeed = (profile: PreviewSeedProfile) => {
      try {
        const summary = generatePreviewData(profile);
        Alert.alert(
          previewCopy.doneTitle,
          formatPreviewDoneMessage(previewCopy.doneMessage, {
            profile: profileLabels[profile],
            accounts: summary.accounts,
            categories: summary.categories,
            recurringRules: summary.recurringRules,
            transactions: summary.transactions,
            wageMonths: summary.wageMonths,
          }),
        );
      } catch (error) {
        Alert.alert(
          I18n.t('errors.generic_operation_failed'),
          getErrorMessage(error, previewCopy.failedMessage),
        );
      }
    };

    Alert.alert(previewCopy.confirmTitle, previewCopy.confirmMessage, [
      { text: I18n.t('common.cancel'), style: 'cancel' },
      { text: previewCopy.americanProfile, onPress: () => runPreviewSeed('american') },
      { text: previewCopy.chineseProfile, onPress: () => runPreviewSeed('chinese') },
      { text: previewCopy.malaysianEnProfile, onPress: () => runPreviewSeed('malaysian_en') },
      { text: previewCopy.malaysianZhProfile, onPress: () => runPreviewSeed('malaysian_zh') },
    ]);
  }, [generatePreviewData, previewCopy]);

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
        contentContainerStyle={[styles.scrollContent, bottomNavInset]}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        <Animated.View entering={FadeIn.delay(200).duration(400)} style={styles.contentBody}>
          {isPro ? (
            <Pressable
              onPress={() => {
                void triggerHaptic('selection');
                onOpenProManagement();
              }}
              className="mt-3 flex-row items-center gap-3 rounded-2xl border border-border/45 bg-surface px-4 py-3.5"
            >
              <Crown size={20} color={themeColors.primary} />
              <View className="flex-1">
                <View className="flex-row items-center gap-1.5">
                  <Text variant="subheading" className="text-sm">
                    Money2Time
                  </Text>
                  <View
                    className="rounded-md px-1.5 py-0.5"
                    style={{ backgroundColor: themeColors.primary }}
                  >
                    <Text
                      className="text-[10px] font-extrabold tracking-wide"
                      style={{ color: '#fff' }}
                    >
                      PRO
                    </Text>
                  </View>
                </View>
                <Text variant="friendly" tone="muted" className="text-xs">
                  {I18n.t('pro.manage')}
                </Text>
              </View>
              <ChevronRight size={18} color={themeColors.textMuted} />
            </Pressable>
          ) : (
            <Pressable
              onPress={() => {
                void triggerHaptic('selection');
                onOpenProPaywall();
              }}
              className="mt-3 flex-row items-center gap-3 rounded-2xl px-4 py-4 active:scale-[0.98] active:opacity-95"
              style={[styles.ctaShadow, { backgroundColor: themeColors.primary }]}
            >
              <View className="h-10 w-10 items-center justify-center rounded-full bg-white/20">
                <Crown size={20} color="#fff" fill="#fff" />
              </View>
              <View className="flex-1">
                <Text
                  className="text-[15px]"
                  style={{ color: '#fff', fontFamily: FONT.extrabold, fontWeight: '800' }}
                >
                  {I18n.t('pro.upgrade')}
                </Text>
                <Text className="text-xs" style={{ color: 'rgba(255,255,255,0.85)' }}>
                  {I18n.t('pro.upgrade_subtitle')}
                </Text>
              </View>
              <ChevronRight size={20} color="#fff" />
            </Pressable>
          )}

          {!isPro ? (
            <Pressable
              onPress={() => {
                void triggerHaptic('selection');
                onOpenShareAndEarn();
              }}
              className="mt-2 flex-row items-center gap-3 rounded-2xl px-4 py-4 active:scale-[0.98] active:opacity-95"
              style={[styles.ctaShadow, { backgroundColor: '#F5A623' }]}
            >
              <View className="h-10 w-10 items-center justify-center rounded-full bg-white/20">
                <Gift size={20} color="#fff" />
              </View>
              <View className="flex-1">
                <Text
                  className="text-[15px]"
                  style={{ color: '#fff', fontFamily: FONT.extrabold, fontWeight: '800' }}
                >
                  {I18n.t('shareEarn.row_label')}
                </Text>
                <Text className="text-xs" style={{ color: 'rgba(255,255,255,0.9)' }}>
                  {I18n.t('shareEarn.row_subtitle')}
                </Text>
              </View>
              <ChevronRight size={20} color="#fff" />
            </Pressable>
          ) : null}

          <SettingsSection
            className="mt-6 gap-2"
            title={I18n.t('settings.section_personal')}
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
                    : I18n.t('settings.hourly_value_subtitle')
                }
                onPress={onOpenHourlyValue}
              />
              <SettingsRowItem
                icon={<Bell size={18} color={themeColors.primary} />}
                label={I18n.t('settings.notifications')}
                subtitle={I18n.t('settings.notifications_subtitle')}
                onPress={onOpenNotifications}
              />
            </View>
          </SettingsSection>

          <SettingsSection
            className="mt-6 gap-2"
            title={I18n.t('settings.section_money')}
            showAccent={false}
          >
            <View style={styles.rowsGroup}>
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
              <SettingsRowItem
                icon={<FolderTree size={18} color={themeColors.primary} />}
                label={I18n.t('settings.categories')}
                subtitle={I18n.t('settings.categories_subtitle')}
                onPress={onOpenCategories}
              />
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
                icon={<Zap size={18} color={themeColors.primary} />}
                label={I18n.t('settings.quick_entry.title')}
                subtitle={I18n.t('settings.quick_entry.row_subtitle')}
                onPress={onOpenQuickEntry}
              />
            </View>
          </SettingsSection>

          <SettingsSection
            className="mt-6 gap-2"
            title={I18n.t('settings.section_data')}
            showAccent={false}
          >
            <View style={styles.rowsGroup}>
              <View
                ref={statementImportRowRef}
                onLayout={() => {
                  handleStatementImportRowLayout();
                }}
              >
                <SettingsRowItem
                  icon={<FileText size={18} color={themeColors.primary} />}
                  label={I18n.t('settings.statement_import')}
                  subtitle={I18n.t('settings.statement_import_subtitle')}
                  onPress={onOpenStatementImport}
                />
              </View>
              <View
                ref={managementRowRef}
                onLayout={() => {
                  handleManagementRowLayout();
                }}
              >
                <SettingsRowItem
                  icon={<DatabaseBackup size={18} color={themeColors.primary} />}
                  label={I18n.t('settings.data_management')}
                  subtitle={I18n.t('settings.data_management_subtitle')}
                  onPress={onOpenDataManagement}
                />
              </View>
            </View>
          </SettingsSection>

          <SettingsSection
            className="mt-6 gap-2"
            title={I18n.t('settings.section_support')}
            showAccent={false}
          >
            <View style={styles.rowsGroup}>
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
              <SettingsRowItem
                icon={<Newspaper size={18} color={themeColors.primary} />}
                label={I18n.t('settings.news')}
                subtitle={I18n.t('settings.news_subtitle')}
                onPress={onOpenNews}
              />
              <SettingsRowItem
                icon={<Heart size={18} color={themeColors.primary} />}
                label={I18n.t('settings.rate_app')}
                subtitle={I18n.t('settings.rate_app_subtitle')}
                onPress={() => {
                  void openStoreReviewManually();
                }}
              />
            </View>
          </SettingsSection>

          {__DEV__ ? (
            <SettingsSection className="mt-6 gap-2" title="Developer" showAccent={false}>
              <View style={styles.rowsGroup}>
                <SettingsRowItem
                  icon={<Crown size={18} color={themeColors.primary} />}
                  label="Pro status"
                  subtitle="Override RevenueCat for testing gated features"
                  showChevron={false}
                  onPress={() => setDevProOverride(!isPro)}
                  rightAccessory={
                    <View
                      className={`rounded-full px-2.5 py-1 ${
                        isPro ? 'bg-primary/15' : 'bg-muted-foreground/15'
                      }`}
                    >
                      <Text
                        variant="label"
                        className={isPro ? 'text-primary' : 'text-muted-foreground'}
                        style={{ fontFamily: FONT.semibold, fontWeight: '600' }}
                      >
                        {isPro ? 'PRO' : 'FREE'}
                      </Text>
                    </View>
                  }
                />
                {onOpenWidgetPreviews ? (
                  <SettingsRowItem
                    icon={<Code2 size={18} color={themeColors.primary} />}
                    label="Widget previews"
                    subtitle="Preview all widgets and supported sizes"
                    onPress={onOpenWidgetPreviews}
                  />
                ) : null}
                <SettingsRowItem
                  emoji="🧪"
                  label={previewCopy.rowLabel}
                  subtitle={previewCopy.rowSubtitle}
                  haptic="warning"
                  onPress={handleGeneratePreviewData}
                />
              </View>
            </SettingsSection>
          ) : null}
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
    gap: spacing.xxs,
  },
  ctaShadow: {
    ...(Platform.OS === 'ios'
      ? {
          shadowColor: '#0F172A',
          shadowOpacity: 0.12,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
        }
      : { elevation: 2 }),
  },
});
