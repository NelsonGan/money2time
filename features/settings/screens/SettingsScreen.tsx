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
  HandCoins,
  Heart,
  Images,
  Landmark,
  MessageCircle,
  Newspaper,
  Nfc,
  Package,
  Palette,
  Pencil,
  PiggyBank,
  ReceiptText,
  RefreshCcw,
  Repeat2,
  SlidersHorizontal,
  TrendingUp,
  UserRound,
  Zap,
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
import { useApp, useTransactions } from '~/context/AppContext';
import { usePro } from '~/context/ProContext';
import { useValueWhileTabVisible } from '~/context/TabVisibilityContext';
import { DisplayModeToggle } from '~/features/transactions/components';
import { SettleUpTileBadge } from '~/features/transactions/components/SettleUpTileBadge';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { resetCloudBackupPromptState } from '~/services/cloudBackupPrompt';
import { triggerHaptic } from '~/services/haptics';
import { openStoreReviewManually } from '~/services/reviewPrompt';
import { deleteProfileAvatar, getProfileAvatarUri, saveProfileAvatar } from '~/services/userAssets';
import { getErrorMessage } from '~/utils/errorHandling';
import { FONT } from '~/utils/fonts';
import { monthKeyFromDateIso, monthKeyFromDateLocal } from '~/utils/formatters';

const CONTACT_DISCORD_URL = 'https://discord.gg/rFYCpcJhxd';
const DISCORD_BRAND_COLOR = '#5865F2';

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
  onOpenStatementImport: () => void;
  onOpenQuickEntry: () => void;
  onOpenAutoLog: () => void;
  onOpenAppLock: () => void;
  onOpenReceipts: () => void;
  onOpenBudget: () => void;
  onOpenProPaywall: () => void;
  onOpenProManagement: () => void;
  onOpenShareAndEarn: () => void;
  onOpenSettleUp: () => void;
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
  onOpenWidgetPreviews,
}: SettingsScreenProps) {
  const { settings, updateSettings, isSimpleMode } = useApp();
  const { transactions: liveTransactions } = useTransactions();
  // Profile stats are cosmetic — while the settings tab is hidden, hold the
  // last-seen snapshot instead of re-scanning all transactions on every write.
  const transactions = useValueWhileTabVisible(liveTransactions);
  const { isPro, setDevProOverride } = usePro();
  const themeColors = useThemeColors();
  const bottomNavInset = useSettingsBottomNavInset();
  const reportBottomNavScroll = useBottomNavScrollReporter();
  const scrollViewRef = useRef<ScrollView | null>(null);
  const scrollOffsetRef = useRef(0);

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

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollOffsetRef.current = event.nativeEvent.contentOffset.y;
      reportBottomNavScroll(event);
    },
    [reportBottomNavScroll],
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
              <SettingsGridTile
                icon={<Images size={20} color={themeColors.primary} />}
                label={I18n.t('albums.title')}
                onPress={onOpenAlbums}
              />
              <SettingsGridTile
                icon={<ReceiptText size={20} color={themeColors.primary} />}
                label={I18n.t('receipts.title')}
                onPress={onOpenReceipts}
              />
              <SettingsGridTile
                icon={<PiggyBank size={20} color={themeColors.primary} />}
                label={I18n.t('budget.title')}
                onPress={onOpenBudget}
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
              <SettingsGridTile
                icon={<Repeat2 size={20} color={themeColors.primary} />}
                label={I18n.t('settings.recurring')}
                onPress={onOpenRecurring}
              />
              <SettingsGridTile
                icon={<Zap size={20} color={themeColors.primary} />}
                label={I18n.t('settings.quick_entry.title')}
                onPress={onOpenQuickEntry}
              />
              {/* Auto-log rides the iOS Shortcuts "Transaction" automation and
                  Back Tap; Android has no equivalent trigger. */}
              {Platform.OS === 'ios' ? (
                <SettingsGridTile
                  icon={<Nfc size={20} color={themeColors.primary} />}
                  label={I18n.t('settings.auto_log.title')}
                  onPress={onOpenAutoLog}
                />
              ) : null}
              <SettingsGridTile
                icon={<HandCoins size={20} color={themeColors.primary} />}
                label={I18n.t('transactions.settleUp.title')}
                onPress={onOpenSettleUp}
                badge={<SettleUpTileBadge />}
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
                icon={<FileText size={20} color={themeColors.primary} />}
                label={I18n.t('settings.statement_import')}
                onPress={onOpenStatementImport}
              />
              <SettingsGridTile
                icon={<DatabaseBackup size={20} color={themeColors.primary} />}
                label={I18n.t('settings.data_management')}
                onPress={onOpenDataManagement}
              />
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
              <SettingsGridTile
                icon={<MessageCircle size={20} color={themeColors.primary} />}
                label={I18n.t('settings.contact.tile')}
                onPress={() => {
                  void triggerHaptic('selection');
                  setContactVisible(true);
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
