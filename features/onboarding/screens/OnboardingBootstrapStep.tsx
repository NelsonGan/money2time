import { Image } from 'expo-image';
import { Check } from 'lucide-react-native';
import React, { useEffect } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Mascot } from '~/components/feedback/Mascot';
import { Button, Card, CardContent, Text, ThemeModal } from '~/components/ui';
import { OnboardingActionBar } from '~/features/onboarding/components/OnboardingActionBar';
import {
  ONBOARDING_ACTION_BAR_RESERVED_SPACE,
  ONBOARDING_CHECKLIST_ACTION_BAR_RESERVED_SPACE,
  ONBOARDING_HORIZONTAL_PADDING,
} from '~/features/onboarding/constants/layout';
import { useEdgeSwipeBack } from '~/hooks/useEdgeSwipeBack';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { MMImportSummary } from '~/services/mmbakImportService';
import { cn } from '~/utils';

export type BootstrapChoice = 'import' | 'fresh';
export type BootstrapView = 'choose' | 'import-result' | 'fresh-checklist';
const MONEY_MANAGER_REALBYTE_LOGO = require('../../../assets/brands/money-manager-realbyte-logo.png');

const styles = StyleSheet.create({
  contentContainer: {
    paddingHorizontal: ONBOARDING_HORIZONTAL_PADDING,
    paddingBottom: ONBOARDING_ACTION_BAR_RESERVED_SPACE,
  },
  checklistContentContainer: {
    paddingHorizontal: ONBOARDING_HORIZONTAL_PADDING,
    paddingBottom: ONBOARDING_CHECKLIST_ACTION_BAR_RESERVED_SPACE,
  },
  importBrandLogo: {
    width: 32,
    height: 32,
  },
  freshOptionEmoji: {
    fontSize: 20,
  },
  checklistEmoji: {
    fontSize: 16,
  },
  requiredBadgeText: {
    fontSize: 10,
  },
});

interface OnboardingBootstrapStepProps {
  onBack: () => void;
  onImport: () => void;
  onGoToAccounts: () => void;
  onGoToCategories: () => void;
  onAddTransaction: () => void;
  onFinish: () => void;
  onSkipWithWarning: () => void;
  choice: BootstrapChoice | null;
  view: BootstrapView;
  onChoiceChange: (choice: BootstrapChoice) => void;
  onViewChange: (view: BootstrapView) => void;
  canCreateMinimalDefaults: boolean;
  onCreateMinimalDefaults: () => void;
  importResult: MMImportSummary | null;
  isImporting: boolean;
  accountCount: number;
  expenseCategoryCount: number;
  incomeCategoryCount: number;
  transactionCount: number;
}

export function OnboardingBootstrapStep({
  onBack,
  onImport,
  onGoToAccounts,
  onGoToCategories,
  onAddTransaction,
  onFinish,
  onSkipWithWarning,
  choice,
  view,
  onChoiceChange,
  onViewChange,
  canCreateMinimalDefaults,
  onCreateMinimalDefaults,
  importResult,
  isImporting,
  accountCount,
  expenseCategoryCount,
  incomeCategoryCount,
  transactionCount,
}: OnboardingBootstrapStepProps) {
  const themeColors = useThemeColors();
  const hasAccount = accountCount >= 1;
  const hasExpenseCategory = expenseCategoryCount >= 1;
  const hasIncomeCategory = incomeCategoryCount >= 1;
  const hasTransaction = transactionCount >= 1;
  const completedCount = [hasAccount, hasExpenseCategory, hasIncomeCategory, hasTransaction].filter(
    Boolean,
  ).length;
  const canFinishFresh = hasAccount;
  const swipeBackGesture = useEdgeSwipeBack(onBack);

  const handleContinue = () => {
    void triggerHaptic('medium');
    if (choice === 'import') {
      onImport();
    } else if (choice === 'fresh') {
      onViewChange('fresh-checklist');
    }
  };

  const handleSkipFresh = () => {
    void triggerHaptic('selection');
    Alert.alert(
      I18n.t('onboarding.bootstrap.skip_title'),
      I18n.t('onboarding.bootstrap.skip_message'),
      [
        { text: I18n.t('onboarding.bootstrap.continue_setup'), style: 'cancel' },
        {
          text: I18n.t('onboarding.bootstrap.skip_anyway'),
          onPress: onSkipWithWarning,
        },
      ],
    );
  };

  // Show import result after import completes
  useEffect(() => {
    if (importResult && view !== 'import-result') {
      onViewChange('import-result');
    }
  }, [importResult, onViewChange, view]);

  // === CHOOSE VIEW ===
  if (view === 'choose') {
    return (
      <GestureDetector gesture={swipeBackGesture}>
        <View className="flex-1">
          <ScrollView
            className="flex-1"
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={false}
          >
            <Animated.View entering={FadeIn.duration(500)} className="items-center mt-8">
              <View accessibilityElementsHidden>
                <Mascot size={92} mood="curious" animate />
              </View>
            </Animated.View>

            <Animated.View entering={FadeIn.delay(100).duration(400)} className="mt-5">
              <Text variant="heading" className="text-center text-foreground">
                {I18n.t('onboarding.bootstrap.choose_title')}
              </Text>
              <Text variant="friendly" tone="secondary" className="text-center mt-2 px-2">
                {I18n.t('onboarding.bootstrap.choose_subtitle')}
              </Text>
            </Animated.View>

            <Animated.View entering={FadeIn.delay(250).duration(400)} className="mt-7 gap-3">
              {/* Import option */}
              <Pressable
                onPress={() => {
                  void triggerHaptic('selection');
                  onChoiceChange('import');
                }}
                accessibilityRole="button"
                accessibilityLabel={I18n.t('onboarding.bootstrap.import_option_title')}
                accessibilityState={{ selected: choice === 'import' }}
              >
                <Card
                  className={cn(
                    'border-2',
                    choice === 'import' ? 'border-primary/40' : 'border-transparent',
                  )}
                >
                  <CardContent className="py-5 flex-row items-start gap-3.5">
                    <View className="w-11 h-11 rounded-2xl border border-border/30 bg-white items-center justify-center mt-0.5 overflow-hidden">
                      <Image
                        source={MONEY_MANAGER_REALBYTE_LOGO}
                        contentFit="contain"
                        style={styles.importBrandLogo}
                      />
                    </View>
                    <View className="flex-1">
                      <Text variant="subheading" className="text-foreground">
                        {I18n.t('onboarding.bootstrap.import_option_title')}
                      </Text>
                      <Text variant="label" tone="muted" className="mt-1">
                        {I18n.t('onboarding.bootstrap.import_option_subtitle')}
                      </Text>
                      <Text variant="label" className="mt-2 text-primary">
                        {I18n.t('onboarding.bootstrap.import_option_brand')}
                      </Text>
                    </View>
                  </CardContent>
                </Card>
              </Pressable>

              {/* Fresh option */}
              <Pressable
                onPress={() => {
                  void triggerHaptic('selection');
                  onChoiceChange('fresh');
                }}
                accessibilityRole="button"
                accessibilityLabel={I18n.t('onboarding.bootstrap.fresh_option_title')}
                accessibilityState={{ selected: choice === 'fresh' }}
              >
                <Card
                  className={cn(
                    'border-2',
                    choice === 'fresh' ? 'border-primary/40' : 'border-transparent',
                  )}
                >
                  <CardContent className="py-5 flex-row items-start gap-3.5">
                    <View className="w-11 h-11 rounded-full bg-accent/15 items-center justify-center mt-0.5">
                      <Text style={styles.freshOptionEmoji}>✨</Text>
                    </View>
                    <View className="flex-1">
                      <Text variant="subheading" className="text-foreground">
                        {I18n.t('onboarding.bootstrap.fresh_option_title')}
                      </Text>
                      <Text variant="label" tone="muted" className="mt-1">
                        {I18n.t('onboarding.bootstrap.fresh_option_subtitle')}
                      </Text>
                    </View>
                  </CardContent>
                </Card>
              </Pressable>
            </Animated.View>
          </ScrollView>

          <OnboardingActionBar
            onBack={() => {
              void triggerHaptic('selection');
              onBack();
            }}
            onPrimary={handleContinue}
            primaryLabel={I18n.t('common.continue')}
            primaryDisabled={!choice}
          />

          {/* Import loading modal */}
          <ThemeModal visible={isImporting} transparent animationType="fade">
            <View className="flex-1 bg-foreground/35 items-center justify-center px-6">
              <View className="w-full max-w-[360px] rounded-[24px] border border-border/35 bg-card px-6 py-7 items-center">
                <ActivityIndicator size="large" color={themeColors.primary} />
                <Text variant="subheading" className="mt-4 text-center text-foreground">
                  {I18n.t('onboarding.bootstrap.importing_title')}
                </Text>
                <Text variant="friendly" tone="secondary" className="mt-1 text-center">
                  {I18n.t('onboarding.bootstrap.importing_subtitle')}
                </Text>
              </View>
            </View>
          </ThemeModal>
        </View>
      </GestureDetector>
    );
  }

  // === IMPORT RESULT VIEW ===
  if (view === 'import-result' && importResult) {
    return (
      <GestureDetector gesture={swipeBackGesture}>
        <View className="flex-1">
          <ScrollView
            className="flex-1"
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={false}
          >
            <Animated.View entering={FadeIn.duration(500)} className="items-center mt-8">
              <View accessibilityElementsHidden>
                <Mascot size={92} mood="proud" animate />
              </View>
            </Animated.View>

            <Animated.View entering={FadeIn.delay(100).duration(400)} className="mt-5">
              <Text variant="heading" className="text-center text-foreground">
                {I18n.t('onboarding.bootstrap.import_complete_title')}
              </Text>
              <Text variant="friendly" tone="secondary" className="text-center mt-2">
                {I18n.t('onboarding.bootstrap.import_complete_subtitle')}
              </Text>
            </Animated.View>

            <Animated.View entering={FadeIn.delay(250).duration(500)} className="mt-7">
              <Card className="border border-success/25">
                <CardContent className="py-5">
                  <View className="flex-row flex-wrap gap-2">
                    <ImportStatPill
                      label={I18n.t('onboarding.bootstrap.accounts')}
                      value={importResult.accounts}
                      tone="default"
                    />
                    <ImportStatPill
                      label={I18n.t('onboarding.bootstrap.categories')}
                      value={importResult.categories}
                      tone="default"
                    />
                    <ImportStatPill
                      label={I18n.t('onboarding.bootstrap.transactions')}
                      value={importResult.transactions}
                      tone="success"
                    />
                    <ImportStatPill
                      label={I18n.t('onboarding.bootstrap.transfers')}
                      value={importResult.transfers}
                      tone="success"
                    />
                    <ImportStatPill
                      label={I18n.t('onboarding.bootstrap.recurring')}
                      value={importResult.recurringRules}
                      tone="success"
                    />
                    {importResult.skipped > 0 && (
                      <ImportStatPill
                        label={I18n.t('onboarding.bootstrap.skipped')}
                        value={importResult.skipped}
                        tone="warn"
                      />
                    )}
                  </View>
                  <Text variant="friendly" tone="secondary" className="mt-4">
                    {I18n.t('onboarding.bootstrap.import_ready')}
                  </Text>
                </CardContent>
              </Card>
            </Animated.View>
          </ScrollView>

          <OnboardingActionBar
            onBack={() => {
              void triggerHaptic('selection');
              onViewChange('choose');
            }}
            onPrimary={() => {
              void triggerHaptic('success');
              onFinish();
            }}
            primaryLabel={I18n.t('onboarding.bootstrap.finish_setup')}
          />
        </View>
      </GestureDetector>
    );
  }

  // === FRESH CHECKLIST VIEW ===
  return (
    <GestureDetector gesture={swipeBackGesture}>
      <View className="flex-1">
        <ScrollView
          className="flex-1"
          contentContainerStyle={styles.checklistContentContainer}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View entering={FadeIn.duration(400)} className="mt-6">
            <Text variant="heading" className="text-center text-foreground">
              {I18n.t('onboarding.bootstrap.checklist_title')}
            </Text>
            <Text variant="friendly" tone="secondary" className="text-center mt-2">
              {I18n.t('onboarding.bootstrap.checklist_subtitle')}
            </Text>
          </Animated.View>

          {/* Progress */}
          <Animated.View entering={FadeIn.delay(100).duration(400)} className="mt-5 items-center">
            <View className="rounded-full bg-primary/10 px-4 py-1.5">
              <Text variant="caption" className="text-primary">
                {I18n.t('onboarding.bootstrap.complete_of_total', {
                  count: completedCount,
                  total: 4,
                })}
              </Text>
            </View>
          </Animated.View>

          {canCreateMinimalDefaults ? (
            <Animated.View entering={FadeIn.delay(130).duration(400)} className="mt-4">
              <Card className="border border-border/40">
                <CardContent className="py-4">
                  <Text variant="caption" className="text-foreground">
                    {I18n.t('onboarding.bootstrap.quick_start_title')}
                  </Text>
                  <Text variant="label" tone="muted" className="mt-1">
                    {I18n.t('onboarding.bootstrap.quick_start_subtitle')}
                  </Text>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="mt-3 self-start"
                    onPress={() => {
                      void triggerHaptic('selection');
                      onCreateMinimalDefaults();
                    }}
                  >
                    <Text>{I18n.t('onboarding.bootstrap.create_minimal_setup')}</Text>
                  </Button>
                </CardContent>
              </Card>
            </Animated.View>
          ) : null}

          {/* Checklist items */}
          <View className="mt-5 gap-3">
            <Animated.View entering={FadeIn.delay(150).duration(400)}>
              <ChecklistItem
                emoji="🏦"
                title={I18n.t('onboarding.bootstrap.accounts_item_title')}
                required
                description={I18n.t('onboarding.bootstrap.accounts_item_description')}
                isComplete={hasAccount}
                completeText={I18n.t(
                  accountCount === 1
                    ? 'onboarding.bootstrap.accounts_ready_one'
                    : 'onboarding.bootstrap.accounts_ready_other',
                  { count: accountCount },
                )}
                actionLabel={I18n.t('onboarding.bootstrap.review_accounts')}
                onAction={() => {
                  void triggerHaptic('selection');
                  onGoToAccounts();
                }}
              />
            </Animated.View>

            <Animated.View entering={FadeIn.delay(250).duration(400)}>
              <ChecklistItem
                emoji="📂"
                title={I18n.t('onboarding.bootstrap.expense_categories_title')}
                description={I18n.t('onboarding.bootstrap.expense_categories_description')}
                isComplete={hasExpenseCategory}
                completeText={I18n.t(
                  expenseCategoryCount === 1
                    ? 'onboarding.bootstrap.expense_categories_ready_one'
                    : 'onboarding.bootstrap.expense_categories_ready_other',
                  { count: expenseCategoryCount },
                )}
                actionLabel={I18n.t('onboarding.bootstrap.review_categories')}
                onAction={() => {
                  void triggerHaptic('selection');
                  onGoToCategories();
                }}
              />
            </Animated.View>

            <Animated.View entering={FadeIn.delay(350).duration(400)}>
              <ChecklistItem
                emoji="💰"
                title={I18n.t('onboarding.bootstrap.income_categories_title')}
                description={I18n.t('onboarding.bootstrap.income_categories_description')}
                isComplete={hasIncomeCategory}
                completeText={I18n.t(
                  incomeCategoryCount === 1
                    ? 'onboarding.bootstrap.income_categories_ready_one'
                    : 'onboarding.bootstrap.income_categories_ready_other',
                  { count: incomeCategoryCount },
                )}
                actionLabel={I18n.t('onboarding.bootstrap.review_categories')}
                onAction={() => {
                  void triggerHaptic('selection');
                  onGoToCategories();
                }}
              />
            </Animated.View>

            <Animated.View entering={FadeIn.delay(450).duration(400)}>
              <ChecklistItem
                emoji="📝"
                title={I18n.t('onboarding.bootstrap.first_tx_title')}
                description={I18n.t('onboarding.bootstrap.first_tx_description')}
                isComplete={hasTransaction}
                completeText={I18n.t('onboarding.bootstrap.tx_logged')}
                actionLabel={I18n.t('onboarding.bootstrap.add_transaction')}
                onAction={() => {
                  void triggerHaptic('selection');
                  onAddTransaction();
                }}
              />
            </Animated.View>
          </View>
        </ScrollView>

        <OnboardingActionBar
          onBack={() => {
            void triggerHaptic('selection');
            onViewChange('choose');
          }}
          onPrimary={() => {
            void triggerHaptic('success');
            onFinish();
          }}
          primaryLabel={I18n.t('onboarding.bootstrap.finish_setup')}
          primaryDisabled={!canFinishFresh}
          extraContent={
            !canFinishFresh ? (
              <Pressable
                onPress={handleSkipFresh}
                className="items-center py-2"
                accessibilityRole="button"
                accessibilityLabel={I18n.t('onboarding.bootstrap.skip_requirements_a11y')}
              >
                <Text variant="caption" tone="muted">
                  {I18n.t('onboarding.bootstrap.skip_for_now')}
                </Text>
              </Pressable>
            ) : null
          }
        />
      </View>
    </GestureDetector>
  );
}

// --- Sub-components ---

function ChecklistItem({
  emoji,
  title,
  description,
  required,
  isComplete,
  completeText,
  actionLabel,
  onAction,
}: {
  emoji: string;
  title: string;
  description: string;
  required?: boolean;
  isComplete: boolean;
  completeText: string;
  actionLabel: string;
  onAction: () => void;
}) {
  const themeColors = useThemeColors();
  return (
    <Card
      className={cn('border', isComplete ? 'border-success/30' : 'border-border/40')}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: isComplete }}
      accessibilityLabel={I18n.t('onboarding.bootstrap.checklist_a11y', {
        title,
        status: required
          ? I18n.t('onboarding.bootstrap.status_required')
          : I18n.t('onboarding.bootstrap.status_optional'),
      })}
    >
      <CardContent className="py-4">
        <View className="flex-row items-center gap-3">
          {/* Status indicator */}
          <View
            className={cn(
              'w-9 h-9 rounded-full items-center justify-center',
              isComplete ? 'bg-success/15' : 'bg-primary/8',
            )}
          >
            {isComplete ? (
              <Check size={16} color={themeColors.success} strokeWidth={3} />
            ) : (
              <Text style={styles.checklistEmoji}>{emoji}</Text>
            )}
          </View>

          <View className="flex-1">
            {isComplete ? (
              <View>
                <Text variant="caption" className="text-foreground">
                  {title}
                </Text>
                <Text variant="caption" tone="success" className="mt-0.5">
                  {completeText}
                </Text>
              </View>
            ) : (
              <View>
                <View className="flex-row items-center gap-2">
                  <Text variant="caption" className="text-foreground">
                    {title}
                  </Text>
                  {required && (
                    <View className="rounded-full bg-primary/10 px-2 py-0.5">
                      <Text variant="label" tone="primary" style={styles.requiredBadgeText}>
                        {I18n.t('onboarding.bootstrap.required_badge')}
                      </Text>
                    </View>
                  )}
                </View>
                <Text variant="label" tone="muted" className="mt-1">
                  {description}
                </Text>
                <Button variant="outline" size="sm" className="mt-3 self-start" onPress={onAction}>
                  <Text>{actionLabel}</Text>
                </Button>
              </View>
            )}
          </View>
        </View>
      </CardContent>
    </Card>
  );
}

function ImportStatPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'default' | 'success' | 'warn';
}) {
  const toneClass =
    tone === 'success'
      ? 'bg-success/12 border-success/35'
      : tone === 'warn'
        ? 'bg-secondary/65 border-border/30'
        : 'bg-primary/10 border-primary/25';

  return (
    <View className={cn('min-w-[108px] flex-1 rounded-[14px] border px-3 py-2', toneClass)}>
      <Text variant="label" tone="muted">
        {label}
      </Text>
      <Text variant="caption" className="mt-0.5 text-foreground">
        {value}
      </Text>
    </View>
  );
}
