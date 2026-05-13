import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import {
  Bell,
  CalendarDays,
  Camera,
  ChevronRight,
  Clock3,
  Code2,
  Coins,
  Crown,
  DatabaseBackup,
  FileText,
  Fingerprint,
  FolderTree,
  Gift,
  Heart,
  Landmark,
  Newspaper,
  Package,
  Palette,
  Pencil,
  ReceiptText,
  RefreshCcw,
  Repeat2,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  UserRound,
  Zap,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  InteractionManager,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { useBottomNavScrollReporter } from '~/components/navigation/BottomNavMinimize';
import { MonthControlsHeader } from '~/components/navigation/MonthControlsHeader';
import {
  SETTINGS_FORM_BOTTOM_PADDING,
  SETTINGS_HORIZONTAL_PADDING,
  SettingsGrid,
  SettingsGridTile,
  SettingsPageLayout,
  SettingsSection,
  SettingsStatTile,
  Text,
  useSettingsBottomNavInset,
} from '~/components/ui';
import { spacing } from '~/constants/designSystem';
import { useApp, useTransactions } from '~/context/AppContext';
import { usePro } from '~/context/ProContext';
import { DisplayModeToggle } from '~/features/transactions/components';
import type { TutorialSpotlightRequest, TutorialTargetRect } from '~/features/tutorial/types';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { PreviewSeedProfile } from '~/services/previewData';
import { openStoreReviewManually } from '~/services/reviewPrompt';
import { deleteProfileAvatar, getProfileAvatarUri, saveProfileAvatar } from '~/services/userAssets';
import { getErrorMessage } from '~/utils/errorHandling';
import { FONT } from '~/utils/fonts';
import { monthKeyFromDateIso, monthKeyFromDateLocal } from '~/utils/formatters';

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
  values: Record<'profile' | 'transactions' | 'accounts' | 'categories' | 'recurringRules' | 'wageMonths', string | number>,
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
  onOpenItems: () => void;
  onOpenExchangeRates: () => void;
  onOpenCategories: () => void;
  onOpenRecurring: () => void;
  onOpenNotifications: () => void;
  onOpenDataManagement: () => void;
  onOpenNews: () => void;
  onOpenStatementImport: () => void;
  onOpenQuickEntry: () => void;
  onOpenAppLock: () => void;
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
  onOpenItems,
  onOpenExchangeRates,
  onOpenCategories,
  onOpenRecurring,
  onOpenNotifications,
  onOpenDataManagement,
  onOpenNews,
  onOpenStatementImport,
  onOpenQuickEntry,
  onOpenAppLock,
  onOpenProPaywall,
  onOpenProManagement,
  onOpenShareAndEarn,
  onOpenWidgetPreviews,
  onStartTutorial,
  onTutorialTargetLayout,
  tutorialSpotlightRequest,
}: SettingsScreenProps) {
  const { settings, monthlyWages, updateSettings, isSimpleMode, generatePreviewData } = useApp();
  const { transactions } = useTransactions();
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

  const profileStats = useMemo(() => {
    // Anchor "days tracking" on the earliest transaction, falling back to the
    // account creation date when nothing has been logged yet.
    let earliestMs = Number.POSITIVE_INFINITY;
    const currentMonthKey = monthKeyFromDateLocal(new Date());
    let thisMonthCount = 0;
    for (const tx of transactions) {
      const ms = new Date(tx.date).getTime();
      if (!Number.isNaN(ms) && ms < earliestMs) earliestMs = ms;
      if (monthKeyFromDateIso(tx.date) === currentMonthKey) thisMonthCount += 1;
    }

    if (!Number.isFinite(earliestMs)) {
      const created = new Date(settings.createdAt).getTime();
      if (!Number.isNaN(created)) earliestMs = created;
    }

    const hasAnchor = Number.isFinite(earliestMs);
    const anchor = hasAnchor ? new Date(earliestMs) : null;
    const daysTracking = anchor
      ? Math.max(1, Math.floor((Date.now() - earliestMs) / 86_400_000) + 1)
      : 1;
    const memberSince = anchor
      ? anchor.toLocaleDateString(settings.locale, { month: 'short', year: 'numeric' })
      : null;

    return {
      daysTracking,
      memberSince,
      totalCount: transactions.length,
      thisMonthCount,
    };
  }, [settings.createdAt, settings.locale, transactions]);

  const avatarUri = useMemo(
    () => getProfileAvatarUri(settings.profileAvatarUri),
    [settings.profileAvatarUri],
  );
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');

  const handleEditName = useCallback(() => {
    void triggerHaptic('selection');
    setNameDraft(settings.profileName ?? '');
    setEditingName(true);
  }, [settings.profileName]);

  const handleCommitName = useCallback(() => {
    const trimmed = nameDraft.trim();
    updateSettings({ profileName: trimmed.length > 0 ? trimmed : null });
    setEditingName(false);
  }, [nameDraft, updateSettings]);

  const handlePickAvatar = useCallback(async () => {
    void triggerHaptic('selection');
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        I18n.t('accounts.logo.permission_title'),
        I18n.t('accounts.logo.permission_message'),
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    if (result.canceled || !result.assets?.[0]) return;
    try {
      const previous = settings.profileAvatarUri;
      const relativePath = saveProfileAvatar(result.assets[0].uri);
      updateSettings({ profileAvatarUri: relativePath });
      if (previous) deleteProfileAvatar(previous);
    } catch (error) {
      Alert.alert(I18n.t('errors.generic_operation_failed'), getErrorMessage(error));
    }
  }, [settings.profileAvatarUri, updateSettings]);

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
          <View className="mt-3 rounded-[28px] border border-border/40 bg-card p-5 shadow-soft">
            <View className="flex-row items-center gap-4">
              <Pressable
                onPress={() => void handlePickAvatar()}
                accessibilityRole="button"
                accessibilityLabel={I18n.t('settings.profile_edit_photo')}
                className="h-16 w-16 items-center justify-center rounded-full border border-primary/15 bg-primary/10 active:opacity-80"
                style={styles.ctaShadow}
              >
                {avatarUri ? (
                  <Image
                    source={{ uri: avatarUri }}
                    style={{ height: 64, width: 64, borderRadius: 32 }}
                    contentFit="cover"
                  />
                ) : (
                  <UserRound size={30} color={themeColors.primary} />
                )}
                <View
                  className="absolute -bottom-0.5 -right-0.5 h-6 w-6 items-center justify-center rounded-full border-2 border-card"
                  style={{ backgroundColor: themeColors.primary }}
                >
                  <Camera size={12} color="#fff" />
                </View>
              </Pressable>
              <View className="flex-1">
                <View className="flex-row items-center gap-2">
                  {editingName ? (
                    <TextInput
                      autoFocus
                      value={nameDraft}
                      onChangeText={setNameDraft}
                      onBlur={handleCommitName}
                      onSubmitEditing={handleCommitName}
                      returnKeyType="done"
                      maxLength={40}
                      placeholder={I18n.t('settings.profile_name_add')}
                      placeholderTextColor={themeColors.textMuted}
                      selectionColor={themeColors.primary}
                      style={{
                        flex: 1,
                        paddingVertical: 0,
                        color: themeColors.text,
                        fontFamily: FONT.bold,
                        fontSize: 19,
                      }}
                    />
                  ) : (
                    <Pressable
                      onPress={handleEditName}
                      accessibilityRole="button"
                      accessibilityLabel={I18n.t('settings.profile_edit_name')}
                      className="flex-1 flex-row items-center gap-1.5 active:opacity-70"
                    >
                      {settings.profileName ? (
                        <Text
                          variant="heading"
                          numberOfLines={1}
                          className="text-[19px] tracking-tight"
                        >
                          {settings.profileName}
                        </Text>
                      ) : (
                        <>
                          <Text
                            variant="heading"
                            tone="muted"
                            numberOfLines={1}
                            className="text-[19px] tracking-tight"
                          >
                            {I18n.t('settings.profile_name_add')}
                          </Text>
                          <Pencil size={14} color={themeColors.textMuted} />
                        </>
                      )}
                    </Pressable>
                  )}
                  {!editingName ? (
                    isPro ? (
                      <View
                        className="rounded-full px-2 py-[3px]"
                        style={{ backgroundColor: themeColors.primary }}
                      >
                        <Text
                          className="text-[10px] tracking-[1.5px]"
                          style={{ color: '#fff', fontFamily: FONT.extrabold, fontWeight: '800' }}
                        >
                          PRO
                        </Text>
                      </View>
                    ) : (
                      <View
                        className="rounded-full border px-2 py-[3px]"
                        style={{ borderColor: themeColors.border, backgroundColor: 'transparent' }}
                      >
                        <Text
                          className="text-[10px] tracking-[1.5px]"
                          style={{
                            color: themeColors.textMuted,
                            fontFamily: FONT.semibold,
                            fontWeight: '600',
                          }}
                        >
                          FREE
                        </Text>
                      </View>
                    )
                  ) : null}
                </View>
                <Text variant="friendly" tone="muted" className="mt-0.5 text-xs">
                  {profileStats.memberSince
                    ? I18n.t('settings.profile_member_since', { date: profileStats.memberSince })
                    : I18n.t('settings.profile_member_new')}
                </Text>
              </View>
            </View>

            <View className="my-4 h-px bg-border/40" />

            <View className="flex-row items-center">
              <SettingsStatTile
                icon={<CalendarDays size={16} color={themeColors.textMuted} />}
                value={String(profileStats.daysTracking)}
                label={I18n.t('settings.stat_days')}
              />
              <View className="h-9 w-px bg-border/40" />
              <SettingsStatTile
                icon={<ReceiptText size={16} color={themeColors.textMuted} />}
                value={String(profileStats.totalCount)}
                label={I18n.t('settings.stat_transactions')}
              />
              <View className="h-9 w-px bg-border/40" />
              <SettingsStatTile
                icon={<TrendingUp size={16} color={themeColors.textMuted} />}
                value={String(profileStats.thisMonthCount)}
                label={I18n.t('settings.stat_this_month')}
              />
            </View>
          </View>

          {!isPro ? (
            <Pressable
              onPress={() => {
                void triggerHaptic('selection');
                onOpenProPaywall();
              }}
              className="mt-3 flex-row items-center gap-3 rounded-3xl px-4 py-4 active:scale-[0.98] active:opacity-95"
              style={[
                { backgroundColor: themeColors.primary },
                coloredCtaShadow(themeColors.primary),
              ]}
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
          ) : null}

          {!isPro ? (
            <Pressable
              onPress={() => {
                void triggerHaptic('selection');
                onOpenShareAndEarn();
              }}
              className="mt-2 flex-row items-center gap-3 rounded-3xl px-4 py-4 active:scale-[0.98] active:opacity-95"
              style={[{ backgroundColor: '#F5A623' }, coloredCtaShadow('#F5A623')]}
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
            <SettingsGrid>
              <SettingsGridTile
                icon={<Palette size={20} color={themeColors.primary} />}
                label={I18n.t('settings.display')}
                onPress={onOpenDisplay}
              />
              <SettingsGridTile
                icon={<Clock3 size={20} color={themeColors.primary} />}
                label={I18n.t('settings.hourly_value')}
                onPress={onOpenHourlyValue}
              />
              <SettingsGridTile
                icon={<Bell size={20} color={themeColors.primary} />}
                label={I18n.t('settings.notifications')}
                onPress={onOpenNotifications}
              />
            </SettingsGrid>
          </SettingsSection>

          <SettingsSection
            className="mt-6 gap-2"
            title={I18n.t('settings.section_money')}
            showAccent={false}
          >
            <SettingsGrid>
              <SettingsGridTile
                icon={<SlidersHorizontal size={20} color={themeColors.primary} />}
                label={I18n.t('settings.account_settings')}
                onPress={onOpenAccountSettings}
              />
              {!isSimpleMode ? (
                <SettingsGridTile
                  icon={<Landmark size={20} color={themeColors.primary} />}
                  label={I18n.t('settings.accounts')}
                  onPress={onOpenAccounts}
                />
              ) : null}
              <SettingsGridTile
                icon={<Package size={20} color={themeColors.primary} />}
                label={I18n.t('items.title')}
                onPress={onOpenItems}
              />
              {!isSimpleMode ? (
                <SettingsGridTile
                  icon={<Coins size={20} color={themeColors.primary} />}
                  label={I18n.t('exchange_rates.title')}
                  onPress={onOpenExchangeRates}
                />
              ) : null}
              <SettingsGridTile
                icon={<FolderTree size={20} color={themeColors.primary} />}
                label={I18n.t('settings.categories')}
                onPress={onOpenCategories}
              />
              <View ref={recurringRowRef} onLayout={handleRecurringRowLayout}>
                <SettingsGridTile
                  icon={<Repeat2 size={20} color={themeColors.primary} />}
                  label={I18n.t('settings.recurring')}
                  onPress={onOpenRecurring}
                />
              </View>
              <SettingsGridTile
                icon={<Zap size={20} color={themeColors.primary} />}
                label={I18n.t('settings.quick_entry.title')}
                onPress={onOpenQuickEntry}
              />
            </SettingsGrid>
          </SettingsSection>

          <SettingsSection
            className="mt-6 gap-2"
            title={I18n.t('settings.section_data')}
            showAccent={false}
          >
            <SettingsGrid>
              <View ref={statementImportRowRef} onLayout={handleStatementImportRowLayout}>
                <SettingsGridTile
                  icon={<FileText size={20} color={themeColors.primary} />}
                  label={I18n.t('settings.statement_import')}
                  onPress={onOpenStatementImport}
                />
              </View>
              <View ref={managementRowRef} onLayout={handleManagementRowLayout}>
                <SettingsGridTile
                  icon={<DatabaseBackup size={20} color={themeColors.primary} />}
                  label={I18n.t('settings.data_management')}
                  onPress={onOpenDataManagement}
                />
              </View>
              <SettingsGridTile
                icon={<Fingerprint size={20} color={themeColors.primary} />}
                label={I18n.t('settings.app_lock.title')}
                pro={!isPro}
                onPress={isPro ? onOpenAppLock : onOpenProPaywall}
              />
            </SettingsGrid>
          </SettingsSection>

          <SettingsSection
            className="mt-6 gap-2"
            title={I18n.t('settings.section_support')}
            showAccent={false}
          >
            <SettingsGrid>
              <SettingsGridTile
                icon={<Crown size={20} color={themeColors.primary} />}
                label={I18n.t('pro.manage_subscription')}
                onPress={isPro ? onOpenProManagement : onOpenProPaywall}
              />
              <View ref={startTutorialRowRef} onLayout={handleStartTutorialRowLayout}>
                <SettingsGridTile
                  icon={<Sparkles size={20} color={themeColors.primary} />}
                  label={I18n.t('settings.start_tutorial')}
                  onPress={onStartTutorial}
                />
              </View>
              <SettingsGridTile
                icon={<RefreshCcw size={20} color={themeColors.primary} />}
                label={I18n.t('settings.replay_onboarding')}
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
              <SettingsGridTile
                icon={<Newspaper size={20} color={themeColors.primary} />}
                label={I18n.t('settings.news')}
                onPress={onOpenNews}
              />
              <SettingsGridTile
                icon={<Heart size={20} color={themeColors.primary} />}
                label={I18n.t('settings.rate_app')}
                onPress={() => {
                  void openStoreReviewManually();
                }}
              />
            </SettingsGrid>
          </SettingsSection>

          {__DEV__ ? (
            <SettingsSection className="mt-6 gap-2" title="Developer" showAccent={false}>
              <SettingsGrid>
                <SettingsGridTile
                  icon={
                    <Crown size={20} color={isPro ? themeColors.primary : themeColors.textMuted} />
                  }
                  label={isPro ? 'Pro: ON' : 'Pro: OFF'}
                  onPress={() => setDevProOverride(!isPro)}
                />
                {onOpenWidgetPreviews ? (
                  <SettingsGridTile
                    icon={<Code2 size={20} color={themeColors.primary} />}
                    label="Widget previews"
                    onPress={onOpenWidgetPreviews}
                  />
                ) : null}
                <SettingsGridTile
                  emoji="🧪"
                  label={previewCopy.rowLabel}
                  haptic="warning"
                  onPress={handleGeneratePreviewData}
                />
              </SettingsGrid>
            </SettingsSection>
          ) : null}
        </Animated.View>
      </ScrollView>
    </SettingsPageLayout>
  );
}

/** Soft shadow tinted to a CTA's own color — reads far nicer on the warm UI
 *  than a generic dark drop shadow. */
function coloredCtaShadow(color: string) {
  return Platform.OS === 'ios'
    ? {
        shadowColor: color,
        shadowOpacity: 0.35,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 8 },
      }
    : { elevation: 5 };
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: SETTINGS_FORM_BOTTOM_PADDING,
  },
  contentBody: {
    paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
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
