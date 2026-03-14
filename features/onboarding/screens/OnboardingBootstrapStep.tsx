import { Image } from 'expo-image';
import React, { useEffect } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Card, CardContent, Text, ThemeModal } from '~/components/ui';
import { OnboardingActionBar } from '~/features/onboarding/components/OnboardingActionBar';
import { OnboardingChoiceCard } from '~/features/onboarding/components/OnboardingChoiceCard';
import { OnboardingStepHeader } from '~/features/onboarding/components/OnboardingStepHeader';
import {
  ONBOARDING_ACTION_BAR_RESERVED_SPACE,
  ONBOARDING_HORIZONTAL_PADDING,
} from '~/features/onboarding/constants/layout';
import { useEdgeSwipeBack } from '~/hooks/useEdgeSwipeBack';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { MMImportSummary } from '~/services/mmbakImportService';
import { cn } from '~/utils';

export type BootstrapChoice = 'import' | 'fresh';
export type BootstrapView = 'choose' | 'import-result';

const MONEY_MANAGER_REALBYTE_LOGO = require('../../../assets/brands/money-manager-realbyte-logo.png');

const styles = StyleSheet.create({
  contentContainer: {
    paddingHorizontal: ONBOARDING_HORIZONTAL_PADDING,
    paddingBottom: ONBOARDING_ACTION_BAR_RESERVED_SPACE,
  },
  importLogoShell: {
    width: 56,
    height: 56,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  importLogo: {
    width: 40,
    height: 40,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
});

interface OnboardingBootstrapStepProps {
  onBack: () => void;
  onImport: () => void;
  onStartFresh: () => void;
  onFinish: () => void;
  onClearImportResult: () => void;
  choice: BootstrapChoice | null;
  view: BootstrapView;
  onChoiceChange: (choice: BootstrapChoice) => void;
  onViewChange: (view: BootstrapView) => void;
  importResult: MMImportSummary | null;
  isImporting: boolean;
}

export function OnboardingBootstrapStep({
  onBack,
  onImport,
  onStartFresh,
  onFinish,
  onClearImportResult,
  choice,
  view,
  onChoiceChange,
  onViewChange,
  importResult,
  isImporting,
}: OnboardingBootstrapStepProps) {
  const themeColors = useThemeColors();
  const swipeBackGesture = useEdgeSwipeBack(onBack);

  const handleContinue = () => {
    if (choice === 'import') {
      onImport();
      return;
    }

    if (choice === 'fresh') {
      onStartFresh();
    }
  };

  useEffect(() => {
    if (importResult && view !== 'import-result') {
      onViewChange('import-result');
    }
  }, [importResult, onViewChange, view]);

  if (view === 'choose') {
    return (
      <GestureDetector gesture={swipeBackGesture}>
        <View className="flex-1">
          <ScrollView
            className="flex-1"
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={false}
          >
            <OnboardingStepHeader
              title={I18n.t('onboarding.bootstrap.choose_title')}
              subtitle={I18n.t('onboarding.bootstrap.choose_subtitle')}
            />

            <Animated.View entering={FadeIn.delay(150).duration(300)} className="mt-8 gap-4">
              <OnboardingChoiceCard
                title={I18n.t('onboarding.bootstrap.import_option_title')}
                description={I18n.t('onboarding.bootstrap.import_option_subtitle')}
                selected={choice === 'import'}
                centered
                icon={
                  <View
                    style={[
                      styles.importLogoShell,
                      { backgroundColor: `${themeColors.surface}F0` },
                    ]}
                  >
                    <Image
                      source={MONEY_MANAGER_REALBYTE_LOGO}
                      contentFit="contain"
                      style={styles.importLogo}
                    />
                  </View>
                }
                onPress={() => {
                  void triggerHaptic('selection');
                  onChoiceChange('import');
                }}
                accessibilityLabel={I18n.t('onboarding.bootstrap.import_option_title')}
              />

              <OnboardingChoiceCard
                title={I18n.t('onboarding.bootstrap.fresh_option_title')}
                description={I18n.t('onboarding.bootstrap.fresh_option_subtitle')}
                selected={choice === 'fresh'}
                centered
                onPress={() => {
                  void triggerHaptic('selection');
                  onChoiceChange('fresh');
                }}
                accessibilityLabel={I18n.t('onboarding.bootstrap.fresh_option_title')}
              />
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

  if (view === 'import-result' && importResult) {
    return (
      <GestureDetector gesture={swipeBackGesture}>
        <View className="flex-1">
          <ScrollView
            className="flex-1"
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={false}
          >
            <OnboardingStepHeader
              title={I18n.t('onboarding.bootstrap.import_complete_title')}
              subtitle={I18n.t('onboarding.bootstrap.import_complete_subtitle')}
            />

            <Animated.View entering={FadeIn.delay(150).duration(300)} className="mt-8">
              <Card className="border border-success/25">
                <CardContent className="py-5">
                  <View style={styles.statsGrid}>
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
                    {importResult.skipped > 0 ? (
                      <ImportStatPill
                        label={I18n.t('onboarding.bootstrap.skipped')}
                        value={importResult.skipped}
                        tone="warn"
                      />
                    ) : null}
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
              onClearImportResult();
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

  return null;
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
