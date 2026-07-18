import { BookOpen, Camera, ChevronRight, Nfc, PlusCircle } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { AddActionSheet } from '~/components/navigation/AddActionSheet';
import {
  SettingsHeader,
  SettingsPageLayout,
  Text,
  useSettingsBottomNavInset,
} from '~/components/ui';
import {
  LOG_CARD_PAYMENT_INTENT_NAME,
  NEW_TRANSACTION_INTENT_NAME,
  SCAN_SCREENSHOT_INTENT_NAME,
} from '~/constants/autoLogIntents';
import { useApp } from '~/context/AppContext';
import {
  findFallbackCategory,
  pickDefaultAccountId,
} from '~/features/transactions/lib/entryDefaults';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import type { AutoLogTutorialTopic } from '~/navigation/settingsStack';
import { enqueueTestAutoLogTap } from '~/services/autoLog';
import { triggerHaptic } from '~/services/haptics';
import { isSpeechRecognitionAvailable } from '~/services/speechRecognition';
import type { AddButtonAction } from '~/types';
import { getErrorMessage } from '~/utils/errorHandling';

interface AutoLogSettingsScreenProps {
  onBack: () => void;
  onOpenTutorial: (topic: AutoLogTutorialTopic) => void;
  onOpenQuickEntry: () => void;
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 48,
  },
  card: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  rowDivider: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.06)',
    marginLeft: 16,
  },
  iconBubble: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  tutorialLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
});

/**
 * Section title with a compact "Tutorial" link on the right. Replaces the old
 * full-width button that sat under each card — the link keeps the walkthrough one
 * tap away without dominating the section.
 */
function AutoLogSectionHeader({
  title,
  onTutorial,
  tutorialColor,
}: {
  title: string;
  onTutorial: () => void;
  tutorialColor: string;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text variant="caption" tone="muted">
        {title}
      </Text>
      <Pressable
        style={styles.tutorialLink}
        onPress={() => {
          void triggerHaptic('selection');
          onTutorial();
        }}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={I18n.t('settings.auto_log.tutorial_button')}
      >
        <BookOpen size={13} color={tutorialColor} />
        <Text variant="caption" style={{ color: tutorialColor }}>
          {I18n.t('settings.auto_log.tutorial_button')}
        </Text>
      </Pressable>
    </View>
  );
}

export function AutoLogSettingsScreen({
  onBack,
  onOpenTutorial,
  onOpenQuickEntry,
}: AutoLogSettingsScreenProps) {
  const {
    accounts,
    categories,
    quickEntryPrefs,
    isSimpleMode,
    simpleWalletId,
    updateQuickEntryPrefs,
  } = useApp();
  const themeColors = useThemeColors();
  const bottomNavInset = useSettingsBottomNavInset();
  const [actionPickerVisible, setActionPickerVisible] = useState(false);

  // Availability is async, so hide the voice tile until it answers rather than
  // offering an action this device cannot run.
  const [voiceSupported, setVoiceSupported] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const ok = await isSpeechRecognitionAvailable();
      if (!cancelled) setVoiceSupported(ok);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Mirror what the drain resolves, so the screen never advertises an account
  // or category the intent would not actually use.
  const defaultAccountName = useMemo(() => {
    const id = isSimpleMode
      ? simpleWalletId
      : pickDefaultAccountId(accounts, quickEntryPrefs.defaultAccountId);
    return accounts.find((account) => account.id === id)?.name ?? null;
  }, [accounts, isSimpleMode, quickEntryPrefs.defaultAccountId, simpleWalletId]);

  const defaultCategoryName = useMemo(() => {
    const explicit = categories.find(
      (category) =>
        category.id === quickEntryPrefs.defaultExpenseCategoryId && category.type === 'expense',
    );
    return (explicit ?? findFallbackCategory(categories, 'expense'))?.name ?? null;
  }, [categories, quickEntryPrefs.defaultExpenseCategoryId]);

  // `backTapAction` is a legacy pref name — it drives the New Transaction intent
  // whatever runs it, not just Back Tap. Kept as-is because it is persisted in
  // the `quickEntryPrefsJson` blob and mirrored in the Swift catalog decodable,
  // so renaming it costs a migration for no user-visible gain.
  const handlePickOpensAction = useCallback(
    (action: AddButtonAction | 'none') => {
      setActionPickerVisible(false);
      if (action === 'none') return;
      updateQuickEntryPrefs({ backTapAction: action });
    },
    [updateQuickEntryPrefs],
  );

  const handleOpenQuickEntry = useCallback(() => {
    void triggerHaptic('selection');
    onOpenQuickEntry();
  }, [onOpenQuickEntry]);

  const handleToggleSubcategories = useCallback(
    (value: boolean) => {
      void triggerHaptic('selection');
      updateQuickEntryPrefs({ autoLogIncludeSubcategories: value });
    },
    [updateQuickEntryPrefs],
  );

  const handleToggleAutoCategorize = useCallback(
    (value: boolean) => {
      void triggerHaptic('selection');
      updateQuickEntryPrefs({ autoLogAutoCategorize: value });
    },
    [updateQuickEntryPrefs],
  );

  const handleToggleSaveScreenshot = useCallback(
    (value: boolean) => {
      void triggerHaptic('selection');
      updateQuickEntryPrefs({ autoLogSaveScreenshot: value });
    },
    [updateQuickEntryPrefs],
  );

  const handleSimulateTap = useCallback(async () => {
    void triggerHaptic('selection');
    try {
      const ok = await enqueueTestAutoLogTap('$12.34', 'Test Merchant', 'Test Card');
      Alert.alert(
        'Automation',
        ok
          ? 'Queued a test tap. It drains into a transaction just like the real automation.'
          : 'Native automation module unavailable. Run `npx expo prebuild -p ios`, then rebuild.',
      );
    } catch (error) {
      // The bridge rejects when the App Group is unreachable.
      Alert.alert('Automation', getErrorMessage(error));
    }
  }, []);

  return (
    <SettingsPageLayout>
      <ScrollView className="flex-1" contentContainerStyle={[styles.scrollContent, bottomNavInset]}>
        <View className="px-5">
          <SettingsHeader
            className="px-0 pt-5 pb-3"
            onBack={onBack}
            title={I18n.t('settings.auto_log.title')}
          />

          {/* One section per Shortcuts action, headed by the action's own name.
              Grouping by trigger instead ("Back Tap opens") read as a lie: Back
              Tap is only one of the things that can run New Transaction, and the
              rows under it configure the action, not the gesture. The names are
              hardcoded English on purpose — see constants/autoLogIntents.ts. */}
          <View className="mt-2">
            <AutoLogSectionHeader
              title={LOG_CARD_PAYMENT_INTENT_NAME}
              onTutorial={() => onOpenTutorial('logPayment')}
              tutorialColor={themeColors.primary}
            />
            <View style={styles.card} className="bg-card border border-border/30">
              <View style={styles.row}>
                <View style={[styles.iconBubble, { backgroundColor: `${themeColors.primary}14` }]}>
                  <Nfc size={18} color={themeColors.primary} />
                </View>
                <View style={styles.rowText}>
                  <Text variant="caption" tone="muted">
                    {I18n.t('settings.auto_log.log_payment_hint')}
                  </Text>
                </View>
              </View>
              <View style={styles.rowDivider} />
              <View style={styles.row}>
                <View style={styles.rowText}>
                  <Text variant="body" className="text-foreground">
                    {I18n.t('settings.auto_log.auto_categorize_label')}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {I18n.t('settings.auto_log.auto_categorize_hint')}
                  </Text>
                </View>
                <Switch
                  value={quickEntryPrefs.autoLogAutoCategorize}
                  onValueChange={handleToggleAutoCategorize}
                  trackColor={{ false: themeColors.border, true: themeColors.primary }}
                />
              </View>
              {/* The mapping the auto-categorizer reads lives in Quick Entry, so
                  link there rather than duplicating it. Only useful while on. */}
              {quickEntryPrefs.autoLogAutoCategorize ? (
                <>
                  <View style={styles.rowDivider} />
                  <Pressable style={styles.row} onPress={handleOpenQuickEntry}>
                    <View style={styles.rowText}>
                      <Text variant="body" className="text-foreground">
                        {I18n.t('settings.auto_log.auto_categorize_mapping_link')}
                      </Text>
                    </View>
                    <ChevronRight size={18} color={themeColors.textMuted} />
                  </Pressable>
                </>
              ) : null}
              <View style={styles.rowDivider} />
              <View style={styles.row}>
                <View style={styles.rowText}>
                  <Text variant="body" className="text-foreground">
                    {I18n.t('settings.auto_log.subcategories_label')}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {I18n.t('settings.auto_log.subcategories_hint')}
                  </Text>
                </View>
                <Switch
                  value={quickEntryPrefs.autoLogIncludeSubcategories}
                  onValueChange={handleToggleSubcategories}
                  trackColor={{ false: themeColors.border, true: themeColors.primary }}
                />
              </View>
            </View>
          </View>

          {/* Log Screenshot sits above New Transaction: both install a ready-made
              shortcut, and screenshot logging is the more discoverable habit. */}
          <View className="mt-6">
            <AutoLogSectionHeader
              title={SCAN_SCREENSHOT_INTENT_NAME}
              onTutorial={() => onOpenTutorial('logScreenshot')}
              tutorialColor={themeColors.primary}
            />
            <View style={styles.card} className="bg-card border border-border/30">
              <View style={styles.row}>
                <View style={[styles.iconBubble, { backgroundColor: `${themeColors.primary}14` }]}>
                  <Camera size={18} color={themeColors.primary} />
                </View>
                <View style={styles.rowText}>
                  <Text variant="caption" tone="muted">
                    {I18n.t('settings.auto_log.log_screenshot_hint')}
                  </Text>
                </View>
              </View>
              <View style={styles.rowDivider} />
              <View style={styles.row}>
                <View style={styles.rowText}>
                  <Text variant="body" className="text-foreground">
                    {I18n.t('settings.auto_log.save_screenshot_label')}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {I18n.t('settings.auto_log.save_screenshot_hint')}
                  </Text>
                </View>
                <Switch
                  value={quickEntryPrefs.autoLogSaveScreenshot}
                  onValueChange={handleToggleSaveScreenshot}
                  trackColor={{ false: themeColors.border, true: themeColors.primary }}
                />
              </View>
            </View>
          </View>

          <View className="mt-6">
            <AutoLogSectionHeader
              title={NEW_TRANSACTION_INTENT_NAME}
              onTutorial={() => onOpenTutorial('newTransaction')}
              tutorialColor={themeColors.primary}
            />
            <View style={styles.card} className="bg-card border border-border/30">
              <View style={styles.row}>
                <View style={[styles.iconBubble, { backgroundColor: `${themeColors.primary}14` }]}>
                  <PlusCircle size={18} color={themeColors.primary} />
                </View>
                <View style={styles.rowText}>
                  <Text variant="caption" tone="muted">
                    {I18n.t('settings.auto_log.new_transaction_hint')}
                  </Text>
                </View>
              </View>
              <View style={styles.rowDivider} />
              {/* Same sheet Quick Entry uses to map the + button's tap/hold. */}
              <Pressable style={styles.row} onPress={() => setActionPickerVisible(true)}>
                <View style={styles.rowText}>
                  <Text variant="body" className="text-foreground">
                    {I18n.t('settings.auto_log.opens_label')}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {I18n.t(
                      `settings.quick_entry.add_button.action_${quickEntryPrefs.backTapAction}`,
                    )}
                  </Text>
                </View>
                <ChevronRight size={18} color={themeColors.textMuted} />
              </Pressable>
            </View>
          </View>

          {/* Both actions resolve these, so they sit on their own rather than
              under either one. Account and category are Quick Entry's defaults,
              not a second copy — editing them there is what the drain reads. */}
          <View className="mt-6">
            <Text variant="caption" tone="muted" className="mb-2 px-1">
              {I18n.t('settings.auto_log.defaults_title')}
            </Text>
            <View style={styles.card} className="bg-card border border-border/30">
              <Pressable style={styles.row} onPress={handleOpenQuickEntry}>
                <View style={styles.rowText}>
                  <Text variant="body" className="text-foreground">
                    {I18n.t('settings.auto_log.default_account')}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {defaultAccountName ?? I18n.t('settings.auto_log.default_none')}
                  </Text>
                </View>
                <ChevronRight size={18} color={themeColors.textMuted} />
              </Pressable>
              <View style={styles.rowDivider} />
              <Pressable style={styles.row} onPress={handleOpenQuickEntry}>
                <View style={styles.rowText}>
                  <Text variant="body" className="text-foreground">
                    {I18n.t('settings.auto_log.default_category')}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {defaultCategoryName ?? I18n.t('settings.auto_log.default_none')}
                  </Text>
                </View>
                <ChevronRight size={18} color={themeColors.textMuted} />
              </Pressable>
            </View>
            <Text variant="caption" tone="muted" className="mt-2 px-1">
              {I18n.t('settings.auto_log.defaults_hint')}
            </Text>
          </View>

          {/* Dev-only, so the copy stays hardcoded English like the Developer
              section on the settings home. A simulator has no NFC and no
              Shortcuts app, so this is the only way to exercise the real path. */}
          {__DEV__ ? (
            <View className="mt-6">
              <Text variant="caption" tone="muted" className="mb-2 px-1">
                Developer
              </Text>
              <Pressable
                style={styles.card}
                className="bg-card border border-border/30"
                onPress={() => void handleSimulateTap()}
              >
                <View style={styles.row}>
                  <View style={styles.rowText}>
                    <Text variant="body" className="text-foreground">
                      Simulate Apple Pay tap
                    </Text>
                    <Text variant="caption" tone="muted">
                      Queues $12.34 at Test Merchant, then drains it
                    </Text>
                  </View>
                  <ChevronRight size={18} color={themeColors.textMuted} />
                </View>
              </Pressable>
            </View>
          ) : null}
        </View>
      </ScrollView>

      <AddActionSheet
        visible={actionPickerVisible}
        onClose={() => setActionPickerVisible(false)}
        mode="pick"
        voiceAvailable={voiceSupported}
        title={NEW_TRANSACTION_INTENT_NAME}
        pickSelected={quickEntryPrefs.backTapAction}
        onPickAction={handlePickOpensAction}
      />
    </SettingsPageLayout>
  );
}
