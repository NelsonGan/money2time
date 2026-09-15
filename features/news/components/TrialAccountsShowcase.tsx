import { Gift, Wallet } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { Text } from '~/components/ui';
import { PRO_LIMITS } from '~/constants/proLimits';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';

interface TrialAccountsShowcaseProps {
  kind: 'trial' | 'accounts';
  width: number;
}

/** A compact, theme-aware preview: no fixed trial duration or store price is promised here. */
export function TrialAccountsShowcase({ kind, width }: TrialAccountsShowcaseProps) {
  const colors = useThemeColors();

  if (kind === 'trial') {
    return (
      <View
        className="items-center rounded-[24px] border border-border/30 bg-card px-5 py-5 shadow-soft"
        style={{ width }}
      >
        <View className="h-16 w-16 items-center justify-center rounded-[20px] bg-primary/10">
          <Gift size={29} color={colors.primary} strokeWidth={2.2} />
        </View>
        <Text variant="label" tone="primary" className="mt-4">
          {I18n.t('pro.pro_title')}
        </Text>
        <Text variant="subheading" className="mt-1 text-center">
          {I18n.t('pro.trial_cta')}
        </Text>
      </View>
    );
  }

  return (
    <View
      className="items-center rounded-[24px] border border-border/30 bg-card px-5 py-5 shadow-soft"
      style={{ width }}
    >
      <Text variant="label" tone="muted">
        {I18n.t('pro.free_title')}
      </Text>
      <View className="mt-1 flex-row items-end gap-2">
        <Text variant="display" tone="success">
          {PRO_LIMITS.FREE_MAX_ACCOUNTS}
        </Text>
        <Text variant="bodyStrong" className="pb-1">
          {I18n.t('pro.accounts_label')}
        </Text>
      </View>
      <View className="mt-4 flex-row flex-wrap justify-center gap-2">
        {Array.from({ length: PRO_LIMITS.FREE_MAX_ACCOUNTS }, (_, index) => (
          <View
            key={index}
            className="h-9 w-9 items-center justify-center rounded-xl border border-success/20 bg-success/10"
          >
            <Wallet size={17} color={colors.success} strokeWidth={2} />
          </View>
        ))}
      </View>
    </View>
  );
}
