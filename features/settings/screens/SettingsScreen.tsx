import { Image } from 'expo-image';
import * as Updates from 'expo-updates';
import {
  CalendarDays,
  Camera,
  ChevronRight,
  Code2,
  Crown,
  Gift,
  Pencil,
  ReceiptText,
  RefreshCcw,
  TrendingUp,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Linking,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { DiscordIcon } from '~/components/icons/SocialIcons';
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
  ThemeModal,
  useSettingsBottomNavInset,
} from '~/components/ui';
import { ClayIcon } from '~/components/ui/ClayIcon';
import { useApp, useTransactions } from '~/context/AppContext';
import { usePro } from '~/context/ProContext';
import { useIsFlatIcons } from '~/context/ThemeContext';
import { ReimbursementTileBadge } from '~/features/reimbursements/components/ReimbursementTileBadge';
import { DisplayModeToggle } from '~/features/transactions/components';
import { SettleUpTileBadge } from '~/features/transactions/components/SettleUpTileBadge';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { resetCloudBackupPromptState } from '~/services/cloudBackupPrompt';
import { triggerHaptic } from '~/services/haptics';
import { pickLibraryImage } from '~/services/libraryImagePicker';
import { isLiveActivityAvailable } from '~/services/liveActivity';
import {
  PREVIEW_PROFILE_FOR_LOCALE,
  PREVIEW_PROFILE_LABELS,
  type PreviewSeedProfile,
} from '~/services/previewData';
import { openStoreReviewManually } from '~/services/reviewPrompt';
import { deleteProfileAvatar, getProfileAvatarUri, saveProfileAvatar } from '~/services/userAssets';
import { cn } from '~/utils';
import { getErrorMessage } from '~/utils/errorHandling';
import {
  financialMonthKeyForDate,
  financialMonthKeyForIso,
  monthCycleOf,
} from '~/utils/financialMonth';
import { FONT } from '~/utils/fonts';

const CONTACT_DISCORD_URL = 'https://discord.gg/rFYCpcJhxd';
const DISCORD_BRAND_COLOR = '#5865F2';

// Developer tools (incl. the preview-data generator) are hidden from the App
// Store / TestFlight build only. We can't use `__DEV__` alone: an `eas update`
// ships a *release* JS bundle, so `__DEV__` is false even inside an internal
// dev-client build — which is exactly where we want these tools available.
// Store builds ship with expo-updates disabled (see app.config.ts), so their
// channel reads `null` rather than `'production'`; `Updates.isEnabled` is what
// keeps these tools out of the App Store build. Internal dev-client / preview
// builds have updates enabled and keep the tools over EAS Update.
const SHOW_DEV_TOOLS = __DEV__ || (Updates.isEnabled && Updates.channel !== 'production');

const PREVIEW_SCREEN_COPY = {
  en: {
    rowLabel: 'Generate preview data',
    confirmTitle: 'Generate preview data?',
    confirmMessage:
      'Choose a profile. This replaces your local accounts, categories, transactions, budgets, recurring rules, and wage history with screenshot-ready sample data.',
    matchLanguage: 'Match app language: {{profile}}',
    chooseProfile: 'Choose a profile…',
    failedMessage: 'Unable to generate preview data. Please try again.',
    doneTitle: 'Preview data ready',
    doneMessage:
      '{{profile}} preview loaded with {{transactions}} transactions across {{accounts}} accounts, {{categories}} categories, {{recurringRules}} recurring rules, and {{wageMonths}} months of income history.',
  },
  zh: {
    rowLabel: '生成预览数据',
    confirmTitle: '生成预览数据？',
    confirmMessage:
      '请选择一个配置。这会用适合截图的样例数据替换你当前的本地账户、分类、交易、预算、循环规则和收入历史。',
    matchLanguage: '匹配应用语言：{{profile}}',
    chooseProfile: '选择其他配置…',
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

interface SettingsScreenProps {
  scrollToTopToken?: number;
  onOpenDisplay: () => void;
  onOpenHourlyValue: () => void;
  onOpenAccountSettings: () => void;
  onOpenAccounts: () => void;
  onOpenItems: () => void;
  onOpenAlbums: () => void;
  onOpenExchangeRates: () => void;
  onOpenCategories: () => void;
  onOpenRecurring: () => void;
  onOpenNotifications: () => void;
  onOpenDataManagement: () => void;
  onOpenNews: () => void;
  onOpenTutorials: () => void;
  onOpenStatementImport: () => void;
  onOpenQuickEntry: () => void;
  onOpenAutoLog: () => void;
  onOpenAppLock: () => void;
  onOpenReceipts: () => void;
  onOpenBudget: () => void;
  /** `source` names the entry point, for the paywall funnel's attribution. */
  onOpenProPaywall: (source: string) => void;
  onOpenProManagement: () => void;
  onOpenShareAndEarn: () => void;
  onOpenSettleUp: () => void;
  onOpenReimbursements: () => void;
  onOpenWidgets: () => void;
  onOpenWidgetPreviews?: () => void;
}

export function SettingsScreen({
  scrollToTopToken = 0,
  onOpenDisplay,
  onOpenHourlyValue,
  onOpenAccountSettings,
  onOpenAccounts,
  onOpenItems,
  onOpenAlbums,
  onOpenExchangeRates,
  onOpenCategories,
  onOpenRecurring,
  onOpenNotifications,
  onOpenDataManagement,
  onOpenNews,
  onOpenTutorials,
  onOpenStatementImport,
  onOpenQuickEntry,
  onOpenAutoLog,
  onOpenAppLock,
  onOpenReceipts,
  onOpenBudget,
  onOpenProPaywall,
  onOpenProManagement,
  onOpenShareAndEarn,
  onOpenSettleUp,
  onOpenReimbursements,
  onOpenWidgets,
  onOpenWidgetPreviews,
}: SettingsScreenProps) {
  const { settings, updateSettings, generatePreviewData } = useApp();
  const monthCycle = monthCycleOf(settings);
  const { transactions } = useTransactions();
  const { isPro, setDevProOverride } = usePro();
  const themeColors = useThemeColors();
  const isFlatIcons = useIsFlatIcons();
  const bottomNavInset = useSettingsBottomNavInset();
  const reportBottomNavScroll = useBottomNavScrollReporter();
  const scrollViewRef = useRef<ScrollView | null>(null);

  const profileStats = useMemo(() => {
    // Anchor "days tracking" on the earliest transaction, falling back to the
    // account creation date when nothing has been logged yet.
    let earliestMs = Number.POSITIVE_INFINITY;
    const currentMonthKey = financialMonthKeyForDate(new Date(), monthCycle);
    let thisMonthCount = 0;
    for (const tx of transactions) {
      const ms = new Date(tx.date).getTime();
      if (!Number.isNaN(ms) && ms < earliestMs) earliestMs = ms;
      if (financialMonthKeyForIso(tx.date, monthCycle) === currentMonthKey) thisMonthCount += 1;
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
  }, [settings.createdAt, settings.locale, monthCycle, transactions]);

  const resolvedAvatarUri = useMemo(
    () => getProfileAvatarUri(settings.profileAvatarUri),
    [settings.profileAvatarUri],
  );
  // Skip a uri that failed to load natively; see CategoryEmoji for why.
  const [brokenAvatarUri, setBrokenAvatarUri] = useState<string | null>(null);
  const avatarUri = resolvedAvatarUri !== brokenAvatarUri ? resolvedAvatarUri : null;
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [contactVisible, setContactVisible] = useState(false);

  const handleJoinDiscord = useCallback(() => {
    void triggerHaptic('selection');
    void Linking.openURL(CONTACT_DISCORD_URL).catch(() => undefined);
    setContactVisible(false);
  }, []);

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
    await pickLibraryImage(
      (uri) => {
        const previous = settings.profileAvatarUri;
        const relativePath = saveProfileAvatar(uri);
        updateSettings({ profileAvatarUri: relativePath });
        if (previous) deleteProfileAvatar(previous);
      },
      { aspect: [1, 1] },
    );
  }, [settings.profileAvatarUri, updateSettings]);

  useEffect(() => {
    if (scrollToTopToken <= 0) return;
    const frame = requestAnimationFrame(() => {
      scrollViewRef.current?.scrollTo({ y: 0, animated: false });
    });
    return () => cancelAnimationFrame(frame);
  }, [scrollToTopToken]);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      reportBottomNavScroll(event);
    },
    [reportBottomNavScroll],
  );

  const previewCopy = settings.locale === 'zh' ? PREVIEW_SCREEN_COPY.zh : PREVIEW_SCREEN_COPY.en;

  const handleGeneratePreviewData = useCallback(() => {
    const runPreviewSeed = async (profile: PreviewSeedProfile) => {
      try {
        const summary = await generatePreviewData(profile);
        Alert.alert(
          previewCopy.doneTitle,
          formatPreviewDoneMessage(previewCopy.doneMessage, {
            profile: PREVIEW_PROFILE_LABELS[profile],
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

    const chooseProfile = () => {
      const profiles = Object.keys(PREVIEW_PROFILE_LABELS) as PreviewSeedProfile[];
      Alert.alert(previewCopy.confirmTitle, undefined, [
        { text: I18n.t('common.cancel'), style: 'cancel' },
        ...profiles.map((profile) => ({
          text: PREVIEW_PROFILE_LABELS[profile],
          onPress: () => void runPreviewSeed(profile),
        })),
      ]);
    };

    const localeProfile = PREVIEW_PROFILE_FOR_LOCALE[settings.locale] ?? 'malaysian_en';
    Alert.alert(previewCopy.confirmTitle, previewCopy.confirmMessage, [
      { text: I18n.t('common.cancel'), style: 'cancel' },
      {
        text: previewCopy.matchLanguage.replace(
          '{{profile}}',
          PREVIEW_PROFILE_LABELS[localeProfile],
        ),
        onPress: () => void runPreviewSeed(localeProfile),
      },
      { text: previewCopy.chooseProfile, onPress: chooseProfile },
    ]);
  }, [generatePreviewData, previewCopy, settings.locale]);

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
                className={cn(
                  'h-16 w-16 items-center justify-center rounded-full active:opacity-80',
                  // The clay bust is the visual on its own; a tinted disc behind
                  // it would read as a second container. Only the uploaded photo
                  // needs the plate to clip against, and the flat bust needs it
                  // as its own container.
                  avatarUri || isFlatIcons ? 'border border-primary/15 bg-primary/10' : null,
                )}
                style={avatarUri || isFlatIcons ? styles.ctaShadow : undefined}
              >
                {avatarUri ? (
                  <Image
                    source={{ uri: avatarUri }}
                    style={{ height: 64, width: 64, borderRadius: 32 }}
                    contentFit="cover"
                    onError={() => setBrokenAvatarUri(avatarUri)}
                  />
                ) : (
                  <ClayIcon name="settings/profile" size={64} flatSize={30} />
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
                onOpenProPaywall('settings_banner');
              }}
              className="mt-3 flex-row items-center gap-3 rounded-3xl px-4 py-4 active:scale-[0.98] active:opacity-95"
              style={[
                { backgroundColor: themeColors.primary },
                coloredCtaShadow(themeColors.primary),
              ]}
            >
              {/* On the coloured CTA the flat crown needs its translucent disc
                  to separate from the fill; clay sits straight on it. */}
              {isFlatIcons ? (
                <View className="h-10 w-10 items-center justify-center rounded-full bg-white/20">
                  <Crown size={20} color="#fff" fill="#fff" />
                </View>
              ) : (
                <ClayIcon name="settings/pro" size={44} />
              )}
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
              {isFlatIcons ? (
                <View className="h-10 w-10 items-center justify-center rounded-full bg-white/20">
                  <Gift size={20} color="#fff" />
                </View>
              ) : (
                <ClayIcon name="settings/share-earn" size={44} />
              )}
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
                icon={<ClayIcon name="settings/display" size={34} flatSize={20} />}
                label={I18n.t('settings.display')}
                onPress={onOpenDisplay}
              />
              <SettingsGridTile
                icon={<ClayIcon name="settings/hourly-value" size={34} flatSize={20} />}
                label={I18n.t('settings.hourly_value')}
                onPress={onOpenHourlyValue}
              />
              <SettingsGridTile
                icon={<ClayIcon name="settings/notifications" size={34} flatSize={20} />}
                label={I18n.t('settings.notifications')}
                onPress={onOpenNotifications}
              />
              {/* The hub holds nothing but the Live Activity today, so on
                  Android it would open an empty page. */}
              {isLiveActivityAvailable ? (
                <SettingsGridTile
                  icon={<ClayIcon name="nav/grid" size={34} flatSize={20} />}
                  label={I18n.t('widgets.settings_title')}
                  onPress={onOpenWidgets}
                />
              ) : null}
            </SettingsGrid>
          </SettingsSection>

          <SettingsSection
            className="mt-6 gap-2"
            title={I18n.t('settings.section_money')}
            showAccent={false}
          >
            <SettingsGrid>
              <SettingsGridTile
                icon={<ClayIcon name="settings/account-settings" size={34} flatSize={20} />}
                label={I18n.t('settings.account_settings')}
                onPress={onOpenAccountSettings}
              />
              <SettingsGridTile
                icon={<ClayIcon name="settings/accounts" size={34} flatSize={20} />}
                label={I18n.t('settings.accounts')}
                onPress={onOpenAccounts}
              />
              <SettingsGridTile
                icon={<ClayIcon name="settings/items" size={34} flatSize={20} />}
                label={I18n.t('items.title')}
                onPress={onOpenItems}
              />
              <SettingsGridTile
                icon={<ClayIcon name="settings/albums" size={34} flatSize={20} />}
                label={I18n.t('albums.title')}
                onPress={onOpenAlbums}
              />
              <SettingsGridTile
                icon={<ClayIcon name="settings/receipts" size={34} flatSize={20} />}
                label={I18n.t('receipts.title')}
                onPress={onOpenReceipts}
              />
              <SettingsGridTile
                icon={<ClayIcon name="settings/budget" size={34} flatSize={20} />}
                label={I18n.t('budget.title')}
                onPress={onOpenBudget}
              />
              <SettingsGridTile
                icon={<ClayIcon name="settings/exchange-rates" size={34} flatSize={20} />}
                label={I18n.t('exchange_rates.title')}
                onPress={onOpenExchangeRates}
              />
              <SettingsGridTile
                icon={<ClayIcon name="settings/categories" size={34} flatSize={20} />}
                label={I18n.t('settings.categories')}
                onPress={onOpenCategories}
              />
              <SettingsGridTile
                icon={<ClayIcon name="settings/recurring" size={34} flatSize={20} />}
                label={I18n.t('settings.recurring')}
                onPress={onOpenRecurring}
              />
              <SettingsGridTile
                icon={<ClayIcon name="settings/quick-entry" size={34} flatSize={20} />}
                label={I18n.t('settings.quick_entry.title')}
                onPress={onOpenQuickEntry}
              />
              {/* Auto-log rides the iOS Shortcuts "Transaction" automation and
                  Back Tap; Android has no equivalent trigger. */}
              {Platform.OS === 'ios' ? (
                <SettingsGridTile
                  icon={<ClayIcon name="settings/auto-log" size={34} flatSize={20} />}
                  label={I18n.t('settings.auto_log.title')}
                  onPress={onOpenAutoLog}
                />
              ) : null}
              <SettingsGridTile
                icon={<ClayIcon name="settings/settle-up" size={34} flatSize={20} />}
                label={I18n.t('transactions.settleUp.title')}
                onPress={onOpenSettleUp}
                badge={<SettleUpTileBadge />}
              />
              <SettingsGridTile
                icon={<ClayIcon name="money-time/wallet-in" size={34} flatSize={20} />}
                label={I18n.t('reimbursements.tile_label')}
                onPress={onOpenReimbursements}
                badge={<ReimbursementTileBadge />}
              />
            </SettingsGrid>
          </SettingsSection>

          <SettingsSection
            className="mt-6 gap-2"
            title={I18n.t('settings.section_data')}
            showAccent={false}
          >
            <SettingsGrid>
              <SettingsGridTile
                icon={<ClayIcon name="settings/statement-import" size={34} flatSize={20} />}
                label={I18n.t('settings.statement_import')}
                onPress={onOpenStatementImport}
              />
              <SettingsGridTile
                icon={<ClayIcon name="settings/data-management" size={34} flatSize={20} />}
                label={I18n.t('settings.data_management')}
                onPress={onOpenDataManagement}
              />
              <SettingsGridTile
                icon={<ClayIcon name="settings/app-lock" size={34} flatSize={20} />}
                label={I18n.t('settings.app_lock.title')}
                pro={!isPro}
                onPress={isPro ? onOpenAppLock : () => onOpenProPaywall('app_lock')}
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
                icon={<ClayIcon name="ui/checklist" size={34} flatSize={20} />}
                label={I18n.t('tutorials.title')}
                onPress={onOpenTutorials}
              />
              <SettingsGridTile
                icon={<ClayIcon name="settings/pro" size={34} flatSize={20} />}
                label={I18n.t('pro.manage_subscription')}
                onPress={
                  isPro ? onOpenProManagement : () => onOpenProPaywall('settings_subscription')
                }
              />
              <SettingsGridTile
                icon={<ClayIcon name="settings/replay" size={34} flatSize={20} />}
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
                icon={<ClayIcon name="settings/news" size={34} flatSize={20} />}
                label={I18n.t('settings.news')}
                onPress={onOpenNews}
              />
              <SettingsGridTile
                icon={<ClayIcon name="settings/rate" size={34} flatSize={20} />}
                label={I18n.t('settings.rate_app')}
                onPress={() => {
                  void openStoreReviewManually();
                }}
              />
              <SettingsGridTile
                icon={<ClayIcon name="settings/contact" size={34} flatSize={20} />}
                label={I18n.t('settings.contact.tile')}
                onPress={() => {
                  void triggerHaptic('selection');
                  setContactVisible(true);
                }}
              />
            </SettingsGrid>
          </SettingsSection>

          {SHOW_DEV_TOOLS ? (
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
                <SettingsGridTile
                  icon={<RefreshCcw size={20} color={themeColors.primary} />}
                  label="Reset cloud prompt"
                  onPress={() => {
                    void triggerHaptic('success');
                    void resetCloudBackupPromptState();
                  }}
                />
              </SettingsGrid>
            </SettingsSection>
          ) : null}
        </Animated.View>
      </ScrollView>

      <ThemeModal
        visible={contactVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setContactVisible(false)}
      >
        <Pressable
          onPress={() => setContactVisible(false)}
          className="flex-1 items-center justify-center px-6"
          style={styles.modalBackdrop}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            className="w-full max-w-[380px] items-center rounded-[28px] border border-border/40 bg-card px-6 pb-6 pt-7"
          >
            <View
              className="h-16 w-16 items-center justify-center rounded-3xl"
              style={{ backgroundColor: DISCORD_BRAND_COLOR }}
            >
              <DiscordIcon size={34} color="#fff" />
            </View>
            <Text
              variant="subheading"
              className="mt-4 text-center text-lg"
              style={{ fontFamily: FONT.extrabold, fontWeight: '800' }}
            >
              {I18n.t('settings.contact.title')}
            </Text>
            <Text variant="friendly" tone="muted" className="mt-2 text-center text-sm leading-5">
              {I18n.t('settings.contact.body')}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={handleJoinDiscord}
              className="mt-5 w-full flex-row items-center justify-center gap-2 rounded-2xl px-5 py-3.5 active:scale-[0.98] active:opacity-90"
              style={{ backgroundColor: DISCORD_BRAND_COLOR }}
            >
              <DiscordIcon size={18} color="#fff" />
              <Text
                className="text-sm"
                style={{ color: '#fff', fontFamily: FONT.extrabold, fontWeight: '800' }}
              >
                {I18n.t('settings.contact.button')}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => setContactVisible(false)}
              className="mt-2 w-full items-center justify-center rounded-2xl px-5 py-3 active:opacity-70"
            >
              <Text variant="friendly" tone="muted" className="text-sm">
                {I18n.t('settings.contact.close')}
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </ThemeModal>
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
  modalBackdrop: {
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
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
